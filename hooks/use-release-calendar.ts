import { useQuery } from '@tanstack/react-query';
import { getReleaseCalendar, getWatchlistTmdbIds } from '@/lib/release-calendar-service';
import type { ReleaseCalendarResponse } from '@/lib/tmdb.types';

interface UseReleaseCalendarOptions {
  month: number;
  year: number;
  region?: string;
  enabled?: boolean;
}

export function useReleaseCalendar({
  month,
  year,
  region = 'US',
  enabled = true,
}: UseReleaseCalendarOptions) {
  return useQuery<ReleaseCalendarResponse, Error>({
    queryKey: ['release-calendar', year, month, region],
    queryFn: () => getReleaseCalendar(month, year, region),
    enabled,
    staleTime: 1000 * 60 * 30, // 30 min — data changes slowly
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useWatchlistIds(enabled = true) {
  return useQuery<Set<number>, Error>({
    queryKey: ['watchlist-tmdb-ids'],
    queryFn: getWatchlistTmdbIds,
    enabled,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}
