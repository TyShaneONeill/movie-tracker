import { supabase } from '@/lib/supabase';
import type {
  UserList,
  UserListInsert,
  UserListUpdate,
  ListMovie,
  ListMovieInsert,
  UserListWithMovies,
} from '@/lib/database.types';

/** Supabase join response shape — `list_movies` is the FK join key */
interface ListWithJoinedMovies extends UserList {
  list_movies: ListMovie[] | null;
}

// ============================================================================
// Helpers
// ============================================================================

async function touchListUpdatedAt(listId: string): Promise<void> {
  await supabase
    .from('user_lists')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', listId);
}

// ============================================================================
// List CRUD
// ============================================================================

/** Create a new list. Returns the created list. */
export async function createList(
  userId: string,
  name: string,
  description?: string,
  isPublic?: boolean
): Promise<UserList> {
  const insert: UserListInsert = {
    user_id: userId,
    name,
    description: description ?? null,
    is_public: isPublic ?? false,
  };

  const { data, error } = await supabase
    .from('user_lists')
    .insert(insert)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update a list's metadata (name, description, is_public, cover_image_url). */
export async function updateList(
  listId: string,
  updates: UserListUpdate
): Promise<UserList> {
  const { data, error } = await supabase
    .from('user_lists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', listId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Delete a list (cascading deletes list_movies via FK). */
export async function deleteList(listId: string): Promise<void> {
  const { error } = await supabase
    .from('user_lists')
    .delete()
    .eq('id', listId);

  if (error) throw error;
}

/** Get a single list by ID (works for own + public lists via RLS). */
export async function getList(listId: string): Promise<UserList> {
  const { data, error } = await supabase
    .from('user_lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (error) throw error;
  return data;
}

/** Get a list with all its movies, sorted by position. */
export async function getListWithMovies(
  listId: string
): Promise<UserListWithMovies> {
  const { data, error } = await supabase
    .from('user_lists')
    .select('*, list_movies(*)')
    .eq('id', listId)
    .single();

  if (error) throw error;

  const joined = data as unknown as ListWithJoinedMovies;
  const movies = [...(joined.list_movies ?? [])].sort(
    (a, b) => a.position - b.position
  );

  return {
    id: joined.id,
    user_id: joined.user_id,
    name: joined.name,
    description: joined.description,
    is_public: joined.is_public,
    cover_image_url: joined.cover_image_url,
    created_at: joined.created_at,
    updated_at: joined.updated_at,
    movies,
    movie_count: movies.length,
  };
}

/** Get all lists for a user (own lists or another user's public lists). */
export async function getUserLists(
  userId: string
): Promise<UserListWithMovies[]> {
  const { data, error } = await supabase
    .from('user_lists')
    .select(
      '*, list_movies(id, list_id, tmdb_id, title, poster_path, position, added_at)'
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((list) => {
    const joined = list as unknown as ListWithJoinedMovies;
    const allMovies = [...(joined.list_movies ?? [])].sort(
      (a, b) => a.position - b.position
    );

    return {
      id: joined.id,
      user_id: joined.user_id,
      name: joined.name,
      description: joined.description,
      is_public: joined.is_public,
      cover_image_url: joined.cover_image_url,
      created_at: joined.created_at,
      updated_at: joined.updated_at,
      movies: allMovies.slice(0, 4),
      movie_count: allMovies.length,
    };
  });
}

// ============================================================================
// List Items (Movies)
// ============================================================================

/** Add a movie to a list. Auto-computes position as max+1. */
export async function addMovieToList(
  listId: string,
  tmdbId: number,
  title: string,
  posterPath: string | null,
  notes?: string
): Promise<ListMovie> {
  // Get the current max position
  const { data: existing } = await supabase
    .from('list_movies')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1);

  const maxPosition = existing?.[0]?.position ?? -1;

  const insert: ListMovieInsert = {
    list_id: listId,
    tmdb_id: tmdbId,
    title,
    poster_path: posterPath,
    position: maxPosition + 1,
    notes: notes ?? null,
  };

  const { data, error } = await supabase
    .from('list_movies')
    .insert(insert)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('ALREADY_IN_LIST');
    }
    throw error;
  }

  await touchListUpdatedAt(listId);
  return data;
}

/** Remove a movie from a list. */
export async function removeMovieFromList(
  listId: string,
  tmdbId: number
): Promise<void> {
  const { error } = await supabase
    .from('list_movies')
    .delete()
    .eq('list_id', listId)
    .eq('tmdb_id', tmdbId);

  if (error) throw error;

  await touchListUpdatedAt(listId);
}

/** Update a list item's notes. */
export async function updateListItemNotes(
  itemId: string,
  notes: string | null
): Promise<void> {
  const { error } = await supabase
    .from('list_movies')
    .update({ notes })
    .eq('id', itemId);

  if (error) throw error;
}

/** Reorder movies in a list (batch update positions). */
export async function reorderListMovies(
  listId: string,
  orderedTmdbIds: number[]
): Promise<void> {
  await Promise.all(
    orderedTmdbIds.map((tmdbId, index) =>
      supabase
        .from('list_movies')
        .update({ position: index })
        .eq('list_id', listId)
        .eq('tmdb_id', tmdbId)
    )
  );

  await touchListUpdatedAt(listId);
}
