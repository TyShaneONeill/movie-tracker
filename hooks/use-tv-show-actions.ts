import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useAchievementCheck } from '@/lib/achievement-context';
import { usePopcornEarn } from '@/hooks/use-popcorn-earn';
import { analytics } from '@/lib/analytics';
import {
  getTvShowByTmdbId,
  addTvShowToLibrary,
  removeTvShowFromLibrary,
  updateTvShowStatus,
  getTvShowLike,
  likeTvShow,
  unlikeTvShow,
} from '@/lib/tv-show-service';
import type { UserTvShow, UserTvShowLike, TvShowStatus } from '@/lib/database.types';
import type { TMDBTvShow } from '@/lib/tmdb.types';

interface UseTvShowActionsResult {
  // Library state
  userTvShow: UserTvShow | null;
  isSaved: boolean;
  currentStatus: TvShowStatus | null;
  isLoadingLibrary: boolean;
  isSaving: boolean;

  // Like state (separate from library)
  isLiked: boolean;
  isLoadingLike: boolean;
  isTogglingLike: boolean;

  // Library actions
  addToLibrary: (show: TMDBTvShow, status: TvShowStatus) => Promise<void>;
  removeFromLibrary: () => Promise<void>;
  changeStatus: (status: TvShowStatus) => Promise<void>;

  // Like actions (independent of library)
  toggleLike: (show: TMDBTvShow) => Promise<void>;
}

