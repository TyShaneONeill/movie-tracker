import {
  PILE,
  seededRotation,
  cyclePileOrder,
  mergeWatching,
  watchingScopeCounts,
  shouldShowWatchingScopes,
  filterWatchingByScope,
  nextEpisodeLabel,
  episodeProgress,
  pickSmartCover,
  resolveCover,
  formatDeepCount,
  formatSplitCount,
  type CoverCandidate,
} from '@/lib/lists-v2-logic';
import type { UserMovie, UserTvShow } from '@/lib/database.types';

const movie = (over: Partial<UserMovie>): UserMovie =>
  ({
    id: `m-${over.tmdb_id}`,
    tmdb_id: over.tmdb_id ?? 1,
    title: over.title ?? 'A Film',
    poster_path: over.poster_path ?? '/p.jpg',
    backdrop_path: over.backdrop_path ?? null,
    updated_at: over.updated_at ?? '2026-07-01T00:00:00Z',
    vote_average: over.vote_average ?? null,
    status: 'watching',
    ...over,
  }) as UserMovie;

const show = (over: Partial<UserTvShow>): UserTvShow =>
  ({
    id: `t-${over.tmdb_id}`,
    tmdb_id: over.tmdb_id ?? 100,
    name: over.name ?? 'A Show',
    poster_path: over.poster_path ?? '/s.jpg',
    backdrop_path: over.backdrop_path ?? null,
    updated_at: over.updated_at ?? '2026-07-01T00:00:00Z',
    vote_average: over.vote_average ?? null,
    current_season: over.current_season ?? null,
    current_episode: over.current_episode ?? null,
    episodes_watched: over.episodes_watched ?? null,
    number_of_episodes: over.number_of_episodes ?? null,
    status: 'watching',
    ...over,
  }) as UserTvShow;

describe('PILE constants (locked)', () => {
  it('matches the Ty-tuned playground values', () => {
    expect(PILE.depth).toBe(8);
    expect(PILE.jitter).toBe(3.5);
    expect(PILE.peek).toBe(12);
    expect(PILE.throwMs).toBe(150);
  });
});

