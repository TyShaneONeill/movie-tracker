import {
  parseEpisodeRoomParam,
  episodeRoomSlug,
  formatEpisodeLabel,
  formatEpisodeShort,
  selectHeroTake,
  sortTakesByEngagement,
  resolveNextUpEpisode,
  resolvePrevEpisode,
  maxAiredEpisode,
  ROOM_LEDGER_CAP,
  type EpisodeAiredInfo,
} from '../../lib/episode-room-logic';

interface TestTake {
  id: string;
  commentCount: number;
  createdAt: string;
}

const engagement = (t: TestTake) => t.commentCount;
const createdAt = (t: TestTake) => t.createdAt;
const pick = (takes: TestTake[]) => selectHeroTake(takes, engagement, createdAt);

describe('parseEpisodeRoomParam', () => {
  it('parses a well-formed slug', () => {
    expect(parseEpisodeRoomParam('1396-2-4')).toEqual({ tmdbId: 1396, season: 2, episode: 4 });
  });

  it('allows season 0 (TMDB specials)', () => {
    expect(parseEpisodeRoomParam('1396-0-3')).toEqual({ tmdbId: 1396, season: 0, episode: 3 });
  });

  it('rejects null / undefined / empty', () => {
    expect(parseEpisodeRoomParam(null)).toBeNull();
    expect(parseEpisodeRoomParam(undefined)).toBeNull();
    expect(parseEpisodeRoomParam('')).toBeNull();
  });

  it('rejects the wrong number of parts', () => {
    expect(parseEpisodeRoomParam('1396-2')).toBeNull();
    expect(parseEpisodeRoomParam('1396-2-4-5')).toBeNull();
    expect(parseEpisodeRoomParam('1396')).toBeNull();
  });

  it('rejects non-numeric parts', () => {
    expect(parseEpisodeRoomParam('abc-2-4')).toBeNull();
    expect(parseEpisodeRoomParam('1396-x-4')).toBeNull();
    expect(parseEpisodeRoomParam('1396-2-y')).toBeNull();
  });

  it('rejects non-positive tmdbId and episode < 1', () => {
    expect(parseEpisodeRoomParam('0-1-1')).toBeNull();
    expect(parseEpisodeRoomParam('1396-1-0')).toBeNull();
    expect(parseEpisodeRoomParam('-5-1-1')).toBeNull();
  });

  it('rejects fractional parts', () => {
    expect(parseEpisodeRoomParam('1396-2-4.5')).toBeNull();
  });

  it('round-trips with episodeRoomSlug', () => {
    const slug = episodeRoomSlug(1396, 2, 4);
    expect(slug).toBe('1396-2-4');
    expect(parseEpisodeRoomParam(slug)).toEqual({ tmdbId: 1396, season: 2, episode: 4 });
  });
});

