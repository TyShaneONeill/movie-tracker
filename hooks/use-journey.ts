import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchJourneyById,
  fetchJourneysByTmdbId,
  createNewJourney,
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
export function useJourneyMutations(tmdbId?: number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const updateMutation = useMutation({
    mutationFn: ({
      journeyId,
      data,
    }: {
      journeyId: string;
      data: JourneyUpdate;
    }) => updateJourney(journeyId, data),
    // Optimistic update for instant UI response
    onMutate: async ({ journeyId, data }) => {
      // Only cancel/update the specific query we know about
      const queryKey = ['journeysByMovie', tmdbId, user?.id];
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData<JourneysWithFirstTake>(queryKey);

      // Optimistically update the specific query
      if (previousData) {
        queryClient.setQueryData<JourneysWithFirstTake>(queryKey, {
          ...previousData,
          journeys: previousData.journeys.map((j) =>
            j.id === journeyId ? { ...j, ...data } : j
          ),
        });
      }

      return { previousData, queryKey };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousData && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
    },
    onSuccess: (updatedJourney) => {
      // Only invalidate on success, not onSettled (which runs on error too)
      // Use a slight delay to avoid rapid successive invalidations
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['journeysByMovie', updatedJourney.tmdb_id],
        });
      }, 100);
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

// Type for journeys with associated first take
export interface JourneysWithFirstTake {
  journeys: UserMovie[];
  firstTake: FirstTake | null;
}

// Fetch all journeys for a movie with the associated First Take
async function fetchJourneysWithFirstTake(
  userId: string,
  tmdbId: number
): Promise<JourneysWithFirstTake> {
  // Fetch all journeys for this movie
  const journeys = await fetchJourneysByTmdbId(userId, tmdbId);

  // Fetch the associated First Take for this movie
  const { data: firstTake, error } = await supabase
    .from('first_takes')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch first take');
  }

  return {
    journeys,
    firstTake: firstTake as FirstTake | null,
  };
}

// Hook to fetch all journeys for a movie (supports rewatches)
export function useJourneysByMovie(tmdbId: number | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['journeysByMovie', tmdbId, user?.id],
    queryFn: () => fetchJourneysWithFirstTake(user!.id, tmdbId!),
    enabled: !!tmdbId && !!user?.id,
  });
}

// Hook providing mutation for creating new journeys (rewatches)
export function useCreateJourney() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useMutation({
    mutationFn: (existingJourney: UserMovie) =>
      createNewJourney(user!.id, existingJourney),
    onSuccess: (newJourney) => {
      // Invalidate journeys for this movie
      queryClient.invalidateQueries({
        queryKey: ['journeysByMovie', newJourney.tmdb_id],
      });
      // Invalidate user movies list
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  return {
    createJourney: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
  };
}
