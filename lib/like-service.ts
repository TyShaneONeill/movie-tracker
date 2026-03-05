import { supabase } from './supabase';

export interface LikeStatusResponse {
  liked: boolean;
  likeCount: number;
}

/**
 * Toggle like via edge function (handles insert/delete + count update atomically)
 */
export async function toggleLike(
  targetType: 'review' | 'first_take',
  targetId: string
): Promise<LikeStatusResponse> {
  const { data, error } = await supabase.functions.invoke<LikeStatusResponse>(
    'like-review',
    { body: { target_type: targetType, target_id: targetId } }
  );

  if (error) {
    throw new Error(error.message || 'Failed to toggle like');
  }

  if (!data) {
    throw new Error('No data returned from like toggle');
  }

  return data;
}

/**
 * Fetch like status directly from DB (for initial load, avoids edge function overhead)
 */
export async function fetchLikeStatus(
  userId: string,
  targetType: 'review' | 'first_take',
  targetId: string
): Promise<LikeStatusResponse> {
  // Check if user has liked this
  const likeQuery = supabase
    .from('review_likes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (targetType === 'review') {
    likeQuery.eq('review_id', targetId);
  } else {
    likeQuery.eq('first_take_id', targetId);
  }

  const { count: likeExists, error: likeError } = await likeQuery;

  if (likeError) {
    throw new Error(likeError.message);
  }

  // Get the like_count from the target table
  const table = targetType === 'review' ? 'reviews' : 'first_takes';
  const { data: targetData, error: targetError } = await supabase
    .from(table)
    .select('like_count')
    .eq('id', targetId)
    .single();

  if (targetError) {
    throw new Error(targetError.message);
  }

  return {
    liked: (likeExists ?? 0) > 0,
    likeCount: (targetData as any)?.like_count ?? 0,
  };
}
