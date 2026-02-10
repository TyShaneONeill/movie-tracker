import { useInfiniteQuery } from '@tanstack/react-query';
import { discoverMoviesByGenre } from '@/lib/movie-service';
import type { TMDBMovie, SearchMoviesResponse } from '@/lib/tmdb.types';

interface UseDiscoverMoviesOptions {
  genreId: number | null;
  enabled?: boolean;
}

interface UseDiscoverMoviesResult {
  movies: TMDBMovie[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

export function useDiscoverMovies({
  genreId,
  enabled = true,
}: UseDiscoverMoviesOptions): UseDiscoverMoviesResult {
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<SearchMoviesResponse, Error>({
    queryKey: ['discoverMovies', genreId],
    queryFn: ({ pageParam }) => discoverMoviesByGenre(genreId!, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: enabled && genreId !== null && genreId > 0,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const movies = data?.pages.flatMap((page) => page.movies) ?? [];

  return {
    movies,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
  };
}
