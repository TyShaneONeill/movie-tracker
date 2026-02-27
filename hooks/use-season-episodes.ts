import { useQuery } from '@tanstack/react-query';
import { getSeasonEpisodes } from '@/lib/tv-show-service';
import type { SeasonDetailResponse, TMDBEpisode } from '@/lib/tmdb.types';

interface UseSeasonEpisodesOptions {
  showId: number;
  seasonNumber: number;
  enabled?: boolean;
}

interface UseSeasonEpisodesResult {
  episodes: TMDBEpisode[];
  seasonName: string;
  seasonOverview: string;
  posterPath: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useSeasonEpisodes({
  showId,
  seasonNumber,
  enabled = true,
}: UseSeasonEpisodesOptions): UseSeasonEpisodesResult {
  const { data, isLoading, isError, error, refetch } = useQuery<
    SeasonDetailResponse,
    Error
  >({
    queryKey: ['seasonEpisodes', showId, seasonNumber],
    queryFn: () => getSeasonEpisodes(showId, seasonNumber),
    enabled: enabled && showId > 0 && seasonNumber >= 0,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  return {
    episodes: data?.episodes ?? [],
    seasonName: data?.name ?? '',
    seasonOverview: data?.overview ?? '',
    posterPath: data?.posterPath ?? null,
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}
