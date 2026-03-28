import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface AddCommentRequest {
  target_type: 'review' | 'first_take';
  target_id: string;
  body: string;
  is_spoiler?: boolean;
  parent_comment_id?: string;
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

    // Rate limit: 30 comments per hour
    const rateLimited = await enforceRateLimit(user.id, 'add_comment', 30, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { target_type, target_id, body, is_spoiler, parent_comment_id }: AddCommentRequest = await req.json();

    // Validate target_type
    if (!target_type || !['review', 'first_take'].includes(target_type)) {
      return new Response(
        JSON.stringify({ error: 'target_type must be "review" or "first_take"' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate target_id
    if (!target_id || typeof target_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid target_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate body
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Comment body must be between 1 and 500 characters' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine which column to use based on target_type
    const idColumn = target_type === 'review' ? 'review_id' : 'first_take_id';
    const targetTable = target_type === 'review' ? 'reviews' : 'first_takes';

    // Verify the target review/first_take exists and get its author
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

    // Validate parent_comment_id if provided
    let parentComment: { id: string; user_id: string; parent_comment_id: string | null } | null = null;
    if (parent_comment_id) {
      const { data: parent, error: parentError } = await adminClient
        .from('review_comments')
        .select('id, user_id, parent_comment_id')
        .eq('id', parent_comment_id)
        .single();

      if (parentError || !parent) {
        return new Response(
          JSON.stringify({ error: 'Parent comment not found' }),
          { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      // Verify parent comment belongs to the same target
      const { data: parentBelongs, error: parentBelongsError } = await adminClient
        .from('review_comments')
        .select('id')
        .eq('id', parent_comment_id)
        .eq(idColumn, target_id)
        .single();

      if (parentBelongsError || !parentBelongs) {
        return new Response(
          JSON.stringify({ error: 'Parent comment does not belong to this target' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      // Enforce max 2 levels deep: if parent has a parent_comment_id itself, reject
      if (parent.parent_comment_id) {
        return new Response(
          JSON.stringify({ error: 'Replies to replies are not allowed (max 2 levels deep)' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }

      parentComment = parent;
    }

    // Insert comment
    const insertData: Record<string, string | boolean | null> = {
      user_id: user.id,
      [idColumn]: target_id,
      body: trimmedBody,
      is_spoiler: is_spoiler ?? false,
      parent_comment_id: parent_comment_id ?? null,
    };

    const { data: createdComment, error: insertError } = await adminClient
      .from('review_comments')
      .insert(insertData)
      .select('id, body, is_spoiler, parent_comment_id, created_at')
      .single();

    if (insertError || !createdComment) {
      console.error('[add-comment] Insert error:', insertError);
      throw new Error('Failed to create comment');
    }

    // Fetch commenter profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    // Create notifications
    // 1. Notify the review/first_take author (if not self-commenting)
    if (targetContent.user_id !== user.id) {
      const notificationType = target_type === 'review' ? 'comment' : 'comment_first_take';
      const notificationData: Record<string, string | number> = {
        movie_title: targetContent.movie_title,
        tmdb_id: targetContent.tmdb_id,
        comment_id: createdComment.id,
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
        // Log but don't fail the comment operation over a notification error
        console.error('[add-comment] Notification insert error:', notifError);
      }

      // NEW: Send push notification alongside in-app
      // Fire-and-forget — never fail the parent operation over a push error
      try {
        const actorName = profile?.full_name ?? profile?.username ?? 'Someone';
        const pushTitle = 'New comment';
        const pushBody = notificationType === 'comment'
          ? `${actorName} commented on your review of ${targetContent.movie_title}`
          : `${actorName} commented on your First Take on ${targetContent.movie_title}`;

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

    // 2. If replying, also notify the parent comment author (if different from target author and self)
    if (parentComment && parentComment.user_id !== user.id && parentComment.user_id !== targetContent.user_id) {
      const { error: replyNotifError } = await adminClient
        .from('notifications')
        .insert({
          user_id: parentComment.user_id,
          actor_id: user.id,
          type: 'comment_reply',
          data: {
            movie_title: targetContent.movie_title,
            tmdb_id: targetContent.tmdb_id,
            comment_id: createdComment.id,
            parent_comment_id: parentComment.id,
          },
          read: false,
        });

      if (replyNotifError) {
        console.error('[add-comment] Reply notification insert error:', replyNotifError);
      }

      // NEW: Send push notification alongside in-app
      // Fire-and-forget — never fail the parent operation over a push error
      try {
        const actorName = profile?.full_name ?? profile?.username ?? 'Someone';

        await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              user_ids: [parentComment.user_id],
              title: 'New reply',
              body: `${actorName} replied to your comment`,
              data: { url: '/notifications' },
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

    // Return created comment with camelCase keys
    return new Response(
      JSON.stringify({
        id: createdComment.id,
        body: createdComment.body,
        isSpoiler: createdComment.is_spoiler,
        parentCommentId: createdComment.parent_comment_id,
        createdAt: createdComment.created_at,
        commenter: {
          fullName: profile?.full_name ?? null,
          username: profile?.username ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 201,
      }
    );

  } catch (error) {
    console.error('[add-comment] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
