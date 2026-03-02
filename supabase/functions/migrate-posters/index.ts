import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

interface MigrationResult {
  id: string;
  user_id: string;
  title: string;
  status: 'migrated' | 'cleared' | 'failed';
  error?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    // Validate authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate user token
    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Restrict to dev users only
    const DEV_USER_IDS = (Deno.env.get('DEV_USER_IDS') || '').split(',').map(id => id.trim()).filter(Boolean);

    if (!DEV_USER_IDS.includes(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: dev users only' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Migration started by dev user ${user.id}`);

    // Create admin client for database and storage operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: MigrationResult[] = [];

    // --- Step 1: Migrate base64 data URIs to Storage ---
    const { data: base64Rows, error: base64Error } = await supabaseAdmin
      .from('user_movies')
      .select('id, user_id, title, ai_poster_url')
      .like('ai_poster_url', 'data:image%');

    if (base64Error) {
      throw new Error(`Failed to query base64 rows: ${base64Error.message}`);
    }

    console.log(`Found ${base64Rows?.length ?? 0} rows with base64 data URIs`);

    for (const row of base64Rows ?? []) {
      try {
        // Extract the base64 data (strip the data:image/png;base64, prefix)
        const base64Match = row.ai_poster_url.match(/^data:image\/\w+;base64,(.+)$/);
        if (!base64Match) {
          results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: 'Could not parse base64 data URI' });
          continue;
        }

        const base64Data = base64Match[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const storagePath = `${row.user_id}/${row.id}.png`;

        // Upload to journey-art bucket
        const { error: uploadError } = await supabaseAdmin.storage
          .from('journey-art')
          .upload(storagePath, bytes, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: `Upload failed: ${uploadError.message}` });
          continue;
        }

        // Get public URL
        const { data: publicUrlData } = supabaseAdmin.storage
          .from('journey-art')
          .getPublicUrl(storagePath);

        const publicUrl = publicUrlData.publicUrl;

        // Update the row with the Storage URL
        const { error: updateError } = await supabaseAdmin
          .from('user_movies')
          .update({ ai_poster_url: publicUrl })
          .eq('id', row.id);

        if (updateError) {
          results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: `DB update failed: ${updateError.message}` });
          continue;
        }

        console.log(`Migrated ${row.id} (${row.title}) -> ${storagePath}`);
        results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'migrated' });

      } catch (err) {
        console.error(`Error migrating row ${row.id}:`, err);
        results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: err.message });
      }
    }

    // --- Step 2: Clear expired OpenAI URLs ---
    const { data: expiredRows, error: expiredError } = await supabaseAdmin
      .from('user_movies')
      .select('id, user_id, title')
      .like('ai_poster_url', 'https://oaidalleapiprodscus%');

    if (expiredError) {
      throw new Error(`Failed to query expired URL rows: ${expiredError.message}`);
    }

    console.log(`Found ${expiredRows?.length ?? 0} rows with expired OpenAI URLs`);

    for (const row of expiredRows ?? []) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('user_movies')
          .update({
            ai_poster_url: null,
            display_poster: 'original',
          })
          .eq('id', row.id);

        if (updateError) {
          results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: `Clear failed: ${updateError.message}` });
          continue;
        }

        console.log(`Cleared expired URL for ${row.id} (${row.title})`);
        results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'cleared' });

      } catch (err) {
        console.error(`Error clearing row ${row.id}:`, err);
        results.push({ id: row.id, user_id: row.user_id, title: row.title, status: 'failed', error: err.message });
      }
    }

    // Build summary
    const migrated = results.filter(r => r.status === 'migrated').length;
    const cleared = results.filter(r => r.status === 'cleared').length;
    const failed = results.filter(r => r.status === 'failed').length;

    const summary = {
      total: results.length,
      migrated,
      cleared,
      failed,
      results,
    };

    console.log(`Migration complete: ${migrated} migrated, ${cleared} cleared, ${failed} failed`);

    return new Response(JSON.stringify(summary), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Migration error:', error);

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
