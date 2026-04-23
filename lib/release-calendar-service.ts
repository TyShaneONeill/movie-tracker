import { supabase } from './supabase';
import type { ReleaseCalendarResponse, CalendarDay, CalendarRelease } from './tmdb.types';

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: 'Premiere',
  2: 'Limited Theatrical',
  3: 'Theatrical',
  4: 'Digital',
  5: 'Physical',
  6: 'TV',
};

/**
 * Reads the denormalized release_calendar table via PostgREST directly.
 * Day-grouping happens client-side (previously did in the edge function).
 * Rows with NULL title are filtered out — those are placeholders awaiting
 * their next warming run.
 *
 * Replaces the previous supabase.functions.invoke('get-release-calendar')
 * flow as of Phase SP1. The edge function is now background-only (daily
 * pg_cron at 04:00 UTC via warm-release-calendar).
 */
export async function getReleaseCalendar(
  month: number,
  year: number,
  region: string = 'US'
): Promise<ReleaseCalendarResponse> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('release_calendar')
    .select('tmdb_id, title, poster_path, backdrop_path, genre_ids, vote_average, release_type, release_date, certification')
    .eq('region', region)
    .gte('release_date', startDate)
    .lte('release_date', endDate)
    .not('title', 'is', null)
    .order('release_date', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch release calendar');

  const rows = data ?? [];

  const dayMap = new Map<string, CalendarRelease[]>();
  for (const r of rows) {
    const release: CalendarRelease = {
      tmdb_id: r.tmdb_id,
      title: r.title!,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      release_type: r.release_type,
      release_type_label: RELEASE_TYPE_LABELS[r.release_type] || 'Unknown',
      genre_ids: r.genre_ids ?? [],
      vote_average: r.vote_average ?? 0,
      release_date: r.release_date,
    };
    const existing = dayMap.get(r.release_date) || [];
    existing.push(release);
    dayMap.set(r.release_date, existing);
  }

  const sortedDates = [...dayMap.keys()].sort();
  const days: CalendarDay[] = sortedDates.map((date) => ({
    date,
    releases: dayMap.get(date)!,
  }));

  return {
    days,
    dates_with_releases: sortedDates,
    total_results: rows.length,
  };
}

export async function getWatchlistTmdbIds(): Promise<Set<number>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('user_movies')
    .select('tmdb_id')
    .eq('user_id', user.id)
    .eq('status', 'watchlist');

  return new Set((data ?? []).map((row) => row.tmdb_id));
}
