// Shared window envelope for the release_calendar writers. warm-release-calendar
// (daily cron) and enrich-release-calendar (per-addMovie) must agree on the
// horizon or they drift — one inserts rows the other's reconciliation pass can
// never reach. Both derive their window from DEFAULT_MONTHS_AHEAD so the horizon
// lives in exactly one place.
export const DEFAULT_MONTHS_AHEAD = 3;

/**
 * Pure: the forward window both writers populate — first day of `now`'s month
 * through the last day of (now's month + monthsAhead), inclusive. Matches
 * warm-release-calendar's month-by-month envelope (monthsWarmed[0]-01 ..
 * last day of monthsWarmed[last]).
 */
export function getReleaseCalendarWindow(
  now: Date,
  monthsAhead: number,
): { startDate: string; endDate: string } {
  const startYear = now.getFullYear();
  const startMonth = now.getMonth();
  const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-01`;

  const endTarget = new Date(startYear, startMonth + monthsAhead, 1);
  const endYear = endTarget.getFullYear();
  const endMonth = endTarget.getMonth() + 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}
