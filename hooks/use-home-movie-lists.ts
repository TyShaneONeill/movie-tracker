import { useMemo } from 'react';
import { useMovieList } from './use-movie-lists';
import type { TMDBMovie } from '@/lib/tmdb.types';

interface UseHomeMovieListsResult {
  trendingMovies: TMDBMovie[];
  nowPlayingMovies: TMDBMovie[];
  upcomingMovies: TMDBMovie[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Custom hook that fetches and processes movie lists for the home screen.
 *
 * This hook:
 * 1. Validates release dates (Now Playing = released, Coming Soon = unreleased)
 * 2. Deduplicates across sections (priority: Now Playing > Coming Soon > Trending)
 */
export function useHomeMovieLists(): UseHomeMovieListsResult {
  const {
    movies: rawTrending,
    isLoading: trendingLoading,
    refetch: refetchTrending,
  } = useMovieList({ type: 'trending' });

  const {
    movies: rawNowPlaying,
    isLoading: nowPlayingLoading,
    refetch: refetchNowPlaying,
  } = useMovieList({ type: 'now_playing' });

  const {
    movies: rawUpcoming,
    isLoading: upcomingLoading,
    refetch: refetchUpcoming,
  } = useMovieList({ type: 'upcoming' });

  const { trendingMovies, nowPlayingMovies, upcomingMovies } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const seenIds = new Set<number>();

    // 1. Now Playing: filter to released movies only, track IDs
    const nowPlaying = (rawNowPlaying || [])
      .filter((movie) => movie.release_date && movie.release_date <= today)
      .filter((movie) => {
        if (seenIds.has(movie.id)) return false;
        seenIds.add(movie.id);
        return true;
      });

    // 2. Coming Soon: filter to unreleased movies only, exclude seen IDs
    const upcoming = (rawUpcoming || [])
      .filter((movie) => movie.release_date && movie.release_date > today)
      .filter((movie) => {
        if (seenIds.has(movie.id)) return false;
        seenIds.add(movie.id);
        return true;
      });

    // 3. Trending: exclude any already shown in Now Playing or Coming Soon
    const trending = (rawTrending || []).filter((movie) => {
      if (seenIds.has(movie.id)) return false;
      seenIds.add(movie.id);
      return true;
    });

    return {
      trendingMovies: trending,
      nowPlayingMovies: nowPlaying,
      upcomingMovies: upcoming,
    };
  }, [rawTrending, rawNowPlaying, rawUpcoming]);

  const refetch = async () => {
    await Promise.all([refetchTrending(), refetchNowPlaying(), refetchUpcoming()]);
  };

  return {
    trendingMovies,
    nowPlayingMovies,
    upcomingMovies,
    isLoading: trendingLoading || nowPlayingLoading || upcomingLoading,
    refetch,
  };
}