describe('seededRotation', () => {
  it('is deterministic per id (no shimmer on re-render)', () => {
    expect(seededRotation(42)).toBe(seededRotation(42));
    expect(seededRotation(7)).not.toBe(seededRotation(8));
  });
  it('stays within [-1, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const r = seededRotation(i);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe('cyclePileOrder', () => {
  it('moves the top card to the back', () => {
    expect(cyclePileOrder([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
  });
  it('is a no-op for 0 or 1 items', () => {
    expect(cyclePileOrder([])).toEqual([]);
    expect(cyclePileOrder([9])).toEqual([9]);
  });
  it('returns to the original after N cycles (non-destructive)', () => {
    let order = [1, 2, 3];
    for (let i = 0; i < 3; i++) order = cyclePileOrder(order);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('mergeWatching', () => {
  it('merges movies + shows sorted by updated_at desc', () => {
    const movies = [
      movie({ tmdb_id: 1, title: 'Old Film', updated_at: '2026-01-01T00:00:00Z' }),
      movie({ tmdb_id: 2, title: 'New Film', updated_at: '2026-07-10T00:00:00Z' }),
    ];
    const shows = [show({ tmdb_id: 100, name: 'Mid Show', updated_at: '2026-05-01T00:00:00Z' })];
    const merged = mergeWatching(movies, shows);
    expect(merged.map((m) => m.title)).toEqual(['New Film', 'Mid Show', 'Old Film']);
  });

  it('normalizes title (movie.title) and (show.name), synthesizes media + key', () => {
    const merged = mergeWatching([movie({ tmdb_id: 5, title: 'Film' })], [show({ tmdb_id: 9, name: 'Series' })]);
    const film = merged.find((m) => m.tmdbId === 5)!;
    const series = merged.find((m) => m.tmdbId === 9)!;
    expect(film.media).toBe('movie');
    expect(film.key).toBe('movie:5');
    expect(series.media).toBe('tv');
    expect(series.title).toBe('Series');
    expect(series.key).toBe('tv:9');
  });

  it('treats a null TV updated_at as oldest (guarded)', () => {
    const merged = mergeWatching(
      [movie({ tmdb_id: 1, updated_at: '2026-01-01T00:00:00Z' })],
      [show({ tmdb_id: 100, updated_at: null })]
    );
    expect(merged[merged.length - 1].tmdbId).toBe(100);
  });
});

describe('watching scope helpers', () => {
  const items = mergeWatching(
    [movie({ tmdb_id: 1 }), movie({ tmdb_id: 2 })],
    [show({ tmdb_id: 100 })]
  );

  it('counts by media', () => {
    expect(watchingScopeCounts(items)).toEqual({ all: 3, movie: 2, tv: 1 });
  });
  it('shows scope chips only when both media present', () => {
    expect(shouldShowWatchingScopes(items)).toBe(true);
    expect(shouldShowWatchingScopes(mergeWatching([movie({ tmdb_id: 1 })], []))).toBe(false);
    expect(shouldShowWatchingScopes(mergeWatching([], [show({ tmdb_id: 100 })]))).toBe(false);
  });
  it('filters by scope', () => {
    expect(filterWatchingByScope(items, 'all')).toHaveLength(3);
    expect(filterWatchingByScope(items, 'movie')).toHaveLength(2);
    expect(filterWatchingByScope(items, 'tv')).toHaveLength(1);
  });
});

describe('TV episode progress', () => {
  it('labels the next episode, or null when untracked', () => {
    expect(nextEpisodeLabel({ currentSeason: 2, currentEpisode: 5 })).toBe('Next · S2 E5');
    expect(nextEpisodeLabel({ currentSeason: null, currentEpisode: 5 })).toBeNull();
    expect(nextEpisodeLabel({ currentSeason: 2, currentEpisode: null })).toBeNull();
  });
  it('computes a clamped progress fraction', () => {
    expect(episodeProgress({ episodesWatched: 5, totalEpisodes: 10 })).toBe(0.5);
    expect(episodeProgress({ episodesWatched: 0, totalEpisodes: 10 })).toBe(0);
    expect(episodeProgress({ episodesWatched: 12, totalEpisodes: 10 })).toBe(1);
    expect(episodeProgress({ episodesWatched: null, totalEpisodes: 10 })).toBe(0);
    expect(episodeProgress({ episodesWatched: 5, totalEpisodes: 0 })).toBe(0);
  });
});

describe('cover resolution', () => {
  const candidates: CoverCandidate[] = [
    { tmdbId: 1, media: 'movie', backdropPath: null, score: 9 },
    { tmdbId: 2, media: 'movie', backdropPath: '/b2.jpg', score: 6 },
    { tmdbId: 3, media: 'tv', backdropPath: '/b3.jpg', score: 8 },
  ];

  it('smart default = most popular WITH a backdrop (ignores the higher-scored backdropless one)', () => {
    expect(pickSmartCover(candidates)?.tmdbId).toBe(3);
  });
  it('returns null when nothing has a backdrop', () => {
    expect(pickSmartCover([{ tmdbId: 1, media: 'movie', backdropPath: null, score: 5 }])).toBeNull();
  });
  it('chosen wins when it has a backdrop', () => {
    expect(resolveCover(candidates, 2)?.tmdbId).toBe(2);
  });
  it('falls back to smart default when the chosen title has no inline backdrop', () => {
    expect(resolveCover(candidates, 1)?.tmdbId).toBe(3);
  });
  it('falls back to smart default when nothing is chosen', () => {
    expect(resolveCover(candidates, null)?.tmdbId).toBe(3);
  });
});

describe('programme-count copy', () => {
  it('formats the Watchlist "deep" count', () => {
    expect(formatDeepCount(19)).toBe('19 films deep');
    expect(formatDeepCount(1)).toBe('1 film deep');
  });
  it('splits mixed counts and singularizes', () => {
    expect(formatSplitCount(1, 3)).toBe('1 film · 3 shows');
    expect(formatSplitCount(7, 0)).toBe('7 films');
    expect(formatSplitCount(0, 2)).toBe('2 shows');
    expect(formatSplitCount(0, 0)).toBe('0 films');
    expect(formatSplitCount(1, 1)).toBe('1 film · 1 show');
  });
});
