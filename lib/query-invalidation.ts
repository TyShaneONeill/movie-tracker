import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every cached query that depends on a user's user_movies state.
 * Call from onSuccess/onSettled of any mutation that inserts/updates/deletes a row in user_movies.
 *
 * Currently invalidates:
 * - ['userMovies'] — the user's library list
 * - ['watchlist-tmdb-ids'] — the release calendar's watchlist filter (SP4-A)
 *
 * Per-movie singular keys (e.g. ['userMovie', userId, tmdbId]) are NOT covered here —
 * callers that maintain those should invalidate them separately.
 */
export function invalidateUserMovieQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['userMovies'] });
  queryClient.invalidateQueries({ queryKey: ['watchlist-tmdb-ids'] });
}
