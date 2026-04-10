import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import {
  createReview,
  getReviewByTmdbId,
  updateReview,
  deleteReview,
  type CreateReviewData,
} from '@/lib/review-service';
import type { Review, ReviewVisibility } from '@/lib/database.types';

interface UseReviewActionsResult {
  // State
  existingReview: Review | null;
  hasReview: boolean;
  isLoadingReview: boolean;

  // Mutation states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  // Actions
  createReview: (data: Omit<CreateReviewData, 'tmdbId'> & { tmdbId?: number }) => Promise<Review>;
  updateReview: (updates: { title?: string; reviewText?: string; rating?: number; isSpoiler?: boolean; isRewatch?: boolean; visibility?: ReviewVisibility }) => Promise<Review>;
  deleteReview: () => Promise<void>;
}

export function useReviewActions(tmdbId: number, mediaType: string = 'movie'): UseReviewActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();

  // Query to check if a review exists for this movie
  const { data: existingReview, isLoading: isLoadingReview } = useQuery({
    queryKey: ['review', user?.id, tmdbId, mediaType],
    queryFn: () => getReviewByTmdbId(user!.id, tmdbId, mediaType),
    enabled: !!user && tmdbId > 0,
  });

  // Mutation to create a new review
  const createMutation = useMutation({
    mutationFn: async (data: CreateReviewData) => {
      if (!user) throw new Error('Not authenticated');
      return createReview(user.id, { ...data, mediaType: mediaType as 'movie' | 'tv_show' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['friendsRatings', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
      triggerAchievementCheck();
    },
  });

  // Mutation to update an existing review
  const updateMutation = useMutation({
    mutationFn: async (updates: { title?: string; reviewText?: string; rating?: number; isSpoiler?: boolean; isRewatch?: boolean; visibility?: ReviewVisibility }) => {
      if (!existingReview) throw new Error('No review to update');
      return updateReview(existingReview.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['friendsRatings', tmdbId] });
    },
  });

  // Mutation to delete a review
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingReview) throw new Error('No review to delete');
      return deleteReview(existingReview.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['friendsRatings', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
    },
  });

  const handleCreateReview = async (
    data: Omit<CreateReviewData, 'tmdbId'> & { tmdbId?: number }
  ): Promise<Review> => {
    return createMutation.mutateAsync({
      ...data,
      tmdbId: data.tmdbId ?? tmdbId,
    });
  };

  const handleUpdateReview = async (updates: {
    title?: string;
    reviewText?: string;
    rating?: number;
    isSpoiler?: boolean;
    isRewatch?: boolean;
    visibility?: ReviewVisibility;
  }): Promise<Review> => {
    return updateMutation.mutateAsync(updates);
  };

  const handleDeleteReview = async (): Promise<void> => {
    await deleteMutation.mutateAsync();
  };

  return {
    existingReview: existingReview ?? null,
    hasReview: !!existingReview,
    isLoadingReview,

    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    createReview: handleCreateReview,
    updateReview: handleUpdateReview,
    deleteReview: handleDeleteReview,
  };
}
