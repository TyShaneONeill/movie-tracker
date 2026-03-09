import { supabase } from './supabase';
import type { FollowRequestInsert, FollowInsert } from './database.types';

export type FollowRequestStatus = 'none' | 'pending' | 'following';

export interface FollowRequestWithProfile {
  id: string;
  requester_id: string;
  target_id: string;
  created_at: string;
  requester: {
    avatar_url: string | null;
    username: string | null;
    full_name: string | null;
  };
}

/**
 * Send a follow request to a private profile
 */
export async function sendFollowRequest(
  requesterId: string,
  targetId: string
): Promise<void> {
  const insertData: FollowRequestInsert = {
    requester_id: requesterId,
    target_id: targetId,
  };

  const { error } = await supabase.from('follow_requests').insert(insertData);

  if (error) {
    // Check for unique constraint violation (already requested)
    if (error.code === '23505') {
      throw new Error('ALREADY_REQUESTED');
    }
    throw new Error(error.message || 'Failed to send follow request');
  }
}

/**
 * Accept a follow request — deletes the request and creates a follow relationship.
 *
 * Can be called with just requestId (will look up the request row) or with
 * all three arguments to skip the lookup.
 */
export async function acceptFollowRequest(
  requestId: string,
  requesterId?: string,
  targetId?: string
): Promise<void> {
  let resolvedRequesterId = requesterId;
  let resolvedTargetId = targetId;

  // If requester/target not provided, look up the request row
  if (!resolvedRequesterId || !resolvedTargetId) {
    const { data: request, error: lookupError } = await supabase
      .from('follow_requests')
      .select('requester_id, target_id')
      .eq('id', requestId)
      .single();

    if (lookupError || !request) {
      throw new Error(lookupError?.message || 'Follow request not found');
    }

    resolvedRequesterId = request.requester_id;
    resolvedTargetId = request.target_id;
  }

  // Delete the follow request
  const { error: deleteError } = await supabase
    .from('follow_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    throw new Error(deleteError.message || 'Failed to accept follow request');
  }

  // Insert into follows
  const followInsert: FollowInsert = {
    follower_id: resolvedRequesterId,
    following_id: resolvedTargetId,
  };

  const { error: followError } = await supabase
    .from('follows')
    .insert(followInsert);

  if (followError) {
    // If already following (edge case), don't treat as error
    if (followError.code === '23505') {
      return;
    }
    throw new Error(followError.message || 'Failed to create follow');
  }
}

/**
 * Decline a follow request — deletes the request
 */
export async function declineFollowRequest(
  requestId: string
): Promise<void> {
  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message || 'Failed to decline follow request');
  }
}

/**
 * Cancel a follow request (requester cancels their own pending request)
 */
export async function cancelFollowRequest(
  requesterId: string,
  targetId: string
): Promise<void> {
  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('requester_id', requesterId)
    .eq('target_id', targetId);

  if (error) {
    throw new Error(error.message || 'Failed to cancel follow request');
  }
}

/**
 * Get all pending follow requests for a user (where they are the target),
 * joined with requester profile info.
 */
export async function getPendingRequestsForUser(
  userId: string
): Promise<FollowRequestWithProfile[]> {
  const { data, error } = await supabase
    .from('follow_requests')
    .select(`
      id,
      requester_id,
      target_id,
      created_at,
      requester:profiles!follow_requests_requester_id_fkey (
        avatar_url,
        username,
        full_name
      )
    `)
    .eq('target_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch pending follow requests');
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    requester_id: row.requester_id,
    target_id: row.target_id,
    created_at: row.created_at,
    requester: {
      avatar_url: row.requester?.avatar_url ?? null,
      username: row.requester?.username ?? null,
      full_name: row.requester?.full_name ?? null,
    },
  }));
}

/**
 * Alias for getPendingRequestsForUser — used by the useFollowRequests hook.
 * Returns rows with a `profiles` key matching the hook's expected shape.
 */
export async function getPendingRequests(
  userId: string
): Promise<Array<{
  id: string;
  requester_id: string;
  target_id: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}>> {
  const requests = await getPendingRequestsForUser(userId);
  return requests.map((r) => ({
    id: r.id,
    requester_id: r.requester_id,
    target_id: r.target_id,
    created_at: r.created_at,
    profiles: r.requester,
  }));
}

/**
 * Check the relationship status between two users:
 * - 'following' if requester already follows target
 * - 'pending' if there's a pending follow request
 * - 'none' if neither
 */
export async function getRequestStatus(
  requesterId: string,
  targetId: string
): Promise<FollowRequestStatus> {
  // Check if already following
  const { data: followData, error: followError } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', requesterId)
    .eq('following_id', targetId)
    .maybeSingle();

  if (followError) {
    throw new Error(followError.message || 'Failed to check follow status');
  }

  if (followData) {
    return 'following';
  }

  // Check if there's a pending request
  const { data: requestData, error: requestError } = await supabase
    .from('follow_requests')
    .select('id')
    .eq('requester_id', requesterId)
    .eq('target_id', targetId)
    .maybeSingle();

  if (requestError) {
    throw new Error(requestError.message || 'Failed to check request status');
  }

  if (requestData) {
    return 'pending';
  }

  return 'none';
}

/**
 * Auto-accept all pending follow requests for a user.
 * Used when switching from private to public — all pending requests
 * become follows and the requests are deleted.
 */
export async function acceptAllPendingRequests(userId: string): Promise<void> {
  // Fetch all pending requests where this user is the target
  const { data: requests, error: fetchError } = await supabase
    .from('follow_requests')
    .select('id, requester_id, target_id')
    .eq('target_id', userId);

  if (fetchError) {
    throw new Error(fetchError.message || 'Failed to fetch pending follow requests');
  }

  if (!requests || requests.length === 0) return;

  // Insert all as follows
  const followInserts: FollowInsert[] = requests.map((r) => ({
    follower_id: r.requester_id,
    following_id: r.target_id,
  }));

  const { error: followError } = await supabase
    .from('follows')
    .insert(followInserts);

  if (followError) {
    // 23505 = unique violation — some may already be following, that's OK
    if (followError.code !== '23505') {
      throw new Error(followError.message || 'Failed to create follows from pending requests');
    }
  }

  // Delete all the pending requests
  const requestIds = requests.map((r) => r.id);
  const { error: deleteError } = await supabase
    .from('follow_requests')
    .delete()
    .in('id', requestIds);

  if (deleteError) {
    throw new Error(deleteError.message || 'Failed to delete accepted follow requests');
  }
}
