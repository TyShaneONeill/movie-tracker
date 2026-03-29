import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface LikeCommentRequest {
  comment_id: string;
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
    const rateLimited = await enforceRateLimit(user.id, 'like_comment', 200, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { comment_id }: LikeCommentRequest = await req.json();

    if (!comment_id || typeof comment_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid comment_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if the comment exists and get its author + associated review/first_take
    const { data: comment, error: commentError } = await adminClient
      .from('review_comments')
      .select('id, user_id, review_id, first_take_id')
      .eq('id', comment_id)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ error: 'Comment not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Check if like already exists
    const { data: existingLike, error: likeCheckError } = await adminClient
      .from('comment_likes')
      .select('id')
      .eq('user_id', user.id)
      .eq('comment_id', comment_id)
      .maybeSingle();

    if (likeCheckError) {
      console.error('[like-comment] Like check error:', likeCheckError);
      throw new Error('Failed to check existing like');
    }

    let liked: boolean;

    if (existingLike) {
      // Unlike: delete the existing like
      const { error: deleteError } = await adminClient
        .from('comment_likes')
        .delete()
        .eq('id', existingLike.id);

      if (deleteError) {
        console.error('[like-comment] Delete error:', deleteError);
        throw new Error('Failed to remove like');
      }

      liked = false;
    } else {
      // Like: insert a new like
      const { error: insertError } = await adminClient
        .from('comment_likes')
        .insert({
          user_id: user.id,
          comment_id,
        });

      if (insertError) {
        console.error('[like-comment] Insert error:', insertError);
        throw new Error('Failed to add like');
      }

      liked = true;

      // Create notification for the comment author (skip if self-like)
      if (comment.user_id !== user.id) {
        // Determine movie_title and tmdb_id from the parent review or first_take
        let movieTitle = '';
        let tmdbId = 0;

        if (comment.review_id) {
          const { data: review } = await adminClient
            .from('reviews')
            .select('movie_title, tmdb_id')
            .eq('id', comment.review_id)
            .single();

          if (review) {
            movieTitle = review.movie_title;
            tmdbId = review.tmdb_id;
          }
        } else if (comment.first_take_id) {
          const { data: firstTake } = await adminClient
            .from('first_takes')
            .select('movie_title, tmdb_id')
            .eq('id', comment.first_take_id)
            .single();

          if (firstTake) {
            movieTitle = firstTake.movie_title;
            tmdbId = firstTake.tmdb_id;
          }
        }

        const { error: notifError } = await adminClient
          .from('notifications')
          .insert({
            user_id: comment.user_id,
            actor_id: user.id,
            type: 'comment_like',
            data: {
              comment_id,
              movie_title: movieTitle,
              tmdb_id: tmdbId,
            },
            read: false,
          });

        if (notifError) {
          // Log but don't fail the like operation over a notification error
          console.error('[like-comment] Notification insert error:', notifError);
        }

        // Send push notification (fire-and-forget)
        try {
          const actorName = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? 'Someone';
          await fetch(
            `${SUPABASE_URL}/functions/v1/send-push-notification`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                user_ids: [comment.user_id],
                title: 'New like',
                body: `${actorName} liked your comment on ${movieTitle}`,
                data: { url: `/movie/${tmdbId}` },
                feature: 'social',
                channel_id: 'social',
              }),
            }
          );
        } catch (err) {
          console.error('[like-comment] Failed to send push notification:', err);
        }
      }
    }

    // Fetch the updated like_count and liked_by_author from the comment (DB trigger keeps it in sync)
    const { data: updatedComment, error: countError } = await adminClient
      .from('review_comments')
      .select('like_count, liked_by_author')
      .eq('id', comment_id)
      .single();

    if (countError) {
      console.error('[like-comment] Count fetch error:', countError);
      // Still return the liked status even if we can't get the count
      return new Response(
        JSON.stringify({ liked, likeCount: 0, likedByAuthor: false }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ liked, likeCount: updatedComment.like_count, likedByAuthor: updatedComment.liked_by_author }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[like-comment] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
