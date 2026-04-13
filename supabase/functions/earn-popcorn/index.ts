import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const ALLOWED_TYPES = new Set([
  'follow', 'like', 'add_title', 'first_take', 'comment', 'mark_watched',
]);

// Simple deterministic hash (FNV-1a variant) — produces a positive 32-bit int
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 120 earn calls per hour per user
    const rateLimited = await enforceRateLimit(user.id, 'earn_popcorn', 120, 3600, req);
    if (rateLimited) return rateLimited;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action_type, reference_id } = await req.json();

    if (!action_type || !ALLOWED_TYPES.has(action_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action_type' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const kernelId = crypto.randomUUID();
    const seed = hashString(kernelId);

    const { data, error: insertError } = await adminClient
      .from('user_popcorn')
      .insert({
        id: kernelId,
        user_id: user.id,
        action_type,
        reference_id: reference_id ?? null,
        seed,
        is_milestone: false,
      })
      .select()
      .single();

    // Duplicate — already earned for this reference_id (unique constraint)
    if (insertError?.code === '23505') {
      return new Response(
        JSON.stringify({ earned: false, kernel: null }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ earned: true, kernel: data }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[earn-popcorn] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
