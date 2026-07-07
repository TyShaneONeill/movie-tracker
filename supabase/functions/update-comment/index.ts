import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface UpdateCommentRequest {
  comment_id: string;
  body: string;
}

const MAX_BODY_LENGTH = 500;
// PS-12 edit grace window — mirror of the DB trigger constant (15 minutes).
const EDIT_GRACE_MS = 15 * 60 * 1000;

// ============================================================================
// Main Handler
// ============================================================================
//
// Author-only edit of a comment body. Modeled on add-comment: authenticate the
// caller, load the comment, verify ownership (403 otherwise), re-validate the
// text with the same 1–500 char rule, then update body + edited_at + updated_at
// and return the updated row.
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

    // Rate limit: 30 edits per hour (mirrors add-comment)
    const rateLimited = await enforceRateLimit(user.id, 'update_comment', 30, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { comment_id, body }: UpdateCommentRequest = await req.json();

    // Validate comment_id
    if (!comment_id || typeof comment_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid comment_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Validate body — same rule as add-comment (1..500 after trim)
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > MAX_BODY_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Comment body must be between 1 and ${MAX_BODY_LENGTH} characters` }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load the comment to verify it exists and check ownership
    const { data: existing, error: loadError } = await adminClient
      .from('review_comments')
      .select('id, user_id, is_hidden, created_at, like_count')
      .eq('id', comment_id)
      .single();

    if (loadError || !existing) {
      return new Response(
        JSON.stringify({ error: 'Comment not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Author-only: reject edits to someone else's comment
    if (existing.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'You can only edit your own comments' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Do not allow editing a comment that has been hidden by moderation
    if (existing.is_hidden) {
      return new Response(
        JSON.stringify({ error: 'This comment cannot be edited' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // PS-12 edit grace window (defense in depth — the DB trigger also blocks it).
    // Content is editable only within 15 min of posting AND before any likes.
    const createdMs = existing.created_at ? new Date(existing.created_at).getTime() : NaN;
    const locked =
      !existing.created_at ||
      Number.isNaN(createdMs) ||
      Date.now() - createdMs > EDIT_GRACE_MS ||
      (existing.like_count ?? 0) > 0;
    if (locked) {
      return new Response(
        JSON.stringify({
          error: 'This comment can no longer be edited — the edit window has closed or it already has activity.',
          code: 'edit_window_closed',
        }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await adminClient
      .from('review_comments')
      .update({ body: trimmedBody, edited_at: nowIso, updated_at: nowIso })
      .eq('id', comment_id)
      .select('id, body, is_spoiler, edited_at, updated_at')
      .single();

    if (updateError || !updated) {
      // Race: the comment may have been liked/aged between the ownership check
      // above and this update, firing the DB grace-window trigger. The trigger
      // raises with HINT='edit_window_closed' — map that to a friendly 403
      // (same shape as the pre-check lock branch) instead of a generic 500.
      const triggerHint = (updateError as { hint?: string } | null)?.hint ?? '';
      const triggerMessage = updateError?.message ?? '';
      if (triggerHint === 'edit_window_closed' || triggerMessage.includes('edit_window_closed')) {
        return new Response(
          JSON.stringify({
            error: 'This comment can no longer be edited — the edit window has closed or it already has activity.',
            code: 'edit_window_closed',
          }),
          { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
      console.error('[update-comment] Update error:', updateError);
      throw new Error('Failed to update comment');
    }

    return new Response(
      JSON.stringify({
        id: updated.id,
        body: updated.body,
        isSpoiler: updated.is_spoiler,
        editedAt: updated.edited_at,
        updatedAt: updated.updated_at,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[update-comment] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
