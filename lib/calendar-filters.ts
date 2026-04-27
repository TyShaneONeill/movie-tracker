import type { CalendarDay, CalendarRelease } from './tmdb.types';

/**
 * Returns the subset of dates that have at least one release in the
 * user's watchlist. When watchlistOnly is false, returns the provided
 * fallback (the unfiltered dates_with_releases from the API).
 *
 * Used by the calendar grid to drive the red "has releases" dot when
 * the my-releases filter is on.
 */
export function filterDatesByWatchlist(
  days: CalendarDay[],
  watchlistIds: Set<number> | undefined,
  watchlistOnly: boolean,
  fallback: string[]
): string[] {
  if (!watchlistOnly) return fallback;
  if (!watchlistIds || watchlistIds.size === 0) return [];
  return days
    .filter((d) => d.releases.some((r) => watchlistIds.has(r.tmdb_id)))
    .map((d) => d.date);
}

/**
 * Filters a single day's releases by type chip selection AND, optionally,
 * by watchlist membership. Both filters apply with AND semantics:
 * a release must match a selected type AND (if watchlistOnly is true)
 * be in the user's watchlist.
 */
export function filterDayReleases(
  releases: CalendarRelease[],
  filterTypes: Set<number>,
  watchlistIds: Set<number> | undefined,
  watchlistOnly: boolean
): CalendarRelease[] {
  return releases.filter((r) => {
    if (!filterTypes.has(r.release_type)) return false;
    if (watchlistOnly && !(watchlistIds?.has(r.tmdb_id) ?? false)) return false;
    return true;
  });
}
