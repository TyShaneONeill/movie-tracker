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
  likeCount: number;
  likedByAuthor: boolean;
  isLikedByMe: boolean;
  commenter: CommenterInfo;
  replies: CommentItem[];
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
