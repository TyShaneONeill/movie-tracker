import { supabase } from './supabase';

// The blocked_users table is not yet in generated database types,
// so we use type-safe wrappers around the untyped queries.

function blockedUsersTable() {
  return supabase.from('blocked_users' as any) as any;
}

/**
 * Block a user
 */
export async function blockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await blockedUsersTable()
    .insert({ blocker_id: user.id, blocked_id: blockedId });

  if (error) {
    if (error.code === '23505') return; // Already blocked
    throw new Error(error.message || 'Failed to block user');
  }
}

/**
 * Unblock a user
 */
export async function unblockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await blockedUsersTable()
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) {
    throw new Error(error.message || 'Failed to unblock user');
  }
}

/**
 * Get all blocked user IDs for the current user
 */
export async function getBlockedUserIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await blockedUsersTable()
    .select('blocked_id')
    .eq('blocker_id', user.id);

  if (error) {
    throw new Error(error.message || 'Failed to fetch blocked users');
  }

  return (data ?? []).map((row: any) => row.blocked_id as string);
}

/**
 * Check if a specific user is blocked
 */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await blockedUsersTable()
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check block status');
  }

  return !!data;
}

/**
 * Get profiles of all blocked users
 */
export async function getBlockedUsersWithProfiles(): Promise<any[]> {
  const ids = await getBlockedUserIds();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', ids);

  if (error) {
    throw new Error(error.message || 'Failed to fetch blocked user profiles');
  }

  return data ?? [];
}
