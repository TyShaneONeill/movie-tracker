import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import {
  isFollowing,
  followUser,
  unfollowUser,
} from '@/lib/follow-service';
import {
  getRequestStatus,
  cancelFollowRequest,
  type FollowRequestStatus,
} from '@/lib/follow-request-service';
import { analytics } from '@/lib/analytics';

export type { FollowRequestStatus };

interface UseFollowOptions {
  /** Username to display in toast notifications (e.g., "johndoe" becomes "@johndoe") */
  username?: string | null;
}

interface UseFollowResult {
  isFollowing: boolean;
  requestStatus: FollowRequestStatus;
  isLoadingStatus: boolean;
  isTogglingFollow: boolean;
  isCancellingRequest: boolean;
  toggleFollow: () => Promise<void>;
  cancelRequest: () => Promise<void>;
  error: Error | null;
}

export function useFollow(targetUserId: string, options?: UseFollowOptions): UseFollowResult {
  const { username } = options ?? {};
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query to check if current user is following the target user
  const {
    data: followingStatus,
    isLoading: isLoadingFollowStatus,
    error: followQueryError,
  } = useQuery({
    queryKey: ['followStatus', user?.id, targetUserId],
    queryFn: () => isFollowing(user!.id, targetUserId),
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
  });

  // Query to check if there's a pending follow request for the target user
  const {
    data: requestStatusData,
    isLoading: isLoadingRequestStatus,
    error: requestQueryError,
  } = useQuery({
    queryKey: ['followRequestStatus', user?.id, targetUserId],
    queryFn: () => getRequestStatus(user!.id, targetUserId),
    enabled: !!user && !!targetUserId && user.id !== targetUserId && !followingStatus,
  });

  // Derive the composite request status:
  // If we already know from followStatus query that we're following, use that.
  // Otherwise, use the request status query result.
  const hasPendingRequest = requestStatusData === 'pending';
  const requestStatus: FollowRequestStatus = followingStatus
    ? 'following'
    : requestStatusData ?? 'none';

  // Mutation to toggle follow/unfollow/request
  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (user.id === targetUserId) throw new Error('Cannot follow yourself');

      if (followingStatus) {
        // Currently following -> unfollow
        await unfollowUser(user.id, targetUserId);
        return { type: 'unfollowed' as const };
      } else if (hasPendingRequest) {
        // Has pending request -> cancel it
        await cancelFollowRequest(user.id, targetUserId);
        return { type: 'cancelled' as const };
      } else {
        // Not following and no pending request -> follow or send request
        const result = await followUser(user.id, targetUserId);
        // followUser now returns { type: 'followed' | 'requested' }
        // If the service hasn't been updated yet, it returns void (treated as 'followed')
        if (result && typeof result === 'object' && 'type' in result) {
          return result as { type: 'followed' | 'requested' };
        }
        return { type: 'followed' as const };
      }
    },
    onMutate: async () => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ['followStatus', user?.id, targetUserId],
      });
      await queryClient.cancelQueries({
        queryKey: ['followRequestStatus', user?.id, targetUserId],
      });

      // Snapshot the previous values
      const previousFollowStatus = queryClient.getQueryData<boolean>([
        'followStatus',
        user?.id,
        targetUserId,
      ]);
      const previousRequestStatus = queryClient.getQueryData<FollowRequestStatus>([
        'followRequestStatus',
        user?.id,
        targetUserId,
      ]);

      // Optimistic update based on current state
      if (followingStatus) {
        // Unfollowing
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          false
        );
      } else if (hasPendingRequest) {
        // Cancelling request
        queryClient.setQueryData<FollowRequestStatus>(
          ['followRequestStatus', user?.id, targetUserId],
          'none'
        );
      } else {
        // Following or requesting — we don't know yet which it will be,
        // so we optimistically set follow to true (will be corrected on success)
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          true
        );
      }

      return { previousFollowStatus, previousRequestStatus };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousFollowStatus !== undefined) {
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          context.previousFollowStatus
        );
      }
      if (context?.previousRequestStatus !== undefined) {
        queryClient.setQueryData(
          ['followRequestStatus', user?.id, targetUserId],
          context.previousRequestStatus
        );
      }
    },
    onSuccess: (result) => {
      const displayName = username ? `@${username}` : 'user';

      if (result.type === 'followed') {
        analytics.track('social:follow', { target_user_id: targetUserId });
        // Correct optimistic update — it was a direct follow
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          true
        );
        Toast.show({
          type: 'success',
          text1: `Following ${displayName}`,
          visibilityTime: 2000,
        });
      } else if (result.type === 'requested') {
        // Correct optimistic update — it was a follow request, not a direct follow
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          false
        );
        queryClient.setQueryData<FollowRequestStatus>(
          ['followRequestStatus', user?.id, targetUserId],
          'pending'
        );
        Toast.show({
          type: 'success',
          text1: `Follow request sent to ${displayName}`,
          visibilityTime: 2000,
        });
      } else if (result.type === 'unfollowed') {
        analytics.track('social:unfollow', { target_user_id: targetUserId });
        Toast.show({
          type: 'info',
          text1: `Unfollowed ${displayName}`,
          visibilityTime: 2000,
        });
      } else if (result.type === 'cancelled') {
        Toast.show({
          type: 'info',
          text1: `Follow request cancelled`,
          visibilityTime: 2000,
        });
      }

      // Invalidate relevant queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['followStatus', user?.id, targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['followRequestStatus', user?.id, targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['followers', targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['following', user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['profile', targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['suggestedUsers'],
      });
      queryClient.invalidateQueries({
        queryKey: ['followRequests'],
      });
    },
  });

  // Separate cancel mutation for explicit cancel action
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      await cancelFollowRequest(user.id, targetUserId);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: ['followRequestStatus', user?.id, targetUserId],
      });

      const previousRequestStatus = queryClient.getQueryData<FollowRequestStatus>([
        'followRequestStatus',
        user?.id,
        targetUserId,
      ]);

      queryClient.setQueryData<FollowRequestStatus>(
        ['followRequestStatus', user?.id, targetUserId],
        'none'
      );

      return { previousRequestStatus };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousRequestStatus !== undefined) {
        queryClient.setQueryData(
          ['followRequestStatus', user?.id, targetUserId],
          context.previousRequestStatus
        );
      }
      Toast.show({
        type: 'error',
        text1: 'Failed to cancel follow request',
        visibilityTime: 2000,
      });
    },
    onSuccess: () => {
      Toast.show({
        type: 'info',
        text1: 'Follow request cancelled',
        visibilityTime: 2000,
      });

      queryClient.invalidateQueries({
        queryKey: ['followRequestStatus', user?.id, targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['followRequests'],
      });
    },
  });

  const toggleFollow = async (): Promise<void> => {
    await toggleMutation.mutateAsync();
  };

  const cancelRequest = async (): Promise<void> => {
    await cancelMutation.mutateAsync();
  };

  return {
    isFollowing: followingStatus ?? false,
    requestStatus,
    isLoadingStatus: isLoadingFollowStatus || isLoadingRequestStatus,
    isTogglingFollow: toggleMutation.isPending,
    isCancellingRequest: cancelMutation.isPending,
    toggleFollow,
    cancelRequest,
    error: (followQueryError as Error | null)
      ?? (requestQueryError as Error | null)
      ?? (toggleMutation.error as Error | null)
      ?? (cancelMutation.error as Error | null),
  };
}
