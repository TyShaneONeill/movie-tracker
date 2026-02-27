import { useQuery } from '@tanstack/react-query';
import { searchTvShows } from '@/lib/tv-show-service';
import type {
  SearchTvShowsResponse,
  TMDBTvShow,
} from '@/lib/tmdb.types';

interface UseTvShowSearchOptions {
  query: string;
  page?: number;
  enabled?: boolean;
}

interface UseTvShowSearchResult {
  shows: TMDBTvShow[];
  page: number;
  totalPages: number;
  totalResults: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useTvShowSearch({
  query,
  page = 1,
  enabled = true,
}: UseTvShowSearchOptions): UseTvShowSearchResult {
  const trimmedQuery = query.trim();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    SearchTvShowsResponse,
    Error
  >({
    queryKey: ['tvShowSearch', trimmedQuery, page],
    queryFn: () => searchTvShows(trimmedQuery, page),
    enabled: enabled && trimmedQuery.length >= 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    shows: data?.shows ?? [],
    page: data?.page ?? 1,
    totalPages: data?.totalPages ?? 0,
    totalResults: data?.totalResults ?? 0,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
