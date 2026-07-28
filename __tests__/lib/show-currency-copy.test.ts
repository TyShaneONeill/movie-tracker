/**
 * Copy for the Caught Up state.
 *
 * The date-formatting tests matter more than they look: this line sits directly
 * above the episode list on the same screen, so an off-by-one date turns the
 * feature's own audit trail into a contradiction the user can see.
 */
import {
  formatAirDate,
  caughtUpSubline,
  caughtUpCardLine,
} from '@/lib/show-currency-copy';

describe('formatAirDate', () => {
  it('formats as month + day', () => {
    expect(formatAirDate('2026-07-30')).toBe('Jul 30');
    expect(formatAirDate('2026-01-01')).toBe('Jan 1');
    expect(formatAirDate('2026-12-25')).toBe('Dec 25');
  });

  it('does NOT shift the date in a west-of-UTC timezone', () => {
    // `new Date('2026-07-30')` parses as UTC midnight, which renders as Jul 29
    // for every US user. Parsing the parts by hand avoids that, and this test is
    // the reason the implementation does not use the Date constructor.
    process.env.TZ = 'America/Los_Angeles';
    expect(formatAirDate('2026-07-30')).toBe('Jul 30');
    expect(formatAirDate('2026-01-01')).toBe('Jan 1');
  });

  it('returns empty string for malformed input rather than "NaN"', () => {
    expect(formatAirDate('')).toBe('');
    expect(formatAirDate('not-a-date')).toBe('');
  });
});

describe('caughtUpSubline', () => {
  it('names the next episode when it continues the season being watched', () => {
    expect(
      caughtUpSubline({ next_air_date: '2026-07-30', next_season: 3 }, 3),
    ).toBe("You're up to date · next episode Jul 30");
  });

  it('names the SEASON when the next episode starts a later one', () => {
    // Finishing a season and waiting for the next is a different feeling from
    // waiting a week mid-season, so it gets different words.
    expect(
      caughtUpSubline({ next_air_date: '2026-10-12', next_season: 4 }, 3),
    ).toBe("You're up to date · Season 4 returns Oct 12");
  });

  it('says TBA when nothing is scheduled, without implying a date', () => {
    expect(caughtUpSubline({ next_air_date: null, next_season: null }, 3)).toBe(
      "You're up to date · next season TBA",
    );
  });

  it('falls back to the episode phrasing when the current season is unknown', () => {
    // Unknown current season must not be read as "a new season" — that would
    // assert something we cannot support.
    expect(
      caughtUpSubline({ next_air_date: '2026-07-30', next_season: 3 }, null),
    ).toBe("You're up to date · next episode Jul 30");
  });
});

describe('caughtUpCardLine', () => {
  it('is short enough for the 130pt Home card', () => {
    const line = caughtUpCardLine({ next_air_date: '2026-07-30' });
    expect(line).toBe('Caught up · Jul 30');
    expect(line.length).toBeLessThanOrEqual(20);
  });

  it('degrades to TBA without inventing a date', () => {
    expect(caughtUpCardLine({ next_air_date: null })).toBe('Caught up · TBA');
  });
});
