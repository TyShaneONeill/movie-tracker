import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

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

    // Cap how many ad credits can be earned per day. Without this, any authenticated
    // caller can loop this endpoint to mint unlimited rewarded_ad_credits — each one
    // redeemable in generate-journey-art for an AI image generation (real Gemini/OpenAI
    // cost), which has NO independent daily cap of its own. Fail-closed: if the limiter
    // is unavailable we deny rather than risk unbounded spend. (dev tier bypasses inside
    // check_rate_limit.) 10/day comfortably covers legitimate rewarded-ad watching.
    const rateLimitResponse = await enforceRateLimit(
      user.id,
      'grant_ad_reward',
      10,
      86400,
      req,
      { failClosed: true },
    );
    if (rateLimitResponse) return rateLimitResponse;

    // Increment rewarded_ad_credits for the user
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profileData, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('rewarded_ad_credits')
      .eq('id', user.id)
      .single();

    if (fetchError || !profileData) {
      throw new Error('Failed to fetch profile');
    }

    const newCredits = (profileData.rewarded_ad_credits ?? 0) + 1;

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ rewarded_ad_credits: newCredits })
      .eq('id', user.id);

    if (updateError) {
      throw new Error('Failed to grant ad credit');
    }

    return new Response(
      JSON.stringify({ success: true, creditsRemaining: newCredits }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error granting ad reward:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
