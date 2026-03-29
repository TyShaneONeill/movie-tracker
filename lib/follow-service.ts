import { supabase } from './supabase';
import type { Profile, FollowInsert } from './database.types';
import { sendFollowRequest } from './follow-request-service';

export type FollowResult = { type: 'followed' } | { type: 'requested' };

/**
 * Follow a user. If the target profile is private, a follow request is
 * created instead of an immediate follow.
 */
export async function followUser(
  currentUserId: string,
  targetUserId: string
): Promise<FollowResult> {
  // Check if the target profile is private
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_private')
    .eq('id', targetUserId)
    .single();

  if (profileError) {
    throw new Error(profileError.message || 'Failed to fetch target profile');
  }

  if (profile?.is_private) {
    // Private profile — send a follow request instead of direct follow
    await sendFollowRequest(currentUserId, targetUserId);
    return { type: 'requested' };
  }

  // Public profile — direct follow
  const insertData: FollowInsert = {
    follower_id: currentUserId,
    following_id: targetUserId,
  };

  const { error } = await supabase.from('follows').insert(insertData);

  if (error) {
    // Check for unique constraint violation (already following)
    if (error.code === '23505') {
      throw new Error('ALREADY_FOLLOWING');
    }
    throw new Error(error.message || 'Failed to follow user');
  }

  // Fire-and-forget: create in-app + push notification for the followed user.
  // Never await — notification failure must not affect the follow result.
  // Explicitly pass the session token to avoid the web race condition where
  // supabase.functions.invoke sends the anon key instead of the user JWT.
  supabase.auth.getSession().then(({ data: { session } }) =>
    supabase.functions.invoke('notify-follow', {
      body: { following_id: targetUserId },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    })
  ).catch(() => {});

  return { type: 'followed' };
}

/**
 * Unfollow a user
 */
export async function unfollowUser(
  currentUserId: string,
  targetUserId: string
): Promise<void> {
  const { error } = await supabase.from('follows')
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
  const { data, error } = await supabase.from('follows')
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
  const { data, error } = await supabase.from('follows')
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
  const { data, error } = await supabase.from('follows')
    .select('following:profiles!following_id(*)')
    .eq('follower_id', userId);

  if (error) {
    throw new Error(error.message || 'Failed to fetch following');
  }

  // Extract the profile objects from the nested structure
  return (data ?? []).map((row: { following: Profile }) => row.following);
}
