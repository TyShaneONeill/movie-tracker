import { ReleaseCalendarV2Screen } from '@/components/release-calendar-v2/release-calendar-v2-screen';

/**
 * Release Calendar Screen — renders the v2 results-first layout
 * (docked week-strip calendar + chip row) unconditionally.
 *
 * Formerly gated behind the `release_calendar_v2` PostHog flag; stripped
 * 2026-07-18 after 100% rollout since 2026-07-11 (issue #660). The legacy v1
 * screen (full month grid, gear-button filter sheet) has been removed —
 * `CalendarGrid`, `ReleaseDayList`, and the calendar/filter/taste-profile
 * hooks it used are still imported by `ReleaseCalendarV2Screen`, so none of
 * that shared code was dead.
 */
export default function ReleaseCalendarScreen() {
  return <ReleaseCalendarV2Screen />;
}
