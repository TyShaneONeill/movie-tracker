import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import {
  getPendingRequests,
  acceptFollowRequest,
  declineFollowRequest,
} from '@/lib/follow-request-service';

export interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

interface UseFollowRequestsResult {
  pendingRequests: FollowRequest[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  acceptRequest: (requestId: string, requesterUsername?: string | null) => Promise<void>;
  declineRequest: (requestId: string, requesterUsername?: string | null) => Promise<void>;
  isAccepting: boolean;
  isDeclining: boolean;
}

/**
 * Hook to manage incoming follow requests for the current user.
 *
 * Provides the list of pending follow requests and mutations to accept or decline them.
 * Invalidates relevant queries on success so follower counts and follow statuses update.
 */
export function useFollowRequests(): UseFollowRequestsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query: fetch pending follow requests for the current user
  const {
    data: pendingRequests,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['followRequests', user?.id],
    queryFn: () => getPendingRequests(user!.id),
    enabled: !!user,
  });

  // Mutation: accept a follow request
  const acceptMutation = useMutation({
    mutationFn: async ({ requestId }: { requestId: string; requesterUsername?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      await acceptFollowRequest(requestId);
    },
    onSuccess: (_data, variables) => {
      const displayName = variables.requesterUsername
        ? `@${variables.requesterUsername}`
        : 'user';

      Toast.show({
        type: 'success',
        text1: `Accepted follow request from ${displayName}`,
        visibilityTime: 2000,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['followRequests', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to accept follow request',
        visibilityTime: 2000,
      });
    },
  });

  // Mutation: decline a follow request
  const declineMutation = useMutation({
    mutationFn: async ({ requestId }: { requestId: string; requesterUsername?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      await declineFollowRequest(requestId);
    },
    onSuccess: (_data, variables) => {
      const displayName = variables.requesterUsername
        ? `@${variables.requesterUsername}`
        : 'user';

      Toast.show({
        type: 'info',
        text1: `Declined follow request from ${displayName}`,
        visibilityTime: 2000,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['followRequests', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Failed to decline follow request',
        visibilityTime: 2000,
      });
    },
  });

  const acceptRequest = async (requestId: string, requesterUsername?: string | null): Promise<void> => {
    await acceptMutation.mutateAsync({ requestId, requesterUsername });
  };

  const declineRequest = async (requestId: string, requesterUsername?: string | null): Promise<void> => {
    await declineMutation.mutateAsync({ requestId, requesterUsername });
  };

  return {
    pendingRequests: pendingRequests ?? [],
    isLoading,
    isError,
    error: (queryError as Error | null) ?? null,
    acceptRequest,
    declineRequest,
    isAccepting: acceptMutation.isPending,
    isDeclining: declineMutation.isPending,
  };
}
