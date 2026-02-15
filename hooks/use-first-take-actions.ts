import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import {
  createFirstTake,
  getFirstTakeByTmdbId,
  updateFirstTake,
  deleteFirstTake,
  type CreateFirstTakeData,
} from '@/lib/first-take-service';
import type { FirstTake } from '@/lib/database.types';

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
  updateTake: (updates: { reactionEmoji?: string; quoteText?: string; isSpoiler?: boolean }) => Promise<FirstTake>;
  deleteTake: () => Promise<void>;
}

export function useFirstTakeActions(tmdbId: number): UseFirstTakeActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();

  // Query to check if a First Take exists for this movie
  const { data: existingTake, isLoading: isLoadingTake } = useQuery({
    queryKey: ['firstTake', user?.id, tmdbId],
    queryFn: () => getFirstTakeByTmdbId(user!.id, tmdbId),
    enabled: !!user && tmdbId > 0,
  });

  // Mutation to create a new First Take
  const createMutation = useMutation({
    mutationFn: async (data: CreateFirstTakeData) => {
      if (!user) throw new Error('Not authenticated');
      return createFirstTake(user.id, data);
    },
    onSuccess: () => {
      // Invalidate the single movie's first take query
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId] });
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
    mutationFn: async (updates: { reactionEmoji?: string; quoteText?: string; isSpoiler?: boolean }) => {
      if (!existingTake) throw new Error('No First Take to update');
      return updateFirstTake(existingTake.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId] });
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
      queryClient.invalidateQueries({ queryKey: ['firstTake', user?.id, tmdbId] });
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
    });
  };

  const updateTake = async (updates: {
    reactionEmoji?: string;
    quoteText?: string;
    isSpoiler?: boolean;
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
