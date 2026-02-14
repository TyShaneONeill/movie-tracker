import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  getMovieByTmdbId,
  addMovieToLibrary,
  removeMovieFromLibrary,
  updateMovieStatus,
  getMovieLike,
  likeMovie,
  unlikeMovie,
} from '@/lib/movie-service';
import type { UserMovie, UserMovieLike, MovieStatus } from '@/lib/database.types';
import type { TMDBMovie } from '@/lib/tmdb.types';

interface UseMovieActionsResult {
  // Watchlist state
  userMovie: UserMovie | null;
  isSaved: boolean;
  currentStatus: MovieStatus | null;
  isLoadingWatchlist: boolean;
  isSaving: boolean;

  // Like state (separate from watchlist)
  isLiked: boolean;
  isLoadingLike: boolean;
  isTogglingLike: boolean;

  // Watchlist actions
  addToWatchlist: (movie: TMDBMovie, status: MovieStatus) => Promise<void>;
  removeFromWatchlist: () => Promise<void>;
  changeStatus: (status: MovieStatus) => Promise<void>;

  // Like actions (independent of watchlist)
  toggleLike: (movie: TMDBMovie) => Promise<void>;
}

export function useMovieActions(tmdbId: number): UseMovieActionsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query to check if movie is in user's watchlist
  const { data: userMovie, isLoading: isLoadingWatchlist } = useQuery({
    queryKey: ['userMovie', user?.id, tmdbId],
    queryFn: () => getMovieByTmdbId(user!.id, tmdbId),
    enabled: !!user && tmdbId > 0,
  });

  // Query to check if movie is liked (separate from watchlist)
  const { data: userLike, isLoading: isLoadingLike } = useQuery({
    queryKey: ['userMovieLike', user?.id, tmdbId],
    queryFn: () => getMovieLike(user!.id, tmdbId),
    enabled: !!user && tmdbId > 0,
  });

  // Mutation to add movie to watchlist
  const addMutation = useMutation({
    mutationFn: async ({ movie, status }: { movie: TMDBMovie; status: MovieStatus }) => {
      if (!user) throw new Error('Not authenticated');
      return addMovieToLibrary(user.id, movie, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  // Mutation to remove movie from watchlist
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!userMovie) throw new Error('Movie not in watchlist');
      return removeMovieFromLibrary(userMovie.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  // Mutation to change watchlist status (optimistic)
  const changeStatusMutation = useMutation({
    mutationFn: async (status: MovieStatus) => {
      if (!userMovie) throw new Error('Movie not in watchlist');
      return updateMovieStatus(userMovie.id, status);
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['userMovie', user?.id, tmdbId] });

      const previousMovie = queryClient.getQueryData<UserMovie | null>(
        ['userMovie', user?.id, tmdbId]
      );

      if (previousMovie) {
        queryClient.setQueryData<UserMovie>(
          ['userMovie', user?.id, tmdbId],
          { ...previousMovie, status: newStatus }
        );
      }

      return { previousMovie };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousMovie !== undefined) {
        queryClient.setQueryData(
          ['userMovie', user?.id, tmdbId],
          context.previousMovie
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  // Mutation to toggle like (optimistic, independent of watchlist)
  const toggleLikeMutation = useMutation({
    mutationFn: async (movie: TMDBMovie) => {
      if (!user) throw new Error('Not authenticated');

      if (userLike) {
        await unlikeMovie(user.id, tmdbId);
        return null;
      } else {
        return likeMovie(user.id, movie);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['userMovieLike', user?.id, tmdbId] });

      const previousLike = queryClient.getQueryData<UserMovieLike | null>(
        ['userMovieLike', user?.id, tmdbId]
      );

      // Toggle: if liked → null, if null → placeholder object
      queryClient.setQueryData<UserMovieLike | null>(
        ['userMovieLike', user?.id, tmdbId],
        previousLike ? null : { id: 'optimistic', user_id: user!.id, tmdb_id: tmdbId, title: '', poster_path: null, created_at: new Date().toISOString() } as UserMovieLike
      );

      return { previousLike };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousLike !== undefined) {
        queryClient.setQueryData(
          ['userMovieLike', user?.id, tmdbId],
          context.previousLike
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovieLike', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userMovieLikes'] });
    },
  });

  const addToWatchlist = async (movie: TMDBMovie, status: MovieStatus): Promise<void> => {
    await addMutation.mutateAsync({ movie, status });
  };

  const removeFromWatchlist = async (): Promise<void> => {
    await removeMutation.mutateAsync();
  };

  const changeStatus = async (status: MovieStatus): Promise<void> => {
    await changeStatusMutation.mutateAsync(status);
  };

  const toggleLike = async (movie: TMDBMovie): Promise<void> => {
    await toggleLikeMutation.mutateAsync(movie);
  };

  return {
    // Watchlist state
    userMovie: userMovie ?? null,
    isSaved: !!userMovie,
    currentStatus: (userMovie?.status as MovieStatus) ?? null,
    isLoadingWatchlist,
    isSaving: addMutation.isPending || removeMutation.isPending || changeStatusMutation.isPending,

    // Like state
    isLiked: !!userLike,
    isLoadingLike,
    isTogglingLike: toggleLikeMutation.isPending,

    // Actions
    addToWatchlist,
    removeFromWatchlist,
    changeStatus,
    toggleLike,
  };
}
