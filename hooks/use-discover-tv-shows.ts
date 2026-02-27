import { useInfiniteQuery } from '@tanstack/react-query';
import { discoverTvShowsByGenre } from '@/lib/tv-show-service';
import type { TMDBTvShow, SearchTvShowsResponse } from '@/lib/tmdb.types';

interface UseDiscoverTvShowsOptions {
  genreId: number | null;
  enabled?: boolean;
}

interface UseDiscoverTvShowsResult {
  shows: TMDBTvShow[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

export function useDiscoverTvShows({
  genreId,
  enabled = true,
}: UseDiscoverTvShowsOptions): UseDiscoverTvShowsResult {
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<SearchTvShowsResponse, Error>({
    queryKey: ['discoverTvShows', genreId],
    queryFn: ({ pageParam }) => discoverTvShowsByGenre(genreId!, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: enabled && genreId !== null && genreId > 0,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const shows = data?.pages.flatMap((page) => page.shows) ?? [];

  return {
    shows,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
  };
}
