import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface LikeReviewRequest {
  target_type: 'review' | 'first_take';
  target_id: string;
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

    // Authenticate user
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

    // Rate limit: 200 likes per hour
    const rateLimited = await enforceRateLimit(user.id, 'like_review', 200, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { target_type, target_id }: LikeReviewRequest = await req.json();

    if (!target_type || !['review', 'first_take'].includes(target_type)) {
      return new Response(
        JSON.stringify({ error: 'target_type must be "review" or "first_take"' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (!target_id || typeof target_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid target_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine which column to use based on target_type
    const idColumn = target_type === 'review' ? 'review_id' : 'first_take_id';
    const targetTable = target_type === 'review' ? 'reviews' : 'first_takes';

    // Check if the target content exists and get its author
    const { data: targetContent, error: targetError } = await adminClient
      .from(targetTable)
      .select('id, user_id, movie_title, tmdb_id')
      .eq('id', target_id)
      .single();

    if (targetError || !targetContent) {
      return new Response(
        JSON.stringify({ error: `${target_type} not found` }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Check if like already exists
    const { data: existingLike, error: likeCheckError } = await adminClient
      .from('review_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq(idColumn, target_id)
      .maybeSingle();

    if (likeCheckError) {
      console.error('[like-review] Like check error:', likeCheckError);
      throw new Error('Failed to check existing like');
    }

    let liked: boolean;

    if (existingLike) {
      // Unlike: delete the existing like
      const { error: deleteError } = await adminClient
        .from('review_likes')
        .delete()
        .eq('id', existingLike.id);

      if (deleteError) {
        console.error('[like-review] Delete error:', deleteError);
        throw new Error('Failed to remove like');
      }

      liked = false;
    } else {
      // Like: insert a new like
      const insertData: Record<string, string> = {
        user_id: user.id,
        [idColumn]: target_id,
      };

      const { error: insertError } = await adminClient
        .from('review_likes')
        .insert(insertData);

      if (insertError) {
        console.error('[like-review] Insert error:', insertError);
        throw new Error('Failed to add like');
      }

      liked = true;

      // Create notification for the content author (skip if self-like)
      if (targetContent.user_id !== user.id) {
        const notificationType = target_type === 'review' ? 'like_review' : 'like_first_take';
        const notificationData: Record<string, string | number> = {
          movie_title: targetContent.movie_title,
          tmdb_id: targetContent.tmdb_id,
        };

        if (target_type === 'review') {
          notificationData.review_id = target_id;
        } else {
          notificationData.first_take_id = target_id;
        }

        const { error: notifError } = await adminClient
          .from('notifications')
          .insert({
            user_id: targetContent.user_id,
            actor_id: user.id,
            type: notificationType,
            data: notificationData,
            read: false,
          });

        if (notifError) {
          // Log but don't fail the like operation over a notification error
          console.error('[like-review] Notification insert error:', notifError);
        }

        // NEW: Send push notification alongside in-app
        // Fire-and-forget — never fail the parent operation over a push error
        try {
          const actorName = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? 'Someone';
          const pushTitle = 'New like';
          const pushBody = notificationType === 'like_review'
            ? `${actorName} liked your review of ${targetContent.movie_title}`
            : `${actorName} liked your First Take on ${targetContent.movie_title}`;

          await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                user_ids: [targetContent.user_id],
                title: pushTitle,
                body: pushBody,
                data: { url: `/movie/${targetContent.tmdb_id}` },
                feature: 'social',
                channel_id: 'social',
              }),
            }
          );
        } catch (err) {
          console.error('[push] Failed to send push notification:', err);
          // Never throw — push failure must not fail the parent operation
        }
      }
    }

    // Fetch the updated like_count from the target table (DB trigger keeps it in sync)
    const { data: updatedContent, error: countError } = await adminClient
      .from(targetTable)
      .select('like_count')
      .eq('id', target_id)
      .single();

    if (countError) {
      console.error('[like-review] Count fetch error:', countError);
      // Still return the liked status even if we can't get the count
      return new Response(
        JSON.stringify({ liked, likeCount: 0 }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ liked, likeCount: updatedContent.like_count }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[like-review] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
