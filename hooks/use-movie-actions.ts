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
import type { UserMovie, MovieStatus } from '@/lib/database.types';
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

  // Mutation to change watchlist status
  const changeStatusMutation = useMutation({
    mutationFn: async (status: MovieStatus) => {
      if (!userMovie) throw new Error('Movie not in watchlist');
      return updateMovieStatus(userMovie.id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  // Mutation to toggle like (independent of watchlist)
  const toggleLikeMutation = useMutation({
    mutationFn: async (movie: TMDBMovie) => {
      if (!user) throw new Error('Not authenticated');

      if (userLike) {
        // Unlike
        await unlikeMovie(user.id, tmdbId);
        return null;
      } else {
        // Like
        return likeMovie(user.id, movie);
      }
    },
    onSuccess: () => {
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
    currentStatus: userMovie?.status ?? null,
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
