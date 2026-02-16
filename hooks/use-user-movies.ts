import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchUserMovies,
  addMovieToLibrary,
  updateMovieStatus,
  removeMovieFromLibrary,
  getMovieByTmdbId,
} from '@/lib/movie-service';
import type { UserMovie, MovieStatus, GroupedUserMovie } from '@/lib/database.types';
import type { TMDBMovie } from '@/lib/tmdb.types';

/**
 * Groups movies by tmdb_id and returns one entry per movie with journey count.
 * Prioritizes journeys where user explicitly set display_poster to 'ai_generated',
 * then journeys with AI art available, then most recent.
 */
function groupMoviesByTmdbId(movies: UserMovie[]): GroupedUserMovie[] {
  const movieMap = new Map<number, { primary: UserMovie; count: number }>();

  for (const movie of movies) {
    const existing = movieMap.get(movie.tmdb_id);

    if (existing) {
      existing.count++;
      // Priority: 1) User explicitly set display_poster to ai_generated, 2) Has AI art, 3) Most recent
      const currentHasExplicitAiPreference = existing.primary.display_poster === 'ai_generated' && existing.primary.ai_poster_url;
      const newHasExplicitAiPreference = movie.display_poster === 'ai_generated' && movie.ai_poster_url;

      if (newHasExplicitAiPreference && !currentHasExplicitAiPreference) {
        existing.primary = movie;
      } else if (!currentHasExplicitAiPreference && movie.ai_poster_url && !existing.primary.ai_poster_url) {
        // Fallback: prioritize having AI art available
        existing.primary = movie;
      }
    } else {
      movieMap.set(movie.tmdb_id, { primary: movie, count: 1 });
    }
  }

  return Array.from(movieMap.values()).map(({ primary, count }) => ({
    ...primary,
    journeyCount: count,
  }));
}

export function useUserMovies(status?: MovieStatus) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['userMovies', user?.id, status],
    queryFn: async () => {
      const result = await fetchUserMovies(user!.id, status);
      return result;
    },
    enabled: !!user,
  });

  // Group movies by tmdb_id for collection grid display
  const groupedMovies = useMemo(() => {
    if (!query.data) return [];
    return groupMoviesByTmdbId(query.data);
  }, [query.data]);

  const addMutation = useMutation({
    mutationFn: ({
      movie,
      status,
    }: {
      movie: TMDBMovie;
      status?: MovieStatus;
    }) => addMovieToLibrary(user!.id, movie, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      tmdbId,
      status,
    }: {
      tmdbId: number;
      status: MovieStatus;
    }) => updateMovieStatus(user!.id, tmdbId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tmdbId: number) => removeMovieFromLibrary(user!.id, tmdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  return {
    movies: query.data ?? [],
    groupedMovies,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    addMovie: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    updateStatus: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    removeMovie: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

// Hook to check if a specific movie is in user's library
export function useMovieInLibrary(tmdbId: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userMovie', user?.id, tmdbId],
    queryFn: () => getMovieByTmdbId(user!.id, tmdbId),
    enabled: !!user && !!tmdbId,
  });
}
