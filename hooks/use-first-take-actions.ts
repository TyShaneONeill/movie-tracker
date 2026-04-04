import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import { analytics } from '@/lib/analytics';
import {
  createFirstTake,
  getFirstTakeByTmdbId,
  updateFirstTake,
  deleteFirstTake,
  type CreateFirstTakeData,
} from '@/lib/first-take-service';
import type { FirstTake, FirstTakeMediaType, ReviewVisibility } from '@/lib/database.types';

interface UseFirstTakeActionsResult {
  // State
  existingTake: FirstTake | null;
  hasFirstTake: boolean;
  isLoadingTake: boolean;

  // Mutation states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  // Actions
  createTake: (data: Omit<CreateFirstTakeData, 'tmdbId'> & { tmdbId?: number }) => Promise<FirstTake>;
  updateTake: (updates: { reactionEmoji?: string; quoteText?: string; isSpoiler?: boolean; rating?: number | null; visibility?: ReviewVisibility }) => Promise<FirstTake>;
  deleteTake: () => Promise<void>;
}

export function useFirstTakeActions(tmdbId: number, mediaType: FirstTakeMediaType = 'movie'): UseFirstTakeActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();

  // Query to check if a First Take exists for this movie
  const { data: existingTake, isLoading: isLoadingTake } = useQuery({
    queryKey: ['firstTake', user?.id, tmdbId, mediaType],
    queryFn: () => getFirstTakeByTmdbId(user!.id, tmdbId, mediaType),
    enabled: !!user && tmdbId > 0,
  });

  // Mutation to create a new First Take
  const createMutation = useMutation({
    mutationFn: async (data: CreateFirstTakeData) => {
      if (!user) throw new Error('Not authenticated');
      return createFirstTake(user.id, data);
    },
    onSuccess: (_data, variables) => {
      analytics.track('first_take:create', {
        tmdb_id: variables.tmdbId,
        has_rating: variables.rating != null,
        has_quote: !!variables.quoteText,
        media_type: variables.mediaType ?? 'movie',
      });
      // Invalidate the single movie's first take query
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId, mediaType] });
      // Invalidate the profile's first takes feed
      queryClient.invalidateQueries({ queryKey: ['first-takes', user?.id] });
      // Invalidate profile stats (firstTakes count)
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
      // Invalidate the global activity feed so new First Takes appear on home
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      // Check for newly earned achievements
      triggerAchievementCheck();
    },
  });

  // Mutation to update an existing First Take
  const updateMutation = useMutation({
    mutationFn: async (updates: { reactionEmoji?: string; quoteText?: string; isSpoiler?: boolean; rating?: number | null; visibility?: ReviewVisibility }) => {
      if (!existingTake) throw new Error('No First Take to update');
      return updateFirstTake(existingTake.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['first-takes', user?.id] });
    },
  });

  // Mutation to delete a First Take
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingTake) throw new Error('No First Take to delete');
      return deleteFirstTake(existingTake.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['first-takes', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
    },
  });

  const createTake = async (
    data: Omit<CreateFirstTakeData, 'tmdbId'> & { tmdbId?: number }
  ): Promise<FirstTake> => {
    return createMutation.mutateAsync({
      ...data,
      tmdbId: data.tmdbId ?? tmdbId,
      mediaType: data.mediaType ?? mediaType,
    });
  };

  const updateTake = async (updates: {
    reactionEmoji?: string;
    quoteText?: string;
    isSpoiler?: boolean;
    rating?: number | null;
    visibility?: ReviewVisibility;
  }): Promise<FirstTake> => {
    return updateMutation.mutateAsync(updates);
  };

  const deleteTake = async (): Promise<void> => {
    await deleteMutation.mutateAsync();
  };

  return {
    // State
    existingTake: existingTake ?? null,
    hasFirstTake: !!existingTake,
    isLoadingTake,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Actions
    createTake,
    updateTake,
    deleteTake,
  };
}
