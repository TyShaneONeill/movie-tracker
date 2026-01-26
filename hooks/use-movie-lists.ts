import { useQuery } from '@tanstack/react-query';
import { getMovieList } from '@/lib/movie-service';
import type { MovieListResponse, TMDBMovie, MovieListType } from '@/lib/tmdb.types';

interface UseMovieListOptions {
  type: MovieListType;
  page?: number;
  enabled?: boolean;
}

interface UseMovieListResult {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  dates?: { minimum: string; maximum: string };
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useMovieList({
  type,
  page = 1,
  enabled = true,
}: UseMovieListOptions): UseMovieListResult {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    MovieListResponse,
    Error
  >({
    queryKey: ['movieList', type, page],
    queryFn: () => getMovieList(type, page),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    movies: data?.movies ?? [],
    page: data?.page ?? 1,
    totalPages: data?.totalPages ?? 0,
    totalResults: data?.totalResults ?? 0,
    dates: data?.dates,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
