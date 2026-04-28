import {
  filterDatesByWatchlist,
  filterDayReleases,
} from '@/lib/calendar-filters';
import type { CalendarDay, CalendarRelease } from '@/lib/tmdb.types';

function makeRelease(overrides: Partial<CalendarRelease> = {}): CalendarRelease {
  return {
    tmdb_id: 100,
    title: 'Test Movie',
    poster_path: '/test.jpg',
    backdrop_path: null,
    release_type: 3, // Theatrical
    release_type_label: 'Theatrical',
    genre_ids: [28],
    vote_average: 7.5,
    release_date: '2026-04-15',
    trailer_youtube_key: null,
    ...overrides,
  };
}

function makeDay(date: string, releases: CalendarRelease[]): CalendarDay {
  return { date, releases };
}

describe('filterDatesByWatchlist', () => {
  const day1 = makeDay('2026-04-10', [makeRelease({ tmdb_id: 10 })]);
  const day2 = makeDay('2026-04-15', [
    makeRelease({ tmdb_id: 20 }),
    makeRelease({ tmdb_id: 30 }),
  ]);
  const day3 = makeDay('2026-04-20', [makeRelease({ tmdb_id: 40 })]);
  const days = [day1, day2, day3];
  const fallback = ['2026-04-10', '2026-04-15', '2026-04-20'];

  it('returns fallback dates when watchlistOnly is false', () => {
    expect(
      filterDatesByWatchlist(days, new Set([10]), false, fallback)
    ).toEqual(fallback);
  });

  it('returns empty array when watchlistOnly is true and watchlistIds is undefined', () => {
    expect(filterDatesByWatchlist(days, undefined, true, fallback)).toEqual([]);
  });

  it('returns empty array when watchlistOnly is true and watchlistIds is empty', () => {
    expect(filterDatesByWatchlist(days, new Set(), true, fallback)).toEqual([]);
  });

  it('returns dates with at least one watchlist release when filter is on', () => {
    expect(
      filterDatesByWatchlist(days, new Set([10, 30]), true, fallback)
    ).toEqual(['2026-04-10', '2026-04-15']);
  });

  it('excludes dates with no watchlist releases', () => {
    expect(filterDatesByWatchlist(days, new Set([10]), true, fallback)).toEqual([
      '2026-04-10',
    ]);
  });

  it('returns empty array when no day has a watchlist release', () => {
    expect(filterDatesByWatchlist(days, new Set([999]), true, fallback)).toEqual(
      []
    );
  });
});

describe('filterDayReleases', () => {
  const releases = [
    makeRelease({ tmdb_id: 10, release_type: 3 }), // Theatrical
    makeRelease({ tmdb_id: 20, release_type: 6 }), // Streaming
    makeRelease({ tmdb_id: 30, release_type: 3 }), // Theatrical
  ];
  const allTypes = new Set([1, 2, 3, 4, 5, 6]);
  const theatricalOnly = new Set([1, 2, 3]);

  it('returns all releases when watchlistOnly is false and all types selected', () => {
    expect(filterDayReleases(releases, allTypes, undefined, false)).toEqual(
      releases
    );
  });

  it('filters by type only when watchlistOnly is false', () => {
    expect(filterDayReleases(releases, theatricalOnly, undefined, false)).toEqual(
      [releases[0], releases[2]]
    );
  });

  it('filters by watchlist when watchlistOnly is true', () => {
    expect(
      filterDayReleases(releases, allTypes, new Set([10, 30]), true)
    ).toEqual([releases[0], releases[2]]);
  });

  it('combines type and watchlist filters with AND logic', () => {
    expect(
      filterDayReleases(releases, theatricalOnly, new Set([10, 20]), true)
    ).toEqual([releases[0]]);
  });

  it('returns empty array when watchlistOnly is true but watchlistIds is undefined', () => {
    expect(filterDayReleases(releases, allTypes, undefined, true)).toEqual([]);
  });

  it('returns empty array when watchlistOnly is true and no releases match watchlist', () => {
    expect(filterDayReleases(releases, allTypes, new Set([999]), true)).toEqual(
      []
    );
  });
});
