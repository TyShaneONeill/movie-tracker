import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceIpRateLimit } from '../_shared/rate-limit.ts';

// ============================================================================
// Types
// ============================================================================

type TargetType = 'review' | 'first_take';

interface GetCommentsRequest {
  target_type: TargetType;
  target_id: string;
}

interface CommentRow {
  id: string;
  body: string;
  is_spoiler: boolean;
  parent_comment_id: string | null;
  report_count: number;
  is_hidden: boolean;
  created_at: string;
  user_id: string;
  like_count: number;
  liked_by_author: boolean;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface CommentResponse {
  id: string;
  body: string;
  isSpoiler: boolean;
  isHidden: boolean;
  createdAt: string;
  likeCount: number;
  likedByAuthor: boolean;
  isLikedByMe: boolean;
  commenter: {
    userId: string;
    fullName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  replies: CommentResponse[];
}

// ============================================================================
// Helpers
// ============================================================================

function buildCommentTree(
  comments: CommentRow[],
  profileMap: Map<string, ProfileRow>,
  likedCommentIds: Set<string>,
): { tree: CommentResponse[]; totalCount: number } {
  const responseMap = new Map<string, CommentResponse>();

  // Create response objects for all comments
  for (const c of comments) {
    const profile = profileMap.get(c.user_id);
    const isHidden = c.is_hidden;

    responseMap.set(c.id, {
      id: c.id,
      body: isHidden ? '[This comment has been hidden]' : c.body,
      isSpoiler: c.is_spoiler,
      isHidden,
      createdAt: c.created_at,
      likeCount: c.like_count,
      likedByAuthor: c.liked_by_author,
      isLikedByMe: likedCommentIds.has(c.id),
      commenter: {
        userId: c.user_id,
        fullName: profile?.full_name ?? null,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      replies: [],
    });
  }

  // Build tree by attaching replies to parents
  const roots: CommentResponse[] = [];

  for (const c of comments) {
    const node = responseMap.get(c.id)!;
    if (c.parent_comment_id && responseMap.has(c.parent_comment_id)) {
      responseMap.get(c.parent_comment_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return { tree: roots, totalCount: comments.length };
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

    // IP-based rate limit: 120 requests per minute (no auth required)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const rateLimited = await enforceIpRateLimit(clientIp, 'get_comments', 120, 60, req);
    if (rateLimited) return rateLimited;

    // Optional auth: get current user to determine isLikedByMe
    let currentUserId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const supabaseUserClient = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_ANON_KEY') || '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseUserClient.auth.getUser();
      if (user) currentUserId = user.id;
    }

    // Parse request body
    const { target_type, target_id }: GetCommentsRequest = await req.json();

    // Validate target_type
    if (!target_type || (target_type !== 'review' && target_type !== 'first_take')) {
      return new Response(
        JSON.stringify({ error: 'target_type must be "review" or "first_take"' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    // Validate target_id
    if (!target_id || typeof target_id !== 'string' || target_id.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Valid target_id is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine which column to filter on
    const column = target_type === 'review' ? 'review_id' : 'first_take_id';

    // Get comments (without profile join to avoid FK issues)
    const { data: comments, error: commentsError } = await adminClient
      .from('review_comments')
      .select('id, body, is_spoiler, parent_comment_id, report_count, is_hidden, created_at, user_id, like_count, liked_by_author')
      .eq(column, target_id)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('[get-comments] Comments query error:', commentsError);
      throw new Error('Failed to fetch comments');
    }

    if (!comments || comments.length === 0) {
      return new Response(
        JSON.stringify({ comments: [], totalCount: 0 }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        },
      );
    }

    // Collect unique user IDs and batch fetch profiles
    const userIds = [...new Set((comments as CommentRow[]).map((c) => c.user_id))];

    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      console.error('[get-comments] Profiles query error:', profilesError);
      // Non-fatal: proceed with empty profiles
    }

    const profileMap = new Map<string, ProfileRow>(
      ((profiles as ProfileRow[]) ?? []).map((p) => [p.id, p]),
    );

    // Batch fetch current user's likes
    let likedCommentIds = new Set<string>();
    if (currentUserId && comments.length > 0) {
      const commentIds = (comments as CommentRow[]).map(c => c.id);
      const { data: userLikes } = await adminClient
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', currentUserId)
        .in('comment_id', commentIds);
      if (userLikes) {
        likedCommentIds = new Set(userLikes.map((l: any) => l.comment_id));
      }
    }

    // Build threaded tree
    const { tree, totalCount } = buildCommentTree(comments as CommentRow[], profileMap, likedCommentIds);

    return new Response(
      JSON.stringify({ comments: tree, totalCount }),
      {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[get-comments] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
