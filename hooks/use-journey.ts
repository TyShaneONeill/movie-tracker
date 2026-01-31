import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchJourneyById,
  updateJourney,
  deleteJourney,
} from '@/lib/movie-service';
import type { UserMovie, FirstTake, JourneyUpdate } from '@/lib/database.types';

// Type for journey with associated first take
export interface JourneyWithFirstTake extends UserMovie {
  firstTake: FirstTake | null;
}

// Fetch journey with its associated First Take
async function fetchJourneyWithFirstTake(
  journeyId: string,
  userId: string
): Promise<JourneyWithFirstTake | null> {
  // Fetch the journey
  const journey = await fetchJourneyById(journeyId);

  if (!journey) {
    return null;
  }

  // Fetch the associated First Take for this movie
  const { data: firstTake, error } = await supabase
    .from('first_takes')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', journey.tmdb_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch first take');
  }

  return {
    ...journey,
    firstTake: firstTake as FirstTake | null,
  };
}

// Hook to fetch a journey with its associated First Take
export function useJourney(journeyId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['journey', journeyId, user?.id],
    queryFn: () => fetchJourneyWithFirstTake(journeyId!, user!.id),
    enabled: !!journeyId && !!user?.id,
  });
}

// Hook providing mutation functions for updating and deleting journeys
export function useJourneyMutations() {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({
      journeyId,
      data,
    }: {
      journeyId: string;
      data: JourneyUpdate;
    }) => updateJourney(journeyId, data),
    onSuccess: (updatedJourney) => {
      // Invalidate specific journey query
      queryClient.invalidateQueries({
        queryKey: ['journey', updatedJourney.id],
      });
      // Invalidate user movies list
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (journeyId: string) => deleteJourney(journeyId),
    onSuccess: () => {
      // Invalidate user movies list
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
      // Invalidate all journey queries
      queryClient.invalidateQueries({ queryKey: ['journey'] });
    },
  });

  return {
    updateJourney: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    deleteJourney: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
