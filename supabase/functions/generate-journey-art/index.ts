import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

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

// Custom error for OpenAI safety rejections
class SafetyRejectionError extends Error {
  constructor() {
    super('This movie poster could not be processed by our AI. Try a different journey.');
    this.name = 'SafetyRejectionError';
  }
}

// Roll for rarity (3% holographic)
function rollForRarity(): 'common' | 'holographic' {
  const roll = Math.random();
  return roll < 0.03 ? 'holographic' : 'common';
}

// Generate image using style transfer with gpt-image-1.5 (OpenAI image editing)
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
  formData.append('size', '1024x1536');
  formData.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || '';
    console.error('OpenAI style transfer error:', errorData);
    if (errorMessage.toLowerCase().includes('safety') || errorMessage.toLowerCase().includes('rejected')) {
      throw new SafetyRejectionError();
    }
    throw new Error(errorMessage || `OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.data?.[0]?.b64_json) {
    return `data:image/png;base64,${result.data[0].b64_json}`;
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
  formData.append('size', '1024x1536');
  formData.append('n', '1');

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || '';
    console.error('OpenAI holographic effect error:', errorData);
    if (errorMessage.toLowerCase().includes('safety') || errorMessage.toLowerCase().includes('rejected')) {
      throw new SafetyRejectionError();
    }
    throw new Error(errorMessage || `OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  if (result.data?.[0]?.b64_json) {
    return `data:image/png;base64,${result.data[0].b64_json}`;
  }
  throw new Error('No image returned from OpenAI');
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

    // Parse request body
    let body: GenerateArtRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }
    const { journeyId, movieTitle, genres, posterUrl } = body;

    if (!journeyId || !movieTitle) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: journeyId and movieTitle' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 10 AI generations per day (dev-tier users are unlimited via RPC)
    const rateLimited = await enforceRateLimit(user.id, 'generate_journey_art', 10, 86400, req);
    if (rateLimited) return rateLimited;

    // Create admin client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the journey belongs to this user
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('user_movies')
      .select('id, user_id, ai_poster_url')
      .eq('id', journeyId)
      .single();

    if (journeyError || !journey) {
      return new Response(
        JSON.stringify({ error: 'Journey not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (journey.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized to modify this journey' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Check if already has AI poster (prevent re-generation for now)
    if (journey.ai_poster_url) {
      return new Response(
        JSON.stringify({ error: 'AI poster already generated for this journey' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Roll for rarity
    const rarity = rollForRarity();
    console.log(`Rarity roll: ${rarity} for journey ${journeyId}`);

    // Require posterUrl for style transfer
    if (!posterUrl) {
      return new Response(
        JSON.stringify({ error: 'Poster URL is required for AI art generation' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // SSRF Protection: Only allow TMDB poster URLs
    if (!isAllowedPosterUrl(posterUrl)) {
      console.warn(`Blocked disallowed poster URL: ${posterUrl}`);
      return new Response(
        JSON.stringify({ error: 'Invalid poster URL. Only TMDB images are allowed.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using style transfer with simple prompt');

    // Step 1: Generate cartoon version (returns base64)
    let imageBase64 = await generateStyleTransfer(posterUrl, OPENAI_API_KEY);
    console.log('Generated cartoon version');

    // Step 2: If holographic, apply holographic effect (takes and returns base64)
    if (rarity === 'holographic') {
      console.log('Applying holographic effect for rare pull');
      imageBase64 = await applyHolographicEffect(imageBase64, OPENAI_API_KEY);
      console.log('Applied holographic effect');
    }

    // Step 3: Upload final image to Storage bucket
    const base64Data = imageBase64.replace('data:image/png;base64,', '');
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filePath = `${user.id}/${journeyId}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('journey-art')
      .upload(filePath, bytes.buffer, {
        contentType: 'image/png',
        cacheControl: '86400',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      throw new Error('Failed to upload generated art to storage');
    }

    // Get public URL from Storage
    const { data: urlData } = supabaseAdmin.storage
      .from('journey-art')
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;
    console.log(`Uploaded to Storage: ${imageUrl}`);

    // Update journey record with Storage URL
    const { error: updateError } = await supabaseAdmin
      .from('user_movies')
      .update({
        ai_poster_url: imageUrl,
        ai_poster_rarity: rarity,
        display_poster: 'ai_generated',
        journey_updated_at: new Date().toISOString(),
      })
      .eq('id', journeyId);

    if (updateError) {
      console.error('Failed to update journey:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save generated art. Please try again.' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const response: GenerateArtResponse = {
      success: true,
      imageUrl,
      rarity,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error generating journey art:', error);

    const status = error instanceof SafetyRejectionError ? 422 : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate art'
      }),
      { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
