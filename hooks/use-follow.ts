import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import {
  isFollowing,
  followUser,
  unfollowUser,
} from '@/lib/follow-service';

interface UseFollowOptions {
  /** Username to display in toast notifications (e.g., "johndoe" becomes "@johndoe") */
  username?: string | null;
}

interface UseFollowResult {
  isFollowing: boolean;
  isLoadingStatus: boolean;
  isTogglingFollow: boolean;
  toggleFollow: () => Promise<void>;
  error: Error | null;
}

export function useFollow(targetUserId: string, options?: UseFollowOptions): UseFollowResult {
  const { username } = options ?? {};
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query to check if current user is following the target user
  const {
    data: followingStatus,
    isLoading: isLoadingStatus,
    error: queryError,
  } = useQuery({
    queryKey: ['followStatus', user?.id, targetUserId],
    queryFn: () => isFollowing(user!.id, targetUserId),
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
  });

  // Mutation to toggle follow/unfollow
  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (user.id === targetUserId) throw new Error('Cannot follow yourself');

      if (followingStatus) {
        await unfollowUser(user.id, targetUserId);
        return false; // Now unfollowing
      } else {
        await followUser(user.id, targetUserId);
        return true; // Now following
      }
    },
    onMutate: async () => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ['followStatus', user?.id, targetUserId],
      });

      // Snapshot the previous value
      const previousStatus = queryClient.getQueryData<boolean>([
        'followStatus',
        user?.id,
        targetUserId,
      ]);

      // Optimistically update to the new value
      queryClient.setQueryData(
        ['followStatus', user?.id, targetUserId],
        !previousStatus
      );

      // Return context with the snapshotted value
      return { previousStatus };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousStatus !== undefined) {
        queryClient.setQueryData(
          ['followStatus', user?.id, targetUserId],
          context.previousStatus
        );
      }
    },
    onSuccess: (isNowFollowing) => {
      // Show toast notification
      const displayName = username ? `@${username}` : 'user';
      if (isNowFollowing) {
        Toast.show({
          type: 'success',
          text1: `Following ${displayName}`,
          visibilityTime: 2000,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: `Unfollowed ${displayName}`,
          visibilityTime: 2000,
        });
      }

      // Invalidate relevant queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['followStatus', user?.id, targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['followers', targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['following', user?.id],
      });
      // Invalidate profile to update follower/following counts
      queryClient.invalidateQueries({
        queryKey: ['profile', targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['suggestedUsers'],
      });
    },
  });

  const toggleFollow = async (): Promise<void> => {
    await toggleMutation.mutateAsync();
  };

  return {
    isFollowing: followingStatus ?? false,
    isLoadingStatus,
    isTogglingFollow: toggleMutation.isPending,
    toggleFollow,
    error: (queryError as Error | null) ?? (toggleMutation.error as Error | null),
  };
}
