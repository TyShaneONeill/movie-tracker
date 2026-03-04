import { useQuery } from '@tanstack/react-query';
import { fetchExternalRatings, type ExternalRatingsResponse } from '@/lib/ratings-service';

interface UseExternalRatingsResult {
  ratings: ExternalRatingsResponse['ratings'];
  source: ExternalRatingsResponse['source'] | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useExternalRatings(
  tmdbId: number | undefined
): UseExternalRatingsResult {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    ExternalRatingsResponse,
    Error
  >({
    queryKey: ['externalRatings', tmdbId],
    queryFn: () => fetchExternalRatings(tmdbId!),
    enabled: !!tmdbId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    ratings: data?.ratings ?? null,
    source: data?.source ?? null,
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
