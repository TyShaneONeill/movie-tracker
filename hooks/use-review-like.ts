import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { toggleLike, fetchLikeStatus, type LikeStatusResponse } from '@/lib/like-service';

interface UseReviewLikeParams {
  targetType: 'review' | 'first_take';
  targetId: string;
  initialLiked?: boolean;
  initialLikeCount?: number;
  enabled?: boolean;
}

export function useReviewLike({
  targetType,
  targetId,
  initialLiked,
  initialLikeCount,
  enabled = true,
}: UseReviewLikeParams) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['reviewLike', targetType, targetId];

  const { data, isLoading } = useQuery<LikeStatusResponse>({
    queryKey,
    queryFn: () => fetchLikeStatus(user!.id, targetType, targetId),
    enabled: enabled && !!user && !!targetId,
    staleTime: 2 * 60 * 1000,
    // Use initial data if provided (avoids extra query when parent already has the data)
    ...(initialLiked !== undefined && initialLikeCount !== undefined
      ? { initialData: { liked: initialLiked, likeCount: initialLikeCount } }
      : {}),
  });

  const mutation = useMutation({
    mutationFn: () => toggleLike(targetType, targetId),
    // Optimistic update
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LikeStatusResponse>(queryKey);

      queryClient.setQueryData<LikeStatusResponse>(queryKey, (old) => {
        if (!old) return { liked: true, likeCount: 1 };
        return {
          liked: !old.liked,
          likeCount: old.liked
            ? Math.max(0, old.likeCount - 1)
            : old.likeCount + 1,
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (serverData) => {
      // Set the actual server data
      queryClient.setQueryData(queryKey, serverData);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['movieReviews'] });
      queryClient.invalidateQueries({ queryKey: ['userReviews'] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
    },
  });

  return {
    liked: data?.liked ?? initialLiked ?? false,
    likeCount: data?.likeCount ?? initialLikeCount ?? 0,
    isLoading,
    toggleLike: mutation.mutateAsync,
    isToggling: mutation.isPending,
  };
}
