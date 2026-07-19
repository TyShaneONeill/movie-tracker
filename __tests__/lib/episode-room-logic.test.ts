import {
  parseEpisodeRoomParam,
  episodeRoomSlug,
  formatEpisodeLabel,
  formatEpisodeShort,
  selectHeroTake,
  sortTakesByEngagement,
  ROOM_LEDGER_CAP,
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
