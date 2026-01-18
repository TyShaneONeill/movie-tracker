import { useQuery } from '@tanstack/react-query';
import { searchMovies } from '@/lib/movie-service';
import type {
  SearchMoviesResponse,
  TMDBMovie,
  TMDBActor,
  SearchType,
} from '@/lib/tmdb.types';

interface UseMovieSearchOptions {
  query: string;
  page?: number;
  searchType?: SearchType;
  enabled?: boolean;
}

interface UseMovieSearchResult {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  actor?: TMDBActor;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useMovieSearch({
  query,
  page = 1,
  searchType = 'title',
  enabled = true,
}: UseMovieSearchOptions): UseMovieSearchResult {
  const trimmedQuery = query.trim();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    SearchMoviesResponse,
    Error
  >({
    queryKey: ['movieSearch', trimmedQuery, page, searchType],
    queryFn: () => searchMovies(trimmedQuery, page, searchType),
    enabled: enabled && trimmedQuery.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  return {
    movies: data?.movies ?? [],
    page: data?.page ?? 1,
    totalPages: data?.totalPages ?? 0,
    totalResults: data?.totalResults ?? 0,
    actor: data?.actor,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
