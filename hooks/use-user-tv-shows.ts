import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchUserTvShows,
  addTvShowToLibrary,
  updateTvShowStatus,
  removeTvShowFromLibrary,
  getTvShowByTmdbId,
} from '@/lib/tv-show-service';
import type { UserTvShow, TvShowStatus } from '@/lib/database.types';
import type { TMDBTvShow } from '@/lib/tmdb.types';

export function useUserTvShows(status?: TvShowStatus) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['userTvShows', user?.id, status],
    queryFn: async () => {
      const result = await fetchUserTvShows(user!.id, status);
      return result;
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: ({
      show,
      status,
    }: {
      show: TMDBTvShow;
      status?: TvShowStatus;
    }) => addTvShowToLibrary(user!.id, show, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      tmdbId,
      status,
    }: {
      tmdbId: number;
      status: TvShowStatus;
    }) => updateTvShowStatus(user!.id, tmdbId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (tmdbId: number) => removeTvShowFromLibrary(user!.id, tmdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });
    },
  });

  return {
    shows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    addShow: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    updateStatus: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    removeShow: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

// Hook to check if a specific TV show is in user's library
export function useTvShowInLibrary(tmdbId: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userTvShow', user?.id, tmdbId],
    queryFn: () => getTvShowByTmdbId(user!.id, tmdbId),
    enabled: !!user && !!tmdbId,
  });
}
