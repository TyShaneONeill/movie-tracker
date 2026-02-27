import { useQuery } from '@tanstack/react-query';
import { getTvShowList } from '@/lib/tv-show-service';
import type { TvShowListResponse, TMDBTvShow, TvShowListType } from '@/lib/tmdb.types';

interface UseTvShowListOptions {
  type: TvShowListType;
  page?: number;
  enabled?: boolean;
}

interface UseTvShowListResult {
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

export function useTvShowList({ type, page = 1, enabled = true }: UseTvShowListOptions): UseTvShowListResult {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<TvShowListResponse, Error>({
    queryKey: ['tvShowList', type, page],
    queryFn: () => getTvShowList(type, page),
    enabled,
    staleTime: 1000 * 60 * 5,
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
