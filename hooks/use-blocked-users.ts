import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import {
  getBlockedUserIds,
  blockUser as blockUserService,
  unblockUser as unblockUserService,
} from '@/lib/block-service';
import { unfollowUser } from '@/lib/follow-service';
import { analytics } from '@/lib/analytics';

export function useBlockedUsers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: blockedIds,
    isLoading,
  } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: getBlockedUserIds,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const blockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Block the user
      await blockUserService(targetUserId);

      // Remove follow relationships in both directions
      try {
        await unfollowUser(user.id, targetUserId);
      } catch {
        // Ignore — may not be following
      }
      try {
        await unfollowUser(targetUserId, user.id);
      } catch {
        // Ignore — they may not be following us
      }

      return targetUserId;
    },
    onSuccess: (targetUserId) => {
      analytics.track('moderation:block', { target_user_id: targetUserId });
      Toast.show({
        type: 'success',
        text1: 'User blocked',
        text2: "You won't see their content anymore.",
        visibilityTime: 3000,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      queryClient.invalidateQueries({ queryKey: ['followStatus'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['following-ids'] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to block user',
        visibilityTime: 2000,
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      await unblockUserService(targetUserId);
      return targetUserId;
    },
    onSuccess: (targetUserId) => {
      analytics.track('moderation:unblock', { target_user_id: targetUserId });
      Toast.show({
        type: 'info',
        text1: 'User unblocked',
        visibilityTime: 2000,
      });

      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to unblock user',
        visibilityTime: 2000,
      });
    },
  });

  const isBlocked = (userId: string): boolean => {
    return (blockedIds ?? []).includes(userId);
  };

  return {
    blockedIds: blockedIds ?? [],
    isLoading,
    blockUser: (userId: string) => blockMutation.mutateAsync(userId),
    unblockUser: (userId: string) => unblockMutation.mutateAsync(userId),
    isBlocked,
    isBlocking: blockMutation.isPending,
    isUnblocking: unblockMutation.isPending,
  };
}
