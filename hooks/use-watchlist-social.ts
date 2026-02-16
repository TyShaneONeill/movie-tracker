import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  hasLikedWatchlist,
  getWatchlistLikeCount,
  likeWatchlist,
  unlikeWatchlist,
  getWatchlistComments,
  addWatchlistComment,
  deleteWatchlistComment,
} from '@/lib/watchlist-social-service';
import type { WatchlistCommentWithProfile } from '@/lib/database.types';

const FIVE_MINUTES = 5 * 60 * 1000;

interface UseWatchlistSocialResult {
  // Like state
  isLiked: boolean;
  likeCount: number;
  isLoadingLike: boolean;
  isTogglingLike: boolean;
  toggleLike: () => Promise<void>;

  // Comment state
  comments: WatchlistCommentWithProfile[];
  isLoadingComments: boolean;
  isAddingComment: boolean;
  addComment: (text: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
}

export function useWatchlistSocial(ownerId: string): UseWatchlistSocialResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query: has current user liked this watchlist?
  const { data: isLiked, isLoading: isLoadingLikeStatus } = useQuery({
    queryKey: ['watchlistLike', user?.id, ownerId],
    queryFn: () => hasLikedWatchlist(user!.id, ownerId),
    enabled: !!user && !!ownerId && user.id !== ownerId,
    staleTime: FIVE_MINUTES,
  });

  // Query: total like count
  const { data: likeCount, isLoading: isLoadingLikeCount } = useQuery({
    queryKey: ['watchlistLikeCount', ownerId],
    queryFn: () => getWatchlistLikeCount(ownerId),
    enabled: !!ownerId,
    staleTime: FIVE_MINUTES,
  });

  // Query: comments
  const { data: comments, isLoading: isLoadingComments } = useQuery({
    queryKey: ['watchlistComments', ownerId],
    queryFn: () => getWatchlistComments(ownerId),
    enabled: !!ownerId,
    staleTime: FIVE_MINUTES,
  });

  // Mutation: toggle like with optimistic update
  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (isLiked) {
        await unlikeWatchlist(user.id, ownerId);
        return false;
      } else {
        await likeWatchlist(user.id, ownerId);
        return true;
      }
    },
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['watchlistLike', user?.id, ownerId],
      });
      await queryClient.cancelQueries({
        queryKey: ['watchlistLikeCount', ownerId],
      });

      // Snapshot previous values
      const previousLiked = queryClient.getQueryData<boolean>([
        'watchlistLike',
        user?.id,
        ownerId,
      ]);
      const previousCount = queryClient.getQueryData<number>([
        'watchlistLikeCount',
        ownerId,
      ]);

      // Optimistically update
      queryClient.setQueryData(
        ['watchlistLike', user?.id, ownerId],
        !previousLiked
      );
      queryClient.setQueryData(
        ['watchlistLikeCount', ownerId],
        (previousCount ?? 0) + (previousLiked ? -1 : 1)
      );

      return { previousLiked, previousCount };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousLiked !== undefined) {
        queryClient.setQueryData(
          ['watchlistLike', user?.id, ownerId],
          context.previousLiked
        );
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(
          ['watchlistLikeCount', ownerId],
          context.previousCount
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['watchlistLike', user?.id, ownerId],
      });
      queryClient.invalidateQueries({
        queryKey: ['watchlistLikeCount', ownerId],
      });
    },
  });

  // Mutation: add comment
  const addCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error('Not authenticated');
      return addWatchlistComment(user.id, ownerId, text);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['watchlistComments', ownerId],
      });
    },
  });

  // Mutation: delete comment
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await deleteWatchlistComment(commentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['watchlistComments', ownerId],
      });
    },
  });

  return {
    isLiked: isLiked ?? false,
    likeCount: likeCount ?? 0,
    isLoadingLike: isLoadingLikeStatus || isLoadingLikeCount,
    isTogglingLike: toggleLikeMutation.isPending,
    toggleLike: async () => {
      await toggleLikeMutation.mutateAsync();
    },

    comments: comments ?? [],
    isLoadingComments,
    isAddingComment: addCommentMutation.isPending,
    addComment: async (text: string) => {
      await addCommentMutation.mutateAsync(text);
    },
    deleteComment: async (commentId: string) => {
      await deleteCommentMutation.mutateAsync(commentId);
    },
  };
}
