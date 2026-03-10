import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

interface ReportCommentRequest {
  comment_id: string;
  reason?: string;
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

    // Rate limit: 20 reports per hour
    const rateLimited = await enforceRateLimit(user.id, 'report_comment', 20, 3600, req);
    if (rateLimited) return rateLimited;

    // Parse request body
    const { comment_id, reason }: ReportCommentRequest = await req.json();

    if (!comment_id || typeof comment_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid comment_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the comment exists and get its author
    const { data: comment, error: commentError } = await adminClient
      .from('review_comments')
      .select('id, user_id')
      .eq('id', comment_id)
      .single();

    if (commentError || !comment) {
      return new Response(
        JSON.stringify({ error: 'Comment not found' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-reporting
    if (comment.user_id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot report your own comment' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // Insert report
    const { error: insertError } = await adminClient
      .from('comment_reports')
      .insert({
        comment_id,
        reporter_id: user.id,
        reason: reason?.trim() || null,
      });

    if (insertError) {
      // Handle unique constraint violation (already reported)
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'You have already reported this comment' }),
          { status: 409, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        );
      }
      console.error('[report-comment] Insert error:', insertError);
      throw new Error('Failed to insert report');
    }

    // Check total report count for this comment
    const { count, error: countError } = await adminClient
      .from('comment_reports')
      .select('*', { count: 'exact', head: true })
      .eq('comment_id', comment_id);

    if (countError) {
      console.error('[report-comment] Count error:', countError);
      throw new Error('Failed to check report count');
    }

    const reportCount = count ?? 0;
    let autoHidden = false;

    // Auto-hide if 3 or more reports
    if (reportCount >= 3) {
      await adminClient
        .from('review_comments')
        .update({ is_hidden: true, report_count: reportCount })
        .eq('id', comment_id);

      autoHidden = true;
    } else {
      await adminClient
        .from('review_comments')
        .update({ report_count: reportCount })
        .eq('id', comment_id);
    }

    return new Response(
      JSON.stringify({ reported: true, autoHidden }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[report-comment] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
