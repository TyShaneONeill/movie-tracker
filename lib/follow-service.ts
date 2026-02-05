import { supabase } from './supabase';
import type { Profile, FollowInsert } from './database.types';

/**
 * Follow a user
 */
export async function followUser(
  currentUserId: string,
  targetUserId: string
): Promise<void> {
  const insertData: FollowInsert = {
    follower_id: currentUserId,
    following_id: targetUserId,
  };

  const { error } = await (supabase.from('follows') as any).insert(insertData);

  if (error) {
    // Check for unique constraint violation (already following)
    if (error.code === '23505') {
      throw new Error('ALREADY_FOLLOWING');
    }
    throw new Error(error.message || 'Failed to follow user');
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(
  currentUserId: string,
  targetUserId: string
): Promise<void> {
  const { error } = await (supabase.from('follows') as any)
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId);

  if (error) {
    throw new Error(error.message || 'Failed to unfollow user');
  }
}

/**
 * Check if a user is following another user
 */
export async function isFollowing(
  currentUserId: string,
  targetUserId: string
): Promise<boolean> {
  const { data, error } = await (supabase.from('follows') as any)
    .select('follower_id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check follow status');
  }

  return !!data;
}

/**
 * Get all followers for a user
 */
export async function getFollowers(userId: string): Promise<Profile[]> {
  const { data, error } = await (supabase.from('follows') as any)
    .select('follower:profiles!follower_id(*)')
    .eq('following_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to fetch followers');
  }

  // Extract the profile objects from the nested structure
  return (data ?? []).map((row: { follower: Profile }) => row.follower);
}

/**
 * Get all users that a user is following
 */
export async function getFollowing(userId: string): Promise<Profile[]> {
  const { data, error } = await (supabase.from('follows') as any)
    .select('following:profiles!following_id(*)')
    .eq('follower_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to fetch following');
  }

  // Extract the profile objects from the nested structure
  return (data ?? []).map((row: { following: Profile }) => row.following);
}
