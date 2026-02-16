import { supabase } from '@/lib/supabase';
import type { WatchlistCommentWithProfile } from '@/lib/database.types';

// ============================================================================
// Watchlist Likes
// ============================================================================

/**
 * Check if the current user has liked a watchlist owner's watchlist.
 */
export async function hasLikedWatchlist(
  userId: string,
  ownerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('watchlist_likes')
    .select('user_id')
    .eq('user_id', userId)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * Get total like count for a watchlist owner.
 */
export async function getWatchlistLikeCount(ownerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('watchlist_likes')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Like a watchlist. Throws if already liked (23505 = unique violation).
 */
export async function likeWatchlist(
  userId: string,
  ownerId: string
): Promise<void> {
  const { error } = await supabase
    .from('watchlist_likes')
    .insert({ user_id: userId, owner_id: ownerId });

  if (error) {
    if (error.code === '23505') throw new Error('ALREADY_LIKED');
    throw error;
  }
}

/**
 * Unlike a watchlist.
 */
export async function unlikeWatchlist(
  userId: string,
  ownerId: string
): Promise<void> {
  const { error } = await supabase
    .from('watchlist_likes')
    .delete()
    .eq('user_id', userId)
    .eq('owner_id', ownerId);

  if (error) throw error;
}

// ============================================================================
// Watchlist Comments
// ============================================================================

const COMMENT_SELECT = '*, profiles(full_name, username, avatar_url)';

/**
 * Fetch recent comments for a watchlist owner, joined with commenter profiles.
 */
export async function getWatchlistComments(
  ownerId: string,
  limit: number = 20
): Promise<WatchlistCommentWithProfile[]> {
  const { data, error } = await supabase
    .from('watchlist_comments')
    .select(COMMENT_SELECT)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as WatchlistCommentWithProfile[];
}

/**
 * Add a comment to a watchlist.
 */
export async function addWatchlistComment(
  userId: string,
  ownerId: string,
  text: string
): Promise<WatchlistCommentWithProfile> {
  const { data, error } = await supabase
    .from('watchlist_comments')
    .insert({ user_id: userId, owner_id: ownerId, text })
    .select(COMMENT_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as WatchlistCommentWithProfile;
}

/**
 * Delete a comment (only the commenter can delete their own).
 */
export async function deleteWatchlistComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('watchlist_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}
