import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface SendFollowRequestBody {
  target_id: string;
}

// ============================================================================
// Main Handler
//
// Notifications-only — the follow_request row is inserted client-side.
// This function creates the in-app notification and sends the push.
// Called fire-and-forget; a 401 (web race condition) is silently dropped.
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Authenticate user (the requester)
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUserClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 60 notifications per hour (mirrors the insert rate)
    const rateLimited = await enforceRateLimit(user.id, 'send_follow_request', 60, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { target_id }: SendFollowRequestBody = await req.json();

    if (!target_id || typeof target_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid target_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Cannot notify yourself
    if (user.id === target_id) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch requester's profile for notification body
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single();

    const requesterName = profile?.full_name ?? profile?.username ?? 'Someone';

    // Create in-app notification for the target
    const { error: notifError } = await adminClient
      .from('notifications')
      .insert({
        user_id: target_id,
        actor_id: user.id,
        type: 'follow_request',
        data: { requester_id: user.id },
        read: false,
      });

    if (notifError) {
      console.error('[send-follow-request] Notification insert error:', notifError);
    }

    // Fire-and-forget push notification to target
    try {
      await fetch(
        `${SUPABASE_URL}/functions/v1/send-push-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            user_ids: [target_id],
            title: 'New follow request',
            body: `${requesterName} wants to follow you`,
            data: { url: '/notifications' },
            feature: 'social',
            channel_id: 'social',
          }),
        }
      );
    } catch (err) {
      console.error('[push] Failed to send push notification:', err);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[send-follow-request] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
