import { useQuery } from '@tanstack/react-query';
import { getMovieDetails } from '@/lib/movie-service';
import type {
  MovieDetailResponse,
  TMDBMovieDetail,
  TMDBCastMember,
} from '@/lib/tmdb.types';

interface UseMovieDetailOptions {
  movieId: string | number;
  enabled?: boolean;
}

interface UseMovieDetailResult {
  movie: TMDBMovieDetail | null;
  cast: TMDBCastMember[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useMovieDetail({
  movieId,
  enabled = true,
}: UseMovieDetailOptions): UseMovieDetailResult {
  const numericId = typeof movieId === 'string' ? parseInt(movieId, 10) : movieId;
  const isValidId = !isNaN(numericId) && numericId > 0;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    MovieDetailResponse,
    Error
  >({
    queryKey: ['movie', numericId],
    queryFn: () => getMovieDetails(numericId),
    enabled: enabled && isValidId,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  return {
    movie: data?.movie ?? null,
    cast: data?.cast ?? [],
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
