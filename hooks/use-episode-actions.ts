import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import {
  getWatchedEpisodes,
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
  unmarkSeasonWatched,
} from '@/lib/tv-show-service';
import type { UserEpisodeWatch, UserTvShow } from '@/lib/database.types';
import type { TMDBEpisode } from '@/lib/tmdb.types';

interface UseEpisodeActionsResult {
  watchedEpisodes: UserEpisodeWatch[];
  isLoading: boolean;

  markWatched: (episode: TMDBEpisode, totalEpisodesInSeason: number) => Promise<void>;
  isMarkingWatched: boolean;

  unmarkWatched: (episodeNumber: number) => Promise<void>;
  isUnmarkingWatched: boolean;

  markAllWatched: (episodes: TMDBEpisode[]) => Promise<void>;
  isMarkingAllWatched: boolean;

  unmarkAllWatched: () => Promise<void>;
  isUnmarkingAllWatched: boolean;

  allWatched: (episodeCount: number) => boolean;
  isEpisodeWatched: (episodeNumber: number) => boolean;
}

export function useEpisodeActions(
  userTvShowId: string,
  tmdbShowId: number,
  seasonNumber: number,
  options?: { onAllWatched?: () => void; onAllUnwatched?: () => void }
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
    mutationFn: async ({ episode, totalEpisodesInSeason }: { episode: TMDBEpisode; totalEpisodesInSeason: number }) => {
      if (!user) throw new Error('Not authenticated');
      return markEpisodeWatched(user.id, userTvShowId, tmdbShowId, episode, totalEpisodesInSeason);
    },
    onSuccess: (data) => {
      invalidateRelated();

      // Authoritative signal from the RPC: if the auto-flip branch fired,
      // the DB has already been updated to status='watched'. Fire the toast
      // and skip the client-side auto-promote.
      if (data.flipped) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        Toast.show({
          type: 'success',
          text1: '🎉 Series complete!',
          text2: cachedShow ? `${cachedShow.name} has been marked as Watched.` : 'Show has been marked as Watched.',
          visibilityTime: 4000,
        });
        return;
      }

      // Legacy path: RPC did not auto-flip (show has no tmdb_status, or
      // is Returning Series, or count didn't hit threshold). Fall back to
      // the client-side count heuristic, with the existing Returning Series
      // guard from PR #390.
      if (options?.onAllWatched) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        if (cachedShow && cachedShow.status !== 'watched' && cachedShow.tmdb_status !== 'Returning Series') {
          const total = cachedShow.number_of_episodes ?? 0;
          const watched = cachedShow.episodes_watched ?? 0;
          if (total > 0 && watched + 1 >= total) {
            Toast.show({ type: 'success', text1: '🎉 Series complete!', text2: `${cachedShow.name} has been marked as Watched.`, visibilityTime: 4000 });
            options.onAllWatched();
          }
        }
      }
    },
  });

  const unmarkWatchedMutation = useMutation({
    mutationFn: async (episodeNumber: number) => {
      if (!user) throw new Error('Not authenticated');
      return unmarkEpisodeWatched(user.id, userTvShowId, seasonNumber, episodeNumber);
    },
    onSuccess: () => {
      invalidateRelated();
      if (options?.onAllUnwatched) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        if (cachedShow && cachedShow.status === 'watched') {
          Toast.show({
            type: 'info',
            text1: 'Status updated to Watching',
            text2: 'You have unwatched episodes remaining.',
            visibilityTime: 3000,
          });
          options.onAllUnwatched();
        }
      }
    },
  });

  const markAllWatchedMutation = useMutation({
    mutationFn: async (episodes: TMDBEpisode[]) => {
      if (!user) throw new Error('Not authenticated');
      return markSeasonWatched(user.id, userTvShowId, tmdbShowId, episodes);
    },
    onSuccess: (_data, episodes) => {
      invalidateRelated();
      if (options?.onAllWatched) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        if (cachedShow && cachedShow.status !== 'watched' && cachedShow.tmdb_status !== 'Returning Series') {
          const total = cachedShow.number_of_episodes ?? 0;
          const watched = cachedShow.episodes_watched ?? 0;
          const alreadyInSeason = watchedEpisodes.filter(w =>
            episodes.some(e => e.episode_number === w.episode_number)
          ).length;
          const newlyAdded = episodes.length - alreadyInSeason;
          if (total > 0 && newlyAdded > 0 && watched + newlyAdded >= total) {
            Toast.show({ type: 'success', text1: '🎉 Series complete!', text2: `${cachedShow.name} has been marked as Watched.`, visibilityTime: 4000 });
            options.onAllWatched();
          }
        }
      }
    },
  });

  const unmarkAllWatchedMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      return unmarkSeasonWatched(user.id, userTvShowId, seasonNumber);
    },
    onSuccess: () => {
      invalidateRelated();
      if (options?.onAllUnwatched) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        if (cachedShow && cachedShow.status === 'watched') {
          Toast.show({
            type: 'info',
            text1: 'Status updated to Watching',
            text2: 'You have unwatched episodes remaining.',
            visibilityTime: 3000,
          });
          options.onAllUnwatched();
        }
      }
    },
  });

  const allWatched = (episodeCount: number): boolean => {
    return watchedEpisodes.length >= episodeCount && episodeCount > 0;
  };

  const isEpisodeWatched = (episodeNumber: number): boolean => {
    return watchedEpisodes.some((ep) => ep.episode_number === episodeNumber);
  };

  return {
    watchedEpisodes,
    isLoading,

    markWatched: async (episode: TMDBEpisode, totalEpisodesInSeason: number) => {
      await markWatchedMutation.mutateAsync({ episode, totalEpisodesInSeason });
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

    unmarkAllWatched: async () => {
      await unmarkAllWatchedMutation.mutateAsync();
    },
    isUnmarkingAllWatched: unmarkAllWatchedMutation.isPending,

    allWatched,
    isEpisodeWatched,
  };
}
