import { useMemo, useCallback } from 'react';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useUserTvShows } from '@/hooks/use-user-tv-shows';
import { mergeWatching, type WatchingItem } from '@/lib/lists-v2-logic';

export interface UseWatchingListResult {
  items: WatchingItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The Watching "list" = `user_movies.status='watching'` + `user_tv_shows
 * .status='watching'`, merged and sorted most-recently-touched first (contract
 * B). Reuses the existing per-type hooks (no re-derivation); the merge/sort is
 * pure (`mergeWatching`).
 */
export function useWatchingList(): UseWatchingListResult {
  const {
    movies,
    isLoading: moviesLoading,
    isError: moviesError,
    refetch: refetchMovies,
  } = useUserMovies('watching');
  const {
    shows,
    isLoading: showsLoading,
    isError: showsError,
    refetch: refetchShows,
  } = useUserTvShows('watching');

  const items = useMemo(() => mergeWatching(movies, shows), [movies, shows]);

  const refetch = useCallback(() => {
    refetchMovies();
    refetchShows();
  }, [refetchMovies, refetchShows]);

  return {
    items,
    isLoading: moviesLoading || showsLoading,
    isError: moviesError || showsError,
    refetch,
  };
}
