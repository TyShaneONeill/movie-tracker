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

/**
 * Invalidate everything a TV Time import touches so enriched/imported items
 * appear WITHOUT an app restart. A single import writes movies, TV shows, and
 * episode watches, and (via genre_ids) changes stats — so this covers all three
 * surfaces the founder screenshotted plus the stats that read genre_ids:
 * - ['userMovies'] / ['watchlist-tmdb-ids'] — watched grid, library, calendar
 * - ['userTvShows'] — home Continue Watching + profile Watching card
 *   (both read useUserTvShows('watching'))
 * - ['episodeWatches'] — episode progress
 * - stats surfaces (userStats/profileStats/blindSpots/ratingPersonality) that
 *   key off genre_ids, so imported items start contributing immediately
 */
export function invalidateTvTimeImportQueries(queryClient: QueryClient): void {
  invalidateUserMovieQueries(queryClient);
  queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
  queryClient.invalidateQueries({ queryKey: ['episodeWatches'] });
  queryClient.invalidateQueries({ queryKey: ['userStats'] });
  queryClient.invalidateQueries({ queryKey: ['profileStats'] });
  queryClient.invalidateQueries({ queryKey: ['blindSpots'] });
  queryClient.invalidateQueries({ queryKey: ['ratingPersonality'] });
}
