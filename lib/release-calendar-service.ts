import { supabase } from './supabase';
import type { ReleaseCalendarResponse } from './tmdb.types';

export async function getReleaseCalendar(
  month: number,
  year: number,
  region: string = 'US'
): Promise<ReleaseCalendarResponse> {
  const { data, error } = await supabase.functions.invoke<ReleaseCalendarResponse>(
    'get-release-calendar',
    { body: { month, year, region } }
  );

  if (error) throw new Error(error.message || 'Failed to fetch release calendar');
  if (!data) throw new Error('No data returned from release calendar');

  return data;
}

export async function getWatchlistTmdbIds(): Promise<Set<number>> {
  const { data } = await supabase
    .from('user_movies')
    .select('tmdb_id')
    .eq('status', 'watchlist');

  return new Set((data ?? []).map(row => row.tmdb_id));
}
