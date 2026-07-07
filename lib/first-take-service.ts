import { supabase } from './supabase';
import type { FirstTake, FirstTakeInsert, FirstTakeUpdate, FirstTakeMediaType, ReviewVisibility } from './database.types';

export interface CreateFirstTakeData {
  tmdbId: number;
  movieTitle: string;
  posterPath: string | null;
  reactionEmoji: string;
  quoteText: string;
  isSpoiler?: boolean;
  rating?: number | null;
  visibility?: ReviewVisibility;
  mediaType?: FirstTakeMediaType;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  showName?: string | null;
}

/**
 * Create a new First Take for a movie
 */
export async function createFirstTake(
  userId: string,
  data: CreateFirstTakeData
): Promise<FirstTake> {
  const trimmedQuote = data.quoteText.trim();

  const insertData: FirstTakeInsert = {
    user_id: userId,
    tmdb_id: data.tmdbId,
    movie_title: data.movieTitle,
    poster_path: data.posterPath,
    reaction_emoji: data.reactionEmoji,
    quote_text: trimmedQuote,
    is_spoiler: data.isSpoiler ?? false,
    rating: data.rating ?? null,
    media_type: data.mediaType ?? 'movie',
    season_number: data.seasonNumber ?? null,
    episode_number: data.episodeNumber ?? null,
    show_name: data.showName ?? null,
    ...(data.visibility !== undefined && { visibility: data.visibility }),
  };

  const { data: result, error } = (await (supabase
    .from('first_takes') as any)
    .insert(insertData)
    .select()
    .single()) as { data: FirstTake; error: any };

  if (error) {
    // Check for unique constraint violation (user already has a take for this movie)
    if (error.code === '23505') {
      throw new Error('DUPLICATE_FIRST_TAKE');
    }
    throw new Error(error.message || 'Failed to create first take');
  }

  return result;
}

/**
 * Get a user's First Take for a specific movie
 */
export async function getFirstTakeByTmdbId(
  userId: string,
  tmdbId: number,
  mediaType: FirstTakeMediaType = 'movie'
): Promise<FirstTake | null> {
  const { data, error } = await supabase
    .from('first_takes')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch first take');
  }

  return data;
}

/**
 * Update an existing First Take
 */
export async function updateFirstTake(
  firstTakeId: string,
  updates: Partial<Pick<CreateFirstTakeData, 'reactionEmoji' | 'quoteText' | 'isSpoiler' | 'rating' | 'visibility'>>
): Promise<FirstTake> {
  const updateData: FirstTakeUpdate = {
    ...(updates.reactionEmoji !== undefined && { reaction_emoji: updates.reactionEmoji }),
    ...(updates.quoteText !== undefined && { quote_text: updates.quoteText.trim() }),
    ...(updates.isSpoiler !== undefined && { is_spoiler: updates.isSpoiler }),
    ...(updates.rating !== undefined && { rating: updates.rating }),
    ...(updates.visibility !== undefined && { visibility: updates.visibility }),
    updated_at: new Date().toISOString(),
  };

  // `edited_at` is stamped SERVER-SIDE by the DB trigger on genuine content
  // change (quote/rating/emoji/spoiler); a visibility-only edit leaves it
  // untouched. The client no longer fetches-and-compares — it just sends the
  // update.
  const { data, error } = (await (supabase
    .from('first_takes') as any)
    .update(updateData)
    .eq('id', firstTakeId)
    .select()
    .single()) as { data: FirstTake; error: any };

  if (error) {
    // The edit-grace-window trigger (PS-12) rejects locked content edits with
    // HINT='edit_window_closed' and a friendly MESSAGE. Re-throw with the marker
    // in the message so `isEditWindowClosedError` can detect it upstream.
    if (
      error?.hint === 'edit_window_closed' ||
      String(error?.message ?? '').includes('edit_window_closed')
    ) {
      throw new Error('edit_window_closed');
    }
    throw new Error(error.message || 'Failed to update first take');
  }

  return data;
}

/**
 * Delete a First Take
 */
export async function deleteFirstTake(firstTakeId: string): Promise<void> {
  const { error } = await supabase
    .from('first_takes')
    .delete()
    .eq('id', firstTakeId);

  if (error) {
    throw new Error(error.message || 'Failed to delete first take');
  }
}
