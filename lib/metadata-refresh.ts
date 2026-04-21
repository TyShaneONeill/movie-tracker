import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react-native';

const STALE_THRESHOLD_HOURS = 24;
const MAX_CONCURRENT_FETCHES = 5;
const MAX_SHOWS_PER_BATCH = 50;

type StaleShowRow = {
  id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  metadata_refreshed_at: string | null;
  status: string;
  tmdb_status: string | null;
};

/**
 * Refresh TMDB-derived metadata for all of the user's `status='watching'` shows,
 * plus `status='watched'` shows whose `tmdb_status='Returning Series'`, whose
 * `metadata_refreshed_at` is NULL or older than STALE_THRESHOLD_HOURS.
 * Returns the number of shows for which a TMDB fetch actually fired.
 * No-op if no user is authed.
 */
export async function refreshStaleWatchingShows(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const cutoffIso = new Date(Date.now() - STALE_THRESHOLD_HOURS * 3600 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at, status, tmdb_status')
    .eq('user_id', user.id)
    .or(`status.eq.watching,and(status.eq.watched,tmdb_status.eq.Returning Series)`)
    .or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_SHOWS_PER_BATCH);

  if (error || !rows) return 0;

  let refreshedCount = 0;
  await runWithLimit(rows as StaleShowRow[], MAX_CONCURRENT_FETCHES, async (row) => {
    const fired = await refreshShowMetadata(row);
    if (fired) refreshedCount++;
  });
  return refreshedCount;
}

/**
 * Refresh a single show by user_tv_show_id. Skips if metadata is fresh.
 * Returns true if a TMDB fetch fired, false if skipped.
 */
export async function refreshSingleShow(userTvShowId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: row, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at, status, tmdb_status')
    .eq('user_id', user.id)
    .eq('id', userTvShowId)
    .maybeSingle();

  if (error || !row) return false;

  // Skip if fresh (within STALE_THRESHOLD_HOURS)
  if (row.metadata_refreshed_at) {
    const age = Date.now() - Date.parse(row.metadata_refreshed_at);
    if (age < STALE_THRESHOLD_HOURS * 3600 * 1000) return false;
  }

  return await refreshShowMetadata(row as StaleShowRow);
}

// Private: fetches TMDB, diffs against row, writes updated fields + metadata_refreshed_at.
// Returns true if TMDB fetch fired (whether or not anything changed).
async function refreshShowMetadata(row: StaleShowRow): Promise<boolean> {
  try {
    const { data: tmdbData, error: tmdbError } = await supabase.functions.invoke<{
      number_of_seasons?: number;
      number_of_episodes?: number;
      poster_path?: string | null;
      status?: string;
    }>('get-tv-show-details', { body: { showId: row.tmdb_id } });

    if (tmdbError || !tmdbData) {
      Sentry.addBreadcrumb({
        category: 'metadata-refresh',
        level: 'warning',
        message: 'TMDB fetch failed for show; retry next trigger',
        data: { user_tv_show_id: row.id, tmdb_id: row.tmdb_id, error: tmdbError?.message },
      });
      return false;
    }

    const updates: Record<string, unknown> = {
      metadata_refreshed_at: new Date().toISOString(),
    };
    if (typeof tmdbData.number_of_seasons === 'number' && tmdbData.number_of_seasons > 0 && tmdbData.number_of_seasons !== row.number_of_seasons) {
      updates.number_of_seasons = tmdbData.number_of_seasons;
    }
    if (typeof tmdbData.number_of_episodes === 'number' && tmdbData.number_of_episodes > 0 && tmdbData.number_of_episodes !== row.number_of_episodes) {
      updates.number_of_episodes = tmdbData.number_of_episodes;
    }
    if (tmdbData.poster_path !== undefined && tmdbData.poster_path !== row.poster_path) {
      updates.poster_path = tmdbData.poster_path;
    }
    if (typeof tmdbData.status === 'string' && tmdbData.status !== row.tmdb_status) {
      updates.tmdb_status = tmdbData.status;
    }
    if (
      row.status === 'watched'
      && row.tmdb_status === 'Returning Series'
      && typeof tmdbData.number_of_episodes === 'number'
      && tmdbData.number_of_episodes > 0
      && row.number_of_episodes !== null
      && tmdbData.number_of_episodes > row.number_of_episodes
    ) {
      updates.status = 'watching';
      // finished_at intentionally preserved for analytics
    }

    await supabase
      .from('user_tv_shows')
      .update(updates)
      .eq('id', row.id);

    return true;
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'metadata-refresh',
      level: 'warning',
      message: 'refreshShowMetadata unexpected error',
      data: { user_tv_show_id: row.id, error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
}

// Private: runs async operations with a concurrency cap. No library dep.
async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}
