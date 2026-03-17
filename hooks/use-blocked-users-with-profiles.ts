import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import {
  getBlockedUsersWithProfiles,
  unblockUser as unblockUserService,
} from '@/lib/block-service';
import { analytics } from '@/lib/analytics';

export function useBlockedUsersWithProfiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: profiles,
    isLoading,
  } = useQuery({
    queryKey: ['blocked-users-profiles'],
    queryFn: getBlockedUsersWithProfiles,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
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
      queryClient.invalidateQueries({ queryKey: ['blocked-users-profiles'] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to unblock user',
        visibilityTime: 2000,
      });
    },
  });

  return {
    profiles: profiles ?? [],
    isLoading,
    unblockUser: (userId: string) => unblockMutation.mutateAsync(userId),
    isUnblocking: unblockMutation.isPending,
  };
}
