import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface GenerateArtRequest {
  journeyId: string;
  movieTitle: string;
  genres: string[];
}

interface GenerateArtResponse {
  success: boolean;
  imageUrl?: string;
  rarity?: 'common' | 'holographic';
  error?: string;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[];
  error?: string;
}

// Roll for rarity (3% holographic)
function rollForRarity(): 'common' | 'holographic' {
  const roll = Math.random();
  return roll < 0.03 ? 'holographic' : 'common';
}

// Build prompt based on rarity
function buildPrompt(movieTitle: string, genres: string[], rarity: 'common' | 'holographic'): string {
  const genreText = genres.length > 0 ? genres.join(', ') : 'Drama';

  const basePrompt = `Create a cartoon/animated style movie poster for "${movieTitle}". Genre: ${genreText}. Style: vibrant cartoon illustration, Pixar-like quality, movie poster composition, high quality digital art. Do not copy the original poster, create an original artistic interpretation.`;

  if (rarity === 'holographic') {
    return `${basePrompt} Make it SPECIAL and EPIC with golden/rainbow holographic elements, sparkles, shimmering effects, premium collector's edition feel, magical glow, celestial energy.`;
  }

  return basePrompt;
}

// Create a prediction on Replicate
async function createPrediction(prompt: string, apiToken: string): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      // Using SDXL model for high quality image generation
      version: 'da77bc59ee60423279fd632efb4795ab731d9e3ca9705ef3341091fb989b7eaf',
      input: {
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, ugly, bad anatomy, text, watermark, signature',
        width: 768,
        height: 1024,
        num_outputs: 1,
        scheduler: 'K_EULER',
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${errorText}`);
  }

  const prediction: ReplicatePrediction = await response.json();
  return prediction.id;
}

// Poll for prediction result
async function getPredictionResult(predictionId: string, apiToken: string): Promise<string> {
  const maxAttempts = 60; // 2 minutes max
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get prediction status: ${response.status}`);
    }

    const prediction: ReplicatePrediction = await response.json();

    if (prediction.status === 'succeeded') {
      if (!prediction.output || prediction.output.length === 0) {
        throw new Error('Prediction succeeded but no output received');
      }
      return prediction.output[0];
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error || 'Image generation failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Image generation timed out');
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
    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!REPLICATE_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error('Missing API configuration');
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
    const { journeyId, movieTitle, genres } = body;

    if (!journeyId || !movieTitle) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: journeyId and movieTitle' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Build the prompt
    const prompt = buildPrompt(movieTitle, genres || [], rarity);
    console.log(`Generating art with prompt: ${prompt.substring(0, 100)}...`);

    // Create prediction on Replicate
    const predictionId = await createPrediction(prompt, REPLICATE_API_TOKEN);
    console.log(`Created Replicate prediction: ${predictionId}`);

    // Poll for result
    const imageUrl = await getPredictionResult(predictionId, REPLICATE_API_TOKEN);
    console.log(`Generated image URL: ${imageUrl}`);

    // Update journey record with AI poster
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
      // Still return success since image was generated
    }

    const response: GenerateArtResponse = {
      success: true,
      imageUrl,
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
