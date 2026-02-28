import { useQuery } from '@tanstack/react-query';
import { getTvShowDetails } from '@/lib/tv-show-service';
import type {
  TvShowDetailResponse,
  TMDBTvShowDetail,
  TMDBCastMember,
  TMDBCrewMember,
  TMDBVideo,
  TMDBWatchProviders,
  TMDBSeason,
  TMDBTvRecommendation,
} from '@/lib/tmdb.types';

interface UseTvShowDetailOptions {
  showId: string | number;
  enabled?: boolean;
}

interface UseTvShowDetailResult {
  show: TMDBTvShowDetail | null;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
  trailer: TMDBVideo | null;
  watchProviders: Record<string, TMDBWatchProviders>;
  seasons: TMDBSeason[];
  recommendations: TMDBTvRecommendation[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function useTvShowDetail({
  showId,
  enabled = true,
}: UseTvShowDetailOptions): UseTvShowDetailResult {
  const numericId = typeof showId === 'string' ? parseInt(showId, 10) : showId;
  const isValidId = !isNaN(numericId) && numericId > 0;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    TvShowDetailResponse,
    Error
  >({
    queryKey: ['tvShow', numericId],
    queryFn: () => getTvShowDetails(numericId),
    enabled: enabled && isValidId,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  return {
    show: data?.show ?? null,
    cast: data?.cast ?? [],
    crew: data?.crew ?? [],
    trailer: data?.trailer ?? null,
    watchProviders: data?.watchProviders ?? {},
    seasons: data?.seasons ?? [],
    recommendations: data?.recommendations ?? [],
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
