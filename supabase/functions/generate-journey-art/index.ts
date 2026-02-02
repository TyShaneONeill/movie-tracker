import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowed domains for poster URLs (SSRF protection)
const ALLOWED_POSTER_DOMAINS = [
  'image.tmdb.org',
];

function isAllowedPosterUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_POSTER_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// Types
interface GenerateArtRequest {
  journeyId: string;
  movieTitle: string;
  genres: string[];
  posterUrl: string;
}

interface GenerateArtResponse {
  success: boolean;
  imageUrl?: string;
  rarity?: 'common' | 'holographic';
  error?: string;
}

interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

// Roll for rarity (3% holographic)
function rollForRarity(): 'common' | 'holographic' {
  const roll = Math.random();
  return roll < 0.03 ? 'holographic' : 'common';
}

// Convert base64 data URL to Uint8Array for storage upload
function base64ToUint8Array(base64DataUrl: string): Uint8Array {
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Upload image to Supabase Storage and return public URL
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  journeyId: string,
  imageData: string | Uint8Array
): Promise<string> {
  const filePath = `${userId}/${journeyId}.png`;

  // Convert to Uint8Array if it's a base64 data URL
  const imageBytes = typeof imageData === 'string'
    ? base64ToUint8Array(imageData)
    : imageData;

  console.log(`Uploading image to storage: ${filePath} (${imageBytes.length} bytes)`);

  const { error: uploadError } = await supabase.storage
    .from('journey-art')
    .upload(filePath, imageBytes, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('journey-art')
    .getPublicUrl(filePath);

  console.log(`Image uploaded, public URL: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}

// Generate image using style transfer with gpt-image-1.5 (optimized for style transfer)
async function generateStyleTransfer(
  posterUrl: string,
  apiKey: string
): Promise<string> {
  console.log(`Fetching poster from: ${posterUrl}`);

  // Fetch the poster image
  const imageResponse = await fetch(posterUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch poster image: ${imageResponse.status}`);
  }

  const imageArrayBuffer = await imageResponse.arrayBuffer();
  const imageBlob = new Blob([imageArrayBuffer], { type: 'image/png' });
  console.log(`Fetched poster, size: ${imageBlob.size} bytes`);

  // Simple prompt that works (like ChatGPT web)
  const formData = new FormData();
  formData.append('model', 'gpt-image-1.5');
  formData.append('image', imageBlob, 'poster.png');
  formData.append('prompt', 'Could you recreate this with a cartoon style?');
  formData.append('size', '1024x1024');
  formData.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('OpenAI style transfer error:', errorData);
    throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.data?.[0]?.b64_json) {
    return `data:image/png;base64,${result.data[0].b64_json}`;
  }
  if (result.data?.[0]?.url) {
    return result.data[0].url;
  }
  throw new Error('No image returned from OpenAI');
}

// Apply holographic effect to an already-generated cartoon image
async function applyHolographicEffect(
  cartoonImageBase64: string,
  apiKey: string
): Promise<string> {
  console.log('Applying holographic effect...');

  // Convert base64 to blob
  const base64Data = cartoonImageBase64.replace('data:image/png;base64,', '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const imageBlob = new Blob([bytes], { type: 'image/png' });

  const formData = new FormData();
  formData.append('model', 'gpt-image-1.5');
  formData.append('image', imageBlob, 'cartoon.png');
  formData.append('prompt', 'Make this cartoon style movie poster look like a rare holographic trading card pull. Add holographic shimmer and rainbow effects.');
  formData.append('size', '1024x1024');
  formData.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('OpenAI holographic effect error:', errorData);
    throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.data?.[0]?.b64_json) {
    return `data:image/png;base64,${result.data[0].b64_json}`;
  }
  if (result.data?.[0]?.url) {
    return result.data[0].url;
  }
  throw new Error('No image returned from OpenAI');
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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error('Missing API configuration - ensure OPENAI_API_KEY is set');
    }

    // Validate authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: GenerateArtRequest = await req.json();
    const { journeyId, movieTitle, genres, posterUrl } = body;

    if (!journeyId || !movieTitle) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: journeyId and movieTitle' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Rate limiting: Max 10 AI generations per user per day
    const RATE_LIMIT_MAX = 10;
    const RATE_LIMIT_WINDOW_HOURS = 24;

    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - RATE_LIMIT_WINDOW_HOURS);

    const { count: recentGenerations, error: countError } = await supabaseAdmin
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('ai_poster_url', 'is', null)
      .gte('journey_updated_at', windowStart.toISOString());

    if (countError) {
      console.error('Rate limit check error:', countError);
      // Continue anyway - don't block legitimate users due to check failure
    } else if (recentGenerations !== null && recentGenerations >= RATE_LIMIT_MAX) {
      console.warn(`Rate limit exceeded for user ${user.id}: ${recentGenerations} generations in ${RATE_LIMIT_WINDOW_HOURS}h`);
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} AI art generations per ${RATE_LIMIT_WINDOW_HOURS} hours.`
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the journey belongs to this user
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('user_movies')
      .select('id, user_id, ai_poster_url')
      .eq('id', journeyId)
      .single();

    if (journeyError || !journey) {
      return new Response(
        JSON.stringify({ error: 'Journey not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (journey.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized to modify this journey' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already has AI poster (prevent re-generation for now)
    if (journey.ai_poster_url) {
      return new Response(
        JSON.stringify({ error: 'AI poster already generated for this journey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Roll for rarity
    const rarity = rollForRarity();
    console.log(`Rarity roll: ${rarity} for journey ${journeyId}`);

    // Require posterUrl for style transfer
    if (!posterUrl) {
      return new Response(
        JSON.stringify({ error: 'Poster URL is required for AI art generation' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SSRF Protection: Only allow TMDB poster URLs
    if (!isAllowedPosterUrl(posterUrl)) {
      console.warn(`Blocked disallowed poster URL: ${posterUrl}`);
      return new Response(
        JSON.stringify({ error: 'Invalid poster URL. Only TMDB images are allowed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using style transfer with simple prompt');

    // Step 1: Generate cartoon version (returns base64 data URL)
    let imageDataUrl = await generateStyleTransfer(posterUrl, OPENAI_API_KEY);
    console.log('Generated cartoon version');

    // Step 2: If holographic, apply holographic effect
    if (rarity === 'holographic') {
      console.log('Applying holographic effect for rare pull');
      imageDataUrl = await applyHolographicEffect(imageDataUrl, OPENAI_API_KEY);
      console.log('Applied holographic effect');
    }

    // Step 3: Upload to Supabase Storage instead of storing base64 in database
    const publicUrl = await uploadToStorage(supabaseAdmin, user.id, journeyId, imageDataUrl);
    console.log(`Image uploaded to storage: ${publicUrl}`);

    // Update journey record with storage URL (not base64)
    const { error: updateError } = await supabaseAdmin
      .from('user_movies')
      .update({
        ai_poster_url: publicUrl,
        ai_poster_rarity: rarity,
        display_poster: 'ai_generated',
        journey_updated_at: new Date().toISOString(),
      })
      .eq('id', journeyId);

    if (updateError) {
      console.error('Failed to update journey:', updateError);
      // Still return success since image was uploaded to storage
    }

    const response: GenerateArtResponse = {
      success: true,
      imageUrl: publicUrl,
      rarity,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error generating journey art:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate art'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
