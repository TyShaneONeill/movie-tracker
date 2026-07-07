import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export interface CommenterInfo {
  userId?: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface CommentItem {
  id: string;
  body: string;
  isSpoiler: boolean;
  isHidden: boolean;
  createdAt: string;
  /** Set only when the author edited the body; null otherwise. */
  editedAt: string | null;
  likeCount: number;
  likedByAuthor: boolean;
  isLikedByMe: boolean;
  commenter: CommenterInfo;
  replies: CommentItem[];
}

export interface UpdatedComment {
  id: string;
  body: string;
  isSpoiler: boolean;
  editedAt: string | null;
  updatedAt: string | null;
}

export interface CommentsResponse {
  comments: CommentItem[];
  totalCount: number;
}

export interface CreatedComment {
  id: string;
  body: string;
  isSpoiler: boolean;
  parentCommentId: string | null;
  createdAt: string;
  commenter: CommenterInfo;
}

export interface ReportCommentResponse {
  reported: boolean;
  autoHidden: boolean;
}

export interface CommentLikeResponse {
  liked: boolean;
  likeCount: number;
  likedByAuthor: boolean;
}

// ============================================================================
// API calls
// ============================================================================

/**
 * Fetch threaded comments for a review or first_take
 */
export async function fetchComments(
  targetType: 'review' | 'first_take',
  targetId: string
): Promise<CommentsResponse> {
  const { data, error } = await supabase.functions.invoke<CommentsResponse>(
    'get-comments',
    { body: { target_type: targetType, target_id: targetId } }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch comments');
  }

  if (!data) {
    throw new Error('No data returned from comments');
  }

  return data;
}

/**
 * Add a comment to a review or first_take
 */
export async function addComment(
  targetType: 'review' | 'first_take',
  targetId: string,
  body: string,
  isSpoiler: boolean = false,
  parentCommentId?: string
): Promise<CreatedComment> {
  const { data, error } = await supabase.functions.invoke<CreatedComment>(
    'add-comment',
    {
      body: {
        target_type: targetType,
        target_id: targetId,
        body,
        is_spoiler: isSpoiler,
        parent_comment_id: parentCommentId,
      },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to add comment');
  }

  if (!data) {
    throw new Error('No data returned from add comment');
  }

  return data;
}

/**
 * Edit own comment body (author-only, enforced by the edge function + RLS).
 * Sets edited_at server-side and returns the updated row.
 */
export async function updateComment(
  commentId: string,
  body: string
): Promise<UpdatedComment> {
  const { data, error } = await supabase.functions.invoke<UpdatedComment>(
    'update-comment',
    { body: { comment_id: commentId, body } }
  );

  if (error) {
    // The edge fn / DB trigger (PS-12) reject a locked content edit. supabase-js
    // wraps a non-2xx as FunctionsHttpError with a generic message, so pull the
    // JSON body and surface the `edit_window_closed` marker when present.
    let errorBody: any = null;
    try {
      const anyErr = error as any;
      if (typeof anyErr.context?.json === 'function') {
        errorBody = await anyErr.context.json();
      } else if (typeof anyErr.context?.body === 'string') {
        errorBody = JSON.parse(anyErr.context.body);
      }
    } catch {
      // body not readable — fall through to the generic message
    }

    const marker = `${errorBody?.code ?? ''} ${errorBody?.error ?? ''} ${error.message ?? ''}`;
    if (marker.includes('edit_window_closed')) {
      throw new Error('edit_window_closed');
    }
    throw new Error(errorBody?.error || error.message || 'Failed to update comment');
  }

  if (!data) {
    throw new Error('No data returned from update comment');
  }

  return data;
}

/**
 * Report a comment
 */
export async function reportComment(
  commentId: string,
  reason?: string
): Promise<ReportCommentResponse> {
  const { data, error } = await supabase.functions.invoke<ReportCommentResponse>(
    'report-comment',
    { body: { comment_id: commentId, reason } }
  );

  if (error) {
    throw new Error(error.message || 'Failed to report comment');
  }

  if (!data) {
    throw new Error('No data returned from report comment');
  }

  return data;
}

/**
 * Toggle a like on a comment
 */
export async function likeComment(commentId: string): Promise<CommentLikeResponse> {
  const { data, error } = await supabase.functions.invoke<CommentLikeResponse>(
    'like-comment',
    { body: { comment_id: commentId } }
  );
  if (error) throw new Error(error.message || 'Failed to toggle comment like');
  if (!data) throw new Error('No data returned from comment like');
  return data;
}

/**
 * Delete own comment (direct table access — RLS ensures only own comments)
 */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await (supabase.from('review_comments') as any)
    .delete()
    .eq('id', commentId);

  if (error) {
    throw new Error(error.message || 'Failed to delete comment');
  }
}
