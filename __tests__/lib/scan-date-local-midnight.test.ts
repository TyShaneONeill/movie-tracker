/**
 * #794 regression — scanned tickets must display their watched date on the
 * SAME calendar day the ticket says.
 *
 * The scan paths used to write `${ticket.date}T00:00:00Z` (UTC midnight);
 * any display that localizes that instant shows the previous day for users
 * west of Greenwich. The fix writes LOCAL midnight via the shared
 * `localMidnightISO` helper, matching the edit-journey sheet. The core
 * property pinned here: round-tripping the stored instant through local
 * calendar-day accessors recovers the ticket's date — in EVERY timezone the
 * test runs in (in a negative-UTC zone the old code fails these).
 */

// scan-save's photo-upload path imports expo-file-system/legacy, which isn't in
// jest's transform allowlist — stub it; these tests only exercise pure mapping.
jest.mock('expo-file-system/legacy', () => ({}));
// Importing the real client starts an auth-refresh timer that outlives the run.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { localMidnightISO } from '@/lib/date-conventions';
import { mapTicketToJourneyData } from '@/lib/scan-save';
import { makeProcessedTicket } from '../fixtures';

/** Localize an ISO instant back to the calendar day of the machine's TZ. */
function toLocalCalendarDay(iso: string): string {
  const d = new Date(iso);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

describe('localMidnightISO', () => {
  it.each(['2022-07-17', '2026-01-01', '2024-02-29', '1999-12-31'])(
    'round-trips %s back to the same local calendar day',
    (date) => {
      expect(toLocalCalendarDay(localMidnightISO(date))).toBe(date);
    }
  );

  it('produces local midnight, not UTC midnight', () => {
    const d = new Date(localMidnightISO('2022-07-17'));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('falls back to now for malformed input', () => {
    const before = Date.now();
    const parsed = new Date(localMidnightISO('not-a-date')).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('mapTicketToJourneyData — watched_at (#794)', () => {
  it('writes a watched_at that localizes to the SAME day the ticket says', () => {
    const journey = mapTicketToJourneyData(makeProcessedTicket({ date: '2022-07-17' }));
    expect(journey.watched_at).not.toBeNull();
    expect(toLocalCalendarDay(journey.watched_at!)).toBe('2022-07-17');
  });

  it('matches the edit-journey sheet convention for the same calendar day', () => {
    const journey = mapTicketToJourneyData(makeProcessedTicket({ date: '2022-07-17' }));
    expect(journey.watched_at).toBe(localMidnightISO('2022-07-17'));
  });

  it('keeps watched_at null when the ticket has no date', () => {
    expect(mapTicketToJourneyData(makeProcessedTicket({ date: null })).watched_at).toBeNull();
  });
});
