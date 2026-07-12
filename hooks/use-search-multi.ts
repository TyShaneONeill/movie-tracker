import { useQuery } from '@tanstack/react-query';
import { searchMulti } from '@/lib/search-multi-service';
import type { SearchMultiResponse, TMDBMovie, TMDBTvShow } from '@/lib/tmdb.types';

interface UseSearchMultiOptions {
  query: string;
  page?: number;
  enabled?: boolean;
}

interface UseSearchMultiResult {
  movies: TMDBMovie[];
  tvShows: TMDBTvShow[];
  movieTotal: number;
  tvTotal: number;
  page: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

/**
 * Search v2 title fan-out in one call (movies + TV) via `search-multi`, with a
 * graceful fallback to the dedicated fns baked into the service. Replaces the
 * per-keystroke `useMovieSearch(title)` + `useTvShowSearch()` pair on the v2
 * screen. The legacy search screen keeps using those hooks directly.
 */
export function useSearchMulti({
  query,
  page = 1,
  enabled = true,
}: UseSearchMultiOptions): UseSearchMultiResult {
  const trimmedQuery = query.trim();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    SearchMultiResponse,
    Error
  >({
    queryKey: ['searchMulti', trimmedQuery, page],
    queryFn: () => searchMulti(trimmedQuery, page),
    enabled: enabled && trimmedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  return {
    movies: data?.movies ?? [],
    tvShows: data?.tvShows ?? [],
    movieTotal: data?.movieTotal ?? 0,
    tvTotal: data?.tvTotal ?? 0,
    page: data?.page ?? 1,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
