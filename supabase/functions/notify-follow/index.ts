import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Types
// ============================================================================

interface NotifyFollowBody {
  following_id: string; // The user who was followed (receives the notification)
}

// ============================================================================
// Main Handler
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

    // Authenticate user (the follower)
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

    // Parse request body
    const { following_id }: NotifyFollowBody = await req.json();

    if (!following_id || typeof following_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid following_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Cannot notify yourself
    if (user.id === following_id) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch follower's profile for notification body
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single();

    const followerName = profile?.full_name ?? profile?.username ?? 'Someone';

    // Create in-app notification for the person being followed
    const { error: notifError } = await adminClient
      .from('notifications')
      .insert({
        user_id: following_id,
        actor_id: user.id,
        type: 'follow',
        data: { follower_id: user.id },
        read: false,
      });

    if (notifError) {
      console.error('[notify-follow] Notification insert error:', notifError);
      // Log but continue — push can still be attempted
    }

    // Fire-and-forget push notification to the followed user
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
            user_ids: [following_id],
            title: 'New follower',
            body: `${followerName} started following you`,
            data: { url: `/user/${user.id}` },
            feature: 'social',
            channel_id: 'social',
          }),
        }
      );
    } catch (err) {
      console.error('[push] Failed to send push notification:', err);
      // Never throw — push failure must not fail the parent operation
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[notify-follow] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
