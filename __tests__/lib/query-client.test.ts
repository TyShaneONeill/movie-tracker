import type { Query } from '@tanstack/react-query';
import {
  shouldDehydrateReleaseCalendar,
  RQ_PERSIST_BUSTER,
  RQ_PERSIST_MAX_AGE,
  RQ_PERSIST_KEY,
} from '@/lib/query-client';

function makeQuery(queryKey: readonly unknown[]): Query {
  return { queryKey } as unknown as Query;
}

describe('query-client persistence config', () => {
  describe('shouldDehydrateReleaseCalendar', () => {
    it('returns true for release-calendar queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar', 2026, 4, 'US']))
      ).toBe(true);
    });

    it('returns true for release-calendar with any args length', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar']))
      ).toBe(true);
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar', 2026, 12, 'US', 'extra']))
      ).toBe(true);
    });

    it('returns false for watchlist-tmdb-ids queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['watchlist-tmdb-ids']))
      ).toBe(false);
    });

    it('returns false for userMovies queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['userMovies', 'user-id']))
      ).toBe(false);
    });

    it('returns false for empty queryKey', () => {
      expect(shouldDehydrateReleaseCalendar(makeQuery([]))).toBe(false);
    });

    it('returns false for non-string first segment', () => {
      expect(shouldDehydrateReleaseCalendar(makeQuery([42, 'x']))).toBe(false);
    });
  });

  describe('persistence constants', () => {
    it('buster is set (bump on ReleaseCalendarResponse shape change)', () => {
      expect(RQ_PERSIST_BUSTER).toBe('1');
    });

    it('maxAge is 7 days in milliseconds', () => {
      expect(RQ_PERSIST_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('persist key is namespaced for cinetrak with version suffix', () => {
      expect(RQ_PERSIST_KEY).toBe('cinetrak-rq-cache-v1');
    });
  });
});