describe('selectHeroTake', () => {
  it('returns nulls for an empty room', () => {
    expect(pick([])).toEqual({ hero: null, rest: [] });
  });

  it('returns the only take as the hero with an empty ledger', () => {
    const only: TestTake = { id: 'a', commentCount: 0, createdAt: '2026-07-19T10:00:00Z' };
    expect(pick([only])).toEqual({ hero: only, rest: [] });
  });

  it('at zero engagement degrades to newest-first (input is newest-first)', () => {
    // Incoming order is created_at DESC — the newest is index 0.
    const takes: TestTake[] = [
      { id: 'new', commentCount: 0, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'mid', commentCount: 0, createdAt: '2026-07-19T11:00:00Z' },
      { id: 'old', commentCount: 0, createdAt: '2026-07-19T10:00:00Z' },
    ];
    const { hero, rest } = pick(takes);
    expect(hero?.id).toBe('new');
    expect(rest.map((t) => t.id)).toEqual(['mid', 'old']);
  });

  it('picks the highest-engagement take even when it is not the newest', () => {
    const takes: TestTake[] = [
      { id: 'new', commentCount: 1, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'popular', commentCount: 9, createdAt: '2026-07-19T11:00:00Z' },
      { id: 'old', commentCount: 3, createdAt: '2026-07-19T10:00:00Z' },
    ];
    const { hero, rest } = pick(takes);
    expect(hero?.id).toBe('popular');
    // Ledger keeps the incoming (newest-first) order, hero removed.
    expect(rest.map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('breaks an engagement tie by newest-first', () => {
    const takes: TestTake[] = [
      { id: 'newer', commentCount: 5, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'older', commentCount: 5, createdAt: '2026-07-19T09:00:00Z' },
    ];
    expect(pick(takes).hero?.id).toBe('newer');
  });

  it('never duplicates the hero into the ledger', () => {
    const takes: TestTake[] = [
      { id: 'a', commentCount: 2, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'b', commentCount: 8, createdAt: '2026-07-19T11:00:00Z' },
      { id: 'c', commentCount: 8, createdAt: '2026-07-19T13:00:00Z' },
    ];
    const { hero, rest } = pick(takes);
    // 'c' and 'b' tie at 8; 'c' is newer, so it's the hero.
    expect(hero?.id).toBe('c');
    expect(rest.map((t) => t.id)).not.toContain('c');
    expect(rest.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('is order-independent — same hero regardless of input order', () => {
    const a: TestTake = { id: 'a', commentCount: 1, createdAt: '2026-07-19T10:00:00Z' };
    const b: TestTake = { id: 'b', commentCount: 7, createdAt: '2026-07-19T11:00:00Z' };
    const c: TestTake = { id: 'c', commentCount: 3, createdAt: '2026-07-19T12:00:00Z' };
    expect(pick([a, b, c]).hero?.id).toBe('b');
    expect(pick([c, b, a]).hero?.id).toBe('b');
  });
});

describe('sortTakesByEngagement', () => {
  const sort = (takes: TestTake[]) => sortTakesByEngagement(takes, engagement, createdAt);

  it('orders by engagement descending', () => {
    const takes: TestTake[] = [
      { id: 'low', commentCount: 1, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'high', commentCount: 9, createdAt: '2026-07-19T10:00:00Z' },
      { id: 'mid', commentCount: 4, createdAt: '2026-07-19T11:00:00Z' },
    ];
    expect(sort(takes).map((t) => t.id)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks ties newest-first, matching the hero comparator', () => {
    const takes: TestTake[] = [
      { id: 'older', commentCount: 3, createdAt: '2026-07-19T09:00:00Z' },
      { id: 'newer', commentCount: 3, createdAt: '2026-07-19T12:00:00Z' },
    ];
    expect(sort(takes).map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('does not mutate the input array', () => {
    const takes: TestTake[] = [
      { id: 'a', commentCount: 0, createdAt: '2026-07-19T10:00:00Z' },
      { id: 'b', commentCount: 5, createdAt: '2026-07-19T11:00:00Z' },
    ];
    sort(takes);
    expect(takes.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('agrees with selectHeroTake: sorted[0] is always the hero', () => {
    const takes: TestTake[] = [
      { id: 'a', commentCount: 2, createdAt: '2026-07-19T12:00:00Z' },
      { id: 'b', commentCount: 8, createdAt: '2026-07-19T11:00:00Z' },
      { id: 'c', commentCount: 8, createdAt: '2026-07-19T13:00:00Z' },
    ];
    expect(sort(takes)[0].id).toBe(pick(takes).hero?.id);
  });

  it('caps the room ledger via ROOM_LEDGER_CAP (hero + cap on screen)', () => {
    const takes: TestTake[] = Array.from({ length: 9 }, (_, i) => ({
      id: `t${i}`,
      commentCount: i,
      createdAt: `2026-07-19T0${i}:00:00Z`,
    }));
    const { rest } = pick(takes);
    const ledger = sortTakesByEngagement(rest, engagement, createdAt).slice(0, ROOM_LEDGER_CAP);
    expect(ledger).toHaveLength(ROOM_LEDGER_CAP);
    // Highest-engagement of the rest lead the ledger.
    expect(ledger.map((t) => t.id)).toEqual(['t7', 't6', 't5', 't4']);
  });
});

describe('formatEpisodeLabel / formatEpisodeShort', () => {
  it('formats the header label', () => {
    expect(formatEpisodeLabel(2, 4)).toBe('S2 · E4');
  });

  it('formats the compact nav label', () => {
    expect(formatEpisodeShort(2, 5)).toBe('S2E5');
  });
});

// A fixed "today" so aired/unaired is deterministic in tests.
const TODAY = '2026-07-19';
// Season of `count` episodes: 1..airedThrough aired last week, the rest next week.
const season = (count: number, airedThrough: number): EpisodeAiredInfo[] =>
  Array.from({ length: count }, (_, i) => ({
    episodeNumber: i + 1,
    airDate: i + 1 <= airedThrough ? '2026-07-12' : '2026-07-26',
  }));

describe('maxAiredEpisode', () => {
  it('returns the highest aired episode number', () => {
    expect(maxAiredEpisode(season(10, 6), TODAY)).toBe(6);
  });

  it('is 0 when nothing has aired', () => {
    expect(maxAiredEpisode(season(3, 0), TODAY)).toBe(0);
  });

  it('ignores null air dates', () => {
    expect(
      maxAiredEpisode(
        [
          { episodeNumber: 1, airDate: '2026-07-12' },
          { episodeNumber: 2, airDate: null },
        ],
        TODAY
      )
    ).toBe(1);
  });
});

describe('resolveNextUpEpisode', () => {
  it('advances within a season when the next episode has aired', () => {
    expect(
      resolveNextUpEpisode({
        season: 1,
        episode: 4,
        currentSeasonEpisodes: season(10, 8),
        nextSeasonEpisodes: null,
        today: TODAY,
      })
    ).toEqual({ season: 1, episode: 5 });
  });

  it('is caught up when the next same-season episode has not aired', () => {
    // Watched through the latest aired (E6); E7 exists but airs next week.
    expect(
      resolveNextUpEpisode({
        season: 1,
        episode: 6,
        currentSeasonEpisodes: season(10, 6),
        nextSeasonEpisodes: null,
        today: TODAY,
      })
    ).toBeNull();
  });

  it('crosses the season boundary to the next premiere (S4E14 finale → S5E1)', () => {
    expect(
      resolveNextUpEpisode({
        season: 4,
        episode: 14,
        currentSeasonEpisodes: season(14, 14),
        nextSeasonEpisodes: season(10, 3),
        today: TODAY,
      })
    ).toEqual({ season: 5, episode: 1 });
  });

  it('is caught up at a finale when the next premiere has not aired', () => {
    expect(
      resolveNextUpEpisode({
        season: 4,
        episode: 14,
        currentSeasonEpisodes: season(14, 14),
        nextSeasonEpisodes: season(10, 0),
        today: TODAY,
      })
    ).toBeNull();
  });

  it('is caught up at a finale with no next season (catalog absent)', () => {
    expect(
      resolveNextUpEpisode({
        season: 4,
        episode: 14,
        currentSeasonEpisodes: season(14, 14),
        nextSeasonEpisodes: null,
        today: TODAY,
      })
    ).toBeNull();
  });

  it('returns null (fallback) when the current-season catalog is not loaded', () => {
    expect(
      resolveNextUpEpisode({
        season: 1,
        episode: 4,
        currentSeasonEpisodes: null,
        nextSeasonEpisodes: null,
        today: TODAY,
      })
    ).toBeNull();
  });

  it('never crosses out of specials (season 0) into a real season', () => {
    expect(
      resolveNextUpEpisode({
        season: 0,
        episode: 3,
        currentSeasonEpisodes: season(3, 3),
        nextSeasonEpisodes: season(10, 5),
        today: TODAY,
      })
    ).toBeNull();
  });
});

describe('resolvePrevEpisode', () => {
  it('steps back within a season', () => {
    expect(
      resolvePrevEpisode({ season: 3, episode: 5, prevSeasonEpisodes: null, today: TODAY })
    ).toEqual({ season: 3, episode: 4 });
  });

  it('crosses back from E1 to the prior season last aired episode', () => {
    expect(
      resolvePrevEpisode({
        season: 3,
        episode: 1,
        prevSeasonEpisodes: season(12, 12),
        today: TODAY,
      })
    ).toEqual({ season: 2, episode: 12 });
  });

  it('crosses back to the prior season LAST AIRED, not last listed', () => {
    // Season 2 has 10 episodes but only 7 have aired.
    expect(
      resolvePrevEpisode({
        season: 3,
        episode: 1,
        prevSeasonEpisodes: season(10, 7),
        today: TODAY,
      })
    ).toEqual({ season: 2, episode: 7 });
  });

  it('does not cross from season 1 E1 into specials (season 0)', () => {
    expect(
      resolvePrevEpisode({
        season: 1,
        episode: 1,
        prevSeasonEpisodes: season(5, 5),
        today: TODAY,
      })
    ).toBeNull();
  });

  it('returns null at E1 when the prior-season catalog is not loaded', () => {
    expect(
      resolvePrevEpisode({ season: 3, episode: 1, prevSeasonEpisodes: null, today: TODAY })
    ).toBeNull();
  });
});