export function useTvShowActions(tmdbId: number): UseTvShowActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { triggerAchievementCheck } = useAchievementCheck();
  const { earn } = usePopcornEarn();

  // Query to check if show is in user's library
  const { data: userTvShow, isLoading: isLoadingLibrary } = useQuery({
    queryKey: ['userTvShow', user?.id, tmdbId],
    queryFn: () => getTvShowByTmdbId(user!.id, tmdbId),
    enabled: !!user && tmdbId > 0,
  });

  // Query to check if show is liked (separate from library)
  const { data: userLike, isLoading: isLoadingLike } = useQuery({
    queryKey: ['userTvShowLike', user?.id, tmdbId],
    queryFn: () => getTvShowLike(user!.id, tmdbId),
    enabled: !!user && tmdbId > 0,
  });

  // Mutation to add show to library (optimistic)
  const addMutation = useMutation({
    mutationFn: async ({ show, status }: { show: TMDBTvShow; status: TvShowStatus }) => {
      if (!user) throw new Error('Not authenticated');
      return addTvShowToLibrary(user.id, show, status);
    },
    onMutate: async ({ show, status }) => {
      await queryClient.cancelQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });

      const previousShow = queryClient.getQueryData<UserTvShow | null>(
        ['userTvShow', user?.id, tmdbId]
      );

      const now = new Date().toISOString();
      queryClient.setQueryData<UserTvShow>(
        ['userTvShow', user?.id, tmdbId],
        {
          id: 'optimistic',
          user_id: user!.id,
          tmdb_id: show.id,
          status,
          name: show.name,
          overview: show.overview || null,
          poster_path: show.poster_path,
          backdrop_path: show.backdrop_path,
          first_air_date: show.first_air_date || null,
          vote_average: show.vote_average || null,
          genre_ids: show.genre_ids || [],
          added_at: now,
          updated_at: now,
          current_season: null,
          current_episode: null,
          episodes_watched: null,
          number_of_seasons: null,
          number_of_episodes: null,
          started_watching_at: null,
          finished_at: null,
          is_liked: null,
          user_rating: null,
        } as UserTvShow
      );

      return { previousShow };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousShow !== undefined) {
        queryClient.setQueryData(
          ['userTvShow', user?.id, tmdbId],
          context.previousShow
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
      if (variables?.status === 'watched') {
        triggerAchievementCheck();
      }
    },
    onSuccess: (_data, variables) => {
      if (variables.status === 'watched') {
        earn('mark_watched', `tv:${variables.show.id}`);
      }
      analytics.track('tv:status_change', {
        tmdb_id: variables.show.id,
        status: variables.status,
        name: variables.show.name,
      });
    },
  });

  // Mutation to remove show from library (optimistic)
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      return removeTvShowFromLibrary(user.id, tmdbId);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });

      const previousShow = queryClient.getQueryData<UserTvShow | null>(
        ['userTvShow', user?.id, tmdbId]
      );

      queryClient.setQueryData<UserTvShow | null>(
        ['userTvShow', user?.id, tmdbId],
        null
      );

      return { previousShow };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousShow !== undefined) {
        queryClient.setQueryData(
          ['userTvShow', user?.id, tmdbId],
          context.previousShow
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
    },
  });

  // Mutation to change library status (optimistic)
  const changeStatusMutation = useMutation({
    mutationFn: async (status: TvShowStatus) => {
      if (!user) throw new Error('Not authenticated');
      return updateTvShowStatus(user.id, tmdbId, status);
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });

      const previousShow = queryClient.getQueryData<UserTvShow | null>(
        ['userTvShow', user?.id, tmdbId]
      );

      if (previousShow) {
        queryClient.setQueryData<UserTvShow>(
          ['userTvShow', user?.id, tmdbId],
          { ...previousShow, status: newStatus }
        );
      }

      return { previousShow };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousShow !== undefined) {
        queryClient.setQueryData(
          ['userTvShow', user?.id, tmdbId],
          context.previousShow
        );
      }
    },
    onSettled: (_data, _error, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['userTvShow', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
      if (newStatus === 'watched') {
        triggerAchievementCheck();
      }
    },
    onSuccess: (_data, newStatus) => {
      if (newStatus === 'watched') {
        earn('mark_watched', `tv:${tmdbId}`);
      }
      const currentShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbId]);
      analytics.track('tv:status_change', {
        tmdb_id: tmdbId,
        status: newStatus,
        name: currentShow?.name ?? undefined,
      });
    },
  });

  // Mutation to toggle like (optimistic, independent of library)
  const toggleLikeMutation = useMutation({
    mutationFn: async (show: TMDBTvShow) => {
      if (!user) throw new Error('Not authenticated');

      if (userLike) {
        await unlikeTvShow(user.id, tmdbId);
        return null;
      } else {
        return likeTvShow(user.id, show);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['userTvShowLike', user?.id, tmdbId] });

      const previousLike = queryClient.getQueryData<UserTvShowLike | null>(
        ['userTvShowLike', user?.id, tmdbId]
      );

      // Toggle: if liked -> null, if null -> placeholder object
      queryClient.setQueryData<UserTvShowLike | null>(
        ['userTvShowLike', user?.id, tmdbId],
        previousLike ? null : { id: 'optimistic', user_id: user!.id, tmdb_id: tmdbId, name: '', poster_path: null, created_at: new Date().toISOString() } as UserTvShowLike
      );

      return { previousLike };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousLike !== undefined) {
        queryClient.setQueryData(
          ['userTvShowLike', user?.id, tmdbId],
          context.previousLike
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userTvShowLike', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userTvShowLikes'] });
    },
  });

  const addToLibrary = async (show: TMDBTvShow, status: TvShowStatus): Promise<void> => {
    await addMutation.mutateAsync({ show, status });
  };

  const removeFromLibrary = async (): Promise<void> => {
    await removeMutation.mutateAsync();
  };

  const changeStatus = async (status: TvShowStatus): Promise<void> => {
    await changeStatusMutation.mutateAsync(status);
  };

  const toggleLike = async (show: TMDBTvShow): Promise<void> => {
    await toggleLikeMutation.mutateAsync(show);
  };

  return {
    // Library state
    userTvShow: userTvShow ?? null,
    isSaved: !!userTvShow,
    currentStatus: (userTvShow?.status as TvShowStatus) ?? null,
    isLoadingLibrary,
    isSaving: addMutation.isPending || removeMutation.isPending || changeStatusMutation.isPending,

    // Like state
    isLiked: !!userLike,
    isLoadingLike,
    isTogglingLike: toggleLikeMutation.isPending,

    // Actions
    addToLibrary,
    removeFromLibrary,
    changeStatus,
    toggleLike,
  };
}
