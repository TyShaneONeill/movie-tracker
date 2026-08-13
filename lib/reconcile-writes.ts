/**
 * Post-write verification read for bulk `user_movies` writes (#812 / #813).
 *
 * `addMovieToLibrary`'s upsert can resolve successfully in the JS layer without
 * the corresponding Postgres write ever landing — a client/session-level failure
 * mode confirmed NOT reproducible at the prod API/schema/RLS layer, so the bulk
 * flows verify rather than trust resolution. Extracted from the reconciliation
 * block added to `importMovies` in #814 because the ticket-scan bulk save
 * (`lib/scan-save.ts`) needs the identical read, and pre-import duplicate
 * detection needs the same "which of these tmdb_ids already exist" question.
 */

import { supabase } from './supabase';
import type { MovieStatus } from './database.types';

// Max tmdb_ids per .in() filter. A 1,000-id filter serializes to ~9KB and 414s
// against typical ~8KB gateway URL-length caps — that would silently disable
// verification for exactly the big-library migrations this exists for, so keep
// each request well under that.
export const RECONCILE_CHUNK_SIZE = 200;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface PersistedTmdbIds {
  /**
   * False when any chunk read failed. A partial read can't distinguish "didn't
   * persist" from "couldn't verify", so callers must not downgrade — or mark —
   * anything off an unverified result.
   */
  verified: boolean;
  persistedIds: Set<number>;
}

/**
 * Which of `tmdbIds` currently exist as `user_movies` rows for `userId` at
 * `status`.
 *
 * The status filter is deliberate: scoping to the status the caller actually
 * writes means a dropped UPDATE on a pre-existing row in some other status
 * (e.g. a watchlist row for the same movie) can't be mistaken for a successful
 * write.
 */
export async function fetchPersistedTmdbIds(
  userId: string,
  tmdbIds: number[],
  status: MovieStatus
): Promise<PersistedTmdbIds> {
  const persistedIds = new Set<number>();

  for (const idChunk of chunkArray(tmdbIds, RECONCILE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('user_movies')
      .select('tmdb_id')
      .eq('user_id', userId)
      .eq('status', status)
      .in('tmdb_id', idChunk);

    if (error || !data) {
      return { verified: false, persistedIds: new Set() };
    }
    for (const row of data as { tmdb_id: number }[]) {
      persistedIds.add(row.tmdb_id);
    }
  }

  return { verified: true, persistedIds };
}
