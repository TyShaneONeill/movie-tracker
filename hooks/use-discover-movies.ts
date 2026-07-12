import { useInfiniteQuery } from '@tanstack/react-query';
import { discoverMoviesByGenre, discoverMoviesByCompany } from '@/lib/movie-service';
import type { TMDBMovie, SearchMoviesResponse } from '@/lib/tmdb.types';

interface UseDiscoverMoviesOptions {
  genreId: number | null;
  /** When set, browse by production company instead of genre (Search v2 shelves). */
  companyIds?: number[] | null;
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
  companyIds = null,
  enabled = true,
}: UseDiscoverMoviesOptions): UseDiscoverMoviesResult {
  const hasCompanies = !!companyIds && companyIds.length > 0;
  const hasGenre = genreId !== null && genreId > 0;

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
    // company id array is stable-keyed by its joined string
    queryKey: ['discoverMovies', genreId, companyIds?.join(',') ?? null],
    queryFn: ({ pageParam }) =>
      hasCompanies
        ? discoverMoviesByCompany(companyIds!, pageParam as number)
        : discoverMoviesByGenre(genreId!, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: enabled && (hasCompanies || hasGenre),
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
