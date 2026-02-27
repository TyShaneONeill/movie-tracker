import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import {
  getWatchedEpisodes,
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
} from '@/lib/tv-show-service';
import type { UserEpisodeWatch } from '@/lib/database.types';
import type { TMDBEpisode } from '@/lib/tmdb.types';

interface UseEpisodeActionsResult {
  watchedEpisodes: UserEpisodeWatch[];
  isLoading: boolean;

  markWatched: (episode: TMDBEpisode) => Promise<void>;
  isMarkingWatched: boolean;

  unmarkWatched: (episodeNumber: number) => Promise<void>;
  isUnmarkingWatched: boolean;

  markAllWatched: (episodes: TMDBEpisode[]) => Promise<void>;
  isMarkingAllWatched: boolean;

  isEpisodeWatched: (episodeNumber: number) => boolean;
}

export function useEpisodeActions(
  userTvShowId: string,
  tmdbShowId: number,
  seasonNumber: number
): UseEpisodeActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();

  const { data: watchedEpisodes = [], isLoading } = useQuery({
    queryKey: ['episodeWatches', user?.id, userTvShowId, seasonNumber],
    queryFn: () => getWatchedEpisodes(user!.id, userTvShowId, seasonNumber),
    enabled: !!user && !!userTvShowId,
  });

  const invalidateRelated = () => {
    queryClient.invalidateQueries({
      queryKey: ['episodeWatches', user?.id, userTvShowId, seasonNumber],
    });
    queryClient.invalidateQueries({ queryKey: ['userTvShow', user?.id] });
    triggerAchievementCheck();
  };

  const markWatchedMutation = useMutation({
    mutationFn: async (episode: TMDBEpisode) => {
      if (!user) throw new Error('Not authenticated');
      return markEpisodeWatched(user.id, userTvShowId, tmdbShowId, episode);
    },
    onSuccess: invalidateRelated,
  });

  const unmarkWatchedMutation = useMutation({
    mutationFn: async (episodeNumber: number) => {
      if (!user) throw new Error('Not authenticated');
      return unmarkEpisodeWatched(user.id, userTvShowId, seasonNumber, episodeNumber);
    },
    onSuccess: invalidateRelated,
  });

  const markAllWatchedMutation = useMutation({
    mutationFn: async (episodes: TMDBEpisode[]) => {
      if (!user) throw new Error('Not authenticated');
      return markSeasonWatched(user.id, userTvShowId, tmdbShowId, episodes);
    },
    onSuccess: invalidateRelated,
  });

  const isEpisodeWatched = (episodeNumber: number): boolean => {
    return watchedEpisodes.some((ep) => ep.episode_number === episodeNumber);
  };

  return {
    watchedEpisodes,
    isLoading,

    markWatched: async (episode: TMDBEpisode) => {
      await markWatchedMutation.mutateAsync(episode);
    },
    isMarkingWatched: markWatchedMutation.isPending,

    unmarkWatched: async (episodeNumber: number) => {
      await unmarkWatchedMutation.mutateAsync(episodeNumber);
    },
    isUnmarkingWatched: unmarkWatchedMutation.isPending,

    markAllWatched: async (episodes: TMDBEpisode[]) => {
      await markAllWatchedMutation.mutateAsync(episodes);
    },
    isMarkingAllWatched: markAllWatchedMutation.isPending,

    isEpisodeWatched,
  };
}
