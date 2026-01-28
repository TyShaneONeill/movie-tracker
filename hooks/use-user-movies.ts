import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchUserMovies,
  addMovieToLibrary,
  updateMovieStatus,
  removeMovieFromLibrary,
  getMovieByTmdbId,
} from '@/lib/movie-service';
import type { UserMovie, MovieStatus } from '@/lib/database.types';
import type { TMDBMovie } from '@/lib/tmdb.types';

export function useUserMovies(status?: MovieStatus) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['userMovies', user?.id, status],
    queryFn: async () => {
      const result = await fetchUserMovies(user!.id, status);
      return result;
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: ({
      movie,
      status,
    }: {
      movie: TMDBMovie;
      status?: MovieStatus;
    }) => addMovieToLibrary(user!.id, movie, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      movieId,
      status,
    }: {
      movieId: string;
      status: MovieStatus;
    }) => updateMovieStatus(movieId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (movieId: string) => removeMovieFromLibrary(movieId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
    },
  });

  return {
    movies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    addMovie: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    updateStatus: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    removeMovie: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

// Hook to check if a specific movie is in user's library
export function useMovieInLibrary(tmdbId: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userMovie', user?.id, tmdbId],
    queryFn: () => getMovieByTmdbId(user!.id, tmdbId),
    enabled: !!user && !!tmdbId,
  });
}
