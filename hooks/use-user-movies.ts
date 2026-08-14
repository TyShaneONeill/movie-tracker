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
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
import type { UserMovie, MovieStatus, GroupedUserMovie } from '@/lib/database.types';
import type { UserMovieOrderBy } from '@/lib/movie-service';
import type { TMDBMovie } from '@/lib/tmdb.types';

// Poster priority: 2) user explicitly chose AI art, 1) AI art available, 0) neither
function posterPriority(movie: UserMovie): number {
  if (movie.display_poster === 'ai_generated' && movie.ai_poster_url) return 2;
  if (movie.ai_poster_url) return 1;
  return 0;
}

function watchRecency(movie: UserMovie): number {
  const timestamp = new Date(movie.watched_at ?? movie.added_at).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Groups movies by tmdb_id and returns one entry per movie with journey count.
 * Prioritizes journeys where user explicitly set display_poster to 'ai_generated',
 * then journeys with AI art available, then most recent watch date (added_at
 * fallback when watched_at is null).
 *
 * Exported for tests.
 */
export function groupMoviesByTmdbId(movies: UserMovie[]): GroupedUserMovie[] {
  const movieMap = new Map<number, { primary: UserMovie; count: number }>();

  for (const movie of movies) {
    const existing = movieMap.get(movie.tmdb_id);

    if (existing) {
      existing.count++;
      const priorityDelta = posterPriority(movie) - posterPriority(existing.primary);
      if (
        priorityDelta > 0 ||
        (priorityDelta === 0 && watchRecency(movie) > watchRecency(existing.primary))
      ) {
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

export function useUserMovies(status?: MovieStatus, orderBy: UserMovieOrderBy = 'added') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['userMovies', user?.id, status, orderBy],
    queryFn: async () => {
      const result = await fetchUserMovies(user!.id, status, orderBy);
      return result;
    },
    enabled: !!user,
  });

  // In watched mode, re-sort client-side by watched_at ?? added_at: rows with
  // no watched_at (plain mark-as-watched never writes one) would otherwise
  // sink below years-old dated rows under SQL NULLS LAST. The two-level SQL
  // order remains a stable pre-sort, and position now matches the grouping
  // tiebreak. Array.prototype.sort is stable, so SQL order breaks ties.
  const sortedMovies = useMemo(() => {
    if (!query.data) return [];
    if (orderBy !== 'watched') return query.data;
    return [...query.data].sort((a, b) => watchRecency(b) - watchRecency(a));
  }, [query.data, orderBy]);

  // Group movies by tmdb_id for collection grid display
  const groupedMovies = useMemo(() => groupMoviesByTmdbId(sortedMovies), [sortedMovies]);

  const addMutation = useMutation({
    mutationFn: ({
      movie,
      status,
    }: {
      movie: TMDBMovie;
      status?: MovieStatus;
    }) => addMovieToLibrary(user!.id, movie, status, { source: 'search' }),
    onSuccess: () => {
      invalidateUserMovieQueries(queryClient);
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
      invalidateUserMovieQueries(queryClient);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tmdbId: number) => removeMovieFromLibrary(user!.id, tmdbId),
    onSuccess: () => {
      invalidateUserMovieQueries(queryClient);
    },
  });

  return {
    movies: sortedMovies,
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
