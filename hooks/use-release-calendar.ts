import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getReleaseCalendar, getWatchlistTmdbIds } from '@/lib/release-calendar-service';
import type { ReleaseCalendarResponse } from '@/lib/tmdb.types';

interface UseReleaseCalendarOptions {
  month: number;
  year: number;
  region?: string;
  enabled?: boolean;
}

const RC_STALE_TIME = 1000 * 60 * 30; // 30 min — pg_cron warms daily, so 30 min is conservative
const RC_GC_TIME = 1000 * 60 * 60;    // 1 hr in-memory cache; persist layer handles longer-term

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/**
 * SP1 (PR #397): reads the denormalized release_calendar table via
 * direct PostgREST (no edge function on the user path).
 *
 * SP2 (this hook): adds adjacent-month prefetch so navigation feels
 * instant. On every mount and (year, month, region) change, fires
 * parallel prefetches for month-1 and month+1. Each is independent —
 * a failure on one neighbor doesn't affect the current month.
 *
 * Year-boundary handling: January (m=1) prev wraps to (m=12, year-1);
 * December (m=12) next wraps to (m=1, year+1).
 */
export function useReleaseCalendar({
  month,
  year,
  region = 'US',
  enabled = true,
}: UseReleaseCalendarOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const prev = prevMonth(year, month);
    const next = nextMonth(year, month);

    queryClient.prefetchQuery({
      queryKey: ['release-calendar', prev.year, prev.month, region],
      queryFn: () => getReleaseCalendar(prev.month, prev.year, region),
      staleTime: RC_STALE_TIME,
      gcTime: RC_GC_TIME,
    });
    queryClient.prefetchQuery({
      queryKey: ['release-calendar', next.year, next.month, region],
      queryFn: () => getReleaseCalendar(next.month, next.year, region),
      staleTime: RC_STALE_TIME,
      gcTime: RC_GC_TIME,
    });
  }, [year, month, region, enabled, queryClient]);

  return useQuery<ReleaseCalendarResponse, Error>({
    queryKey: ['release-calendar', year, month, region],
    queryFn: () => getReleaseCalendar(month, year, region),
    enabled,
    staleTime: RC_STALE_TIME,
    gcTime: RC_GC_TIME,
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
