import { useMemo } from 'react';
import { useTvShowList } from './use-tv-show-lists';
import type { TMDBTvShow } from '@/lib/tmdb.types';

interface UseHomeTvShowListsResult {
  trendingShows: TMDBTvShow[];
  airingTodayShows: TMDBTvShow[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Custom hook that fetches and processes TV show lists for the home screen.
 *
 * This hook:
 * 1. Fetches trending and airing today TV shows
 * 2. Deduplicates across sections (priority: Airing Today > Trending)
 */
export function useHomeTvShowLists(): UseHomeTvShowListsResult {
  const {
    shows: rawTrending,
    isLoading: trendingLoading,
    refetch: refetchTrending,
  } = useTvShowList({ type: 'trending' });

  const {
    shows: rawAiringToday,
    isLoading: airingTodayLoading,
    refetch: refetchAiringToday,
  } = useTvShowList({ type: 'airing_today' });

  const { trendingShows, airingTodayShows } = useMemo(() => {
    const seenIds = new Set<number>();

    // 1. Airing Today: take all, track IDs
    const airingToday = (rawAiringToday || []).filter((show) => {
      if (seenIds.has(show.id)) return false;
      seenIds.add(show.id);
      return true;
    });

    // 2. Trending: exclude any already shown in Airing Today
    const trending = (rawTrending || []).filter((show) => {
      if (seenIds.has(show.id)) return false;
      seenIds.add(show.id);
      return true;
    });

    return {
      trendingShows: trending,
      airingTodayShows: airingToday,
    };
  }, [rawTrending, rawAiringToday]);

  const refetch = async () => {
    await Promise.all([refetchTrending(), refetchAiringToday()]);
  };

  return {
    trendingShows,
    airingTodayShows,
    isLoading: trendingLoading || airingTodayLoading,
    refetch,
  };
}
