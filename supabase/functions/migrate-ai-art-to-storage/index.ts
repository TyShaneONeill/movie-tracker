import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
}

// Convert base64 data URL to Uint8Array
function base64ToUint8Array(base64DataUrl: string): Uint8Array {
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    // Validate authorization (require service role or admin)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all journeys with base64 AI posters
    const { data: journeys, error: fetchError } = await supabaseAdmin
      .from('user_movies')
      .select('id, user_id, ai_poster_url')
      .like('ai_poster_url', 'data:image%');

    if (fetchError) {
      throw new Error(`Failed to fetch journeys: ${fetchError.message}`);
    }

    console.log(`Found ${journeys?.length || 0} journeys with base64 AI posters to migrate`);

    const result: MigrationResult = {
      success: true,
      migrated: 0,
      failed: 0,
      errors: [],
    };

    if (!journeys || journeys.length === 0) {
      return new Response(JSON.stringify({
        ...result,
        message: 'No base64 images found to migrate',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Process each journey
    for (const journey of journeys) {
      try {
        console.log(`Migrating journey ${journey.id}...`);

        // Convert base64 to bytes
        const imageBytes = base64ToUint8Array(journey.ai_poster_url);
        const filePath = `${journey.user_id}/${journey.id}.png`;

        console.log(`Uploading ${imageBytes.length} bytes to ${filePath}`);

        // Upload to storage
        const { error: uploadError } = await supabaseAdmin.storage
          .from('journey-art')
          .upload(filePath, imageBytes, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('journey-art')
          .getPublicUrl(filePath);

        // Update database with storage URL
        const { error: updateError } = await supabaseAdmin
          .from('user_movies')
          .update({ ai_poster_url: urlData.publicUrl })
          .eq('id', journey.id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        console.log(`Successfully migrated journey ${journey.id} to ${urlData.publicUrl}`);
        result.migrated++;

      } catch (error) {
        const errorMsg = `Journey ${journey.id}: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
        result.failed++;
      }
    }

    result.success = result.failed === 0;

    return new Response(JSON.stringify({
      ...result,
      message: `Migration complete. Migrated: ${result.migrated}, Failed: ${result.failed}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Migration error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Migration failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
