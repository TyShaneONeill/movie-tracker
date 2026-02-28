import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  createList,
  updateList,
  deleteList,
  addMovieToList,
  removeMovieFromList,
  updateListItemNotes,
  reorderListMovies,
  getListWithMovies,
} from '@/lib/list-service';
import type { UserListUpdate } from '@/lib/database.types';

export function useListMutations(listId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Helper to invalidate list-related queries
  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: ['user-lists', user?.id] });
    if (listId) {
      queryClient.invalidateQueries({ queryKey: ['list-detail', listId] });
    }
  };

  // Mutation: create list
  const createListMutation = useMutation({
    mutationFn: async (params: { name: string; description?: string; isPublic?: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      return createList(user.id, params.name, params.description, params.isPublic);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: update list
  const updateListMutation = useMutation({
    mutationFn: async (updates: UserListUpdate) => {
      if (!listId) throw new Error('No list ID');
      return updateList(listId, updates);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: delete list
  const deleteListMutation = useMutation({
    mutationFn: async () => {
      if (!listId) throw new Error('No list ID');
      return deleteList(listId);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: add movie to list
  const addMovieMutation = useMutation({
    mutationFn: async (params: { tmdbId: number; title: string; posterPath: string | null; notes?: string; mediaType?: 'movie' | 'tv_show' }) => {
      if (!listId) throw new Error('No list ID');
      return addMovieToList(listId, params.tmdbId, params.title, params.posterPath, params.notes, params.mediaType);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: remove movie from list
  const removeMovieMutation = useMutation({
    mutationFn: async (tmdbId: number) => {
      if (!listId) throw new Error('No list ID');
      return removeMovieFromList(listId, tmdbId);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: update item notes
  const updateNotesMutation = useMutation({
    mutationFn: async (params: { itemId: string; notes: string | null }) => {
      return updateListItemNotes(params.itemId, params.notes);
    },
    onSuccess: () => invalidateLists(),
  });

  // Mutation: reorder movies
  const reorderMutation = useMutation({
    mutationFn: async (orderedTmdbIds: number[]) => {
      if (!listId) throw new Error('No list ID');
      return reorderListMovies(listId, orderedTmdbIds);
    },
    onSuccess: () => invalidateLists(),
  });

  return {
    createList: createListMutation.mutateAsync,
    isCreating: createListMutation.isPending,

    updateList: updateListMutation.mutateAsync,
    isUpdating: updateListMutation.isPending,

    deleteList: deleteListMutation.mutateAsync,
    isDeleting: deleteListMutation.isPending,

    addMovie: addMovieMutation.mutateAsync,
    isAddingMovie: addMovieMutation.isPending,

    removeMovie: removeMovieMutation.mutateAsync,
    isRemovingMovie: removeMovieMutation.isPending,

    updateNotes: updateNotesMutation.mutateAsync,
    isUpdatingNotes: updateNotesMutation.isPending,

    reorderMovies: reorderMutation.mutateAsync,
    isReordering: reorderMutation.isPending,
  };
}

export function useListDetail(listId: string | undefined) {
  return useQuery({
    queryKey: ['list-detail', listId],
    queryFn: () => getListWithMovies(listId!),
    enabled: !!listId,
    staleTime: 5 * 60 * 1000,
  });
}
