import {
  computeTopDecade,
  computeComfortGenre,
  computeStaleness,
  computePicks,
  formatTopDirectors,
  normalizeCacheRow,
  computeTasteInsights,
  STALE_LOG_DELTA,
  PICKS_COUNT,
  type UserMovieRow,
  type TasteInsightsCacheRow,
} from '@/lib/taste-profile';
import type { CanonFilm } from '@/lib/blind-spots';

function movie(overrides: Partial<UserMovieRow> & { tmdbId: number }): UserMovieRow {
  return {
    genreIds: [],
    releaseDate: null,
    ...overrides,
  };
}

function film(overrides: Partial<CanonFilm> & { tmdbId: number }): CanonFilm {
  return {
    era: '90s',
    title: `Film ${overrides.tmdbId}`,
    year: 1995,
    genreIds: [],
    voteAverage: 7,
    posterPath: null,
    ...overrides,
  };
}

function cacheRow(overrides: Partial<{
  summary: string;
  aggregates: Record<string, unknown>;
  logs_count_at_generation: number;
  generated_at: string;
}> = {}) {
  return {
    summary: 'You gravitate toward tense, director-driven thrillers.',
    aggregates: {
      topDirectors: [{ name: 'Denis Villeneuve', count: 4 }, { name: 'David Fincher', count: 3 }],
      topStudio: 'A24',
    },
    logs_count_at_generation: 20,
    generated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeTopDecade', () => {
  it('buckets release years into decade labels and returns the most frequent', () => {
    const movies = [
      movie({ tmdbId: 1, releaseDate: '1994-01-01' }),
      movie({ tmdbId: 2, releaseDate: '1996-06-01' }),
      movie({ tmdbId: 3, releaseDate: '2021-01-01' }),
    ];
    expect(computeTopDecade(movies)).toEqual({ decade: '1990s', count: 2 });
  });

  it('returns null when no movie has a usable release_date', () => {
    const movies = [movie({ tmdbId: 1, releaseDate: null }), movie({ tmdbId: 2, releaseDate: '' })];
    expect(computeTopDecade(movies)).toBeNull();
  });

  it('returns null for an empty library', () => {
    expect(computeTopDecade([])).toBeNull();
  });

  it('ignores a malformed release_date without crashing', () => {
    const movies = [movie({ tmdbId: 1, releaseDate: 'not-a-date' }), movie({ tmdbId: 2, releaseDate: '2010-05-01' })];
    expect(computeTopDecade(movies)).toEqual({ decade: '2010s', count: 1 });
  });
});

describe('computeComfortGenre', () => {
  it('returns the most-watched genre with its TMDB name and count', () => {
    const movies = [
      movie({ tmdbId: 1, genreIds: [18] }), // Drama
      movie({ tmdbId: 2, genreIds: [18, 53] }), // Drama, Thriller
      movie({ tmdbId: 3, genreIds: [53] }), // Thriller
    ];
    expect(computeComfortGenre(movies)).toEqual({ genreId: 18, name: 'Drama', count: 2 });
  });

  it('returns null when no movie has genre_ids', () => {
    expect(computeComfortGenre([movie({ tmdbId: 1, genreIds: null }), movie({ tmdbId: 2, genreIds: [] })])).toBeNull();
  });

  it('returns null for an empty library', () => {
    expect(computeComfortGenre([])).toBeNull();
  });

  it('skips unknown genre ids without crashing', () => {
    const movies = [movie({ tmdbId: 1, genreIds: [999999] }), movie({ tmdbId: 2, genreIds: [18] })];
    expect(computeComfortGenre(movies)).toEqual({ genreId: 18, name: 'Drama', count: 1 });
  });
});

describe('computeStaleness', () => {
  it('is stale when there is no cache row', () => {
    expect(computeStaleness(20, null)).toBe(true);
  });

  const cache: TasteInsightsCacheRow = {
    summary: 'x',
    topDirectors: [],
    topStudio: null,
    generatedAt: '2026-07-01T00:00:00.000Z',
    logsCountAtGeneration: 20,
  };

  it(`is stale once the delta reaches STALE_LOG_DELTA (${STALE_LOG_DELTA})`, () => {
    expect(computeStaleness(20 + STALE_LOG_DELTA, cache)).toBe(true);
  });

  it('is not stale one below the delta threshold', () => {
    expect(computeStaleness(20 + STALE_LOG_DELTA - 1, cache)).toBe(false);
  });

  it('is not stale when the watched count has not moved', () => {
    expect(computeStaleness(20, cache)).toBe(false);
  });
});

describe('computePicks', () => {
  const canon: CanonFilm[] = [
    film({ tmdbId: 1, genreIds: [18], voteAverage: 9.0 }),
    film({ tmdbId: 2, genreIds: [18], voteAverage: 8.5 }),
    film({ tmdbId: 3, genreIds: [18], voteAverage: 8.0 }),
    film({ tmdbId: 4, genreIds: [18], voteAverage: 7.5 }), // 4th Drama — beyond PICKS_COUNT
    film({ tmdbId: 5, genreIds: [53], voteAverage: 9.9 }), // different genre — excluded
  ];

  it('returns up to PICKS_COUNT unwatched films in the comfort genre, sorted by vote average', () => {
    const picks = computePicks([], 18, canon);
    expect(picks).toHaveLength(PICKS_COUNT);
    expect(picks.map((p) => p.tmdbId)).toEqual([1, 2, 3]);
  });

  it('excludes films the user has already watched', () => {
    const movies = [movie({ tmdbId: 1 })];
    const picks = computePicks(movies, 18, canon);
    expect(picks.map((p) => p.tmdbId)).toEqual([2, 3, 4]);
  });

  it('returns an empty array when comfortGenreId is null', () => {
    expect(computePicks([], null, canon)).toEqual([]);
  });

  it('returns an empty array when no canon film matches the genre', () => {
    expect(computePicks([], 27, canon)).toEqual([]); // Horror — not in fixture canon
  });
});

describe('formatTopDirectors', () => {
  it('joins the top directors up to max (default 2)', () => {
    const directors = [{ name: 'Denis Villeneuve', count: 4 }, { name: 'David Fincher', count: 3 }, { name: 'Greta Gerwig', count: 2 }];
    expect(formatTopDirectors(directors)).toBe('Denis Villeneuve, David Fincher');
  });

  it('returns a single name when only one director is present', () => {
    expect(formatTopDirectors([{ name: 'Denis Villeneuve', count: 4 }])).toBe('Denis Villeneuve');
  });

  it('returns null for an empty list', () => {
    expect(formatTopDirectors([])).toBeNull();
  });

  it('respects a custom max', () => {
    const directors = [{ name: 'A', count: 3 }, { name: 'B', count: 2 }, { name: 'C', count: 1 }];
    expect(formatTopDirectors(directors, 3)).toBe('A, B, C');
  });
});

describe('normalizeCacheRow', () => {
  it('returns null for a null row (no cache generated yet)', () => {
    expect(normalizeCacheRow(null)).toBeNull();
  });

  it('returns null when the row has no summary', () => {
    expect(normalizeCacheRow({ aggregates: {} })).toBeNull();
  });

  it('extracts topDirectors/topStudio from the aggregates jsonb blob', () => {
    const normalized = normalizeCacheRow(cacheRow());
    expect(normalized).toEqual({
      summary: 'You gravitate toward tense, director-driven thrillers.',
      topDirectors: [{ name: 'Denis Villeneuve', count: 4 }, { name: 'David Fincher', count: 3 }],
      topStudio: 'A24',
      generatedAt: '2026-07-01T00:00:00.000Z',
      logsCountAtGeneration: 20,
    });
  });

  it('tolerates a missing aggregates object', () => {
    const normalized = normalizeCacheRow({ summary: 'x', logs_count_at_generation: 5, generated_at: '2026-07-01T00:00:00.000Z' });
    expect(normalized).toEqual({
      summary: 'x',
      topDirectors: [],
      topStudio: null,
      generatedAt: '2026-07-01T00:00:00.000Z',
      logsCountAtGeneration: 5,
    });
  });

  it('drops malformed entries inside topDirectors rather than crashing', () => {
    const normalized = normalizeCacheRow(
      cacheRow({ aggregates: { topDirectors: [{ name: 'Valid', count: 2 }, { name: 'NoCount' }, { count: 3 }] } })
    );
    expect(normalized?.topDirectors).toEqual([{ name: 'Valid', count: 2 }]);
  });
});

describe('computeTasteInsights — cold start / composition', () => {
  it('handles an empty library without crashing', () => {
    const tp = computeTasteInsights([], null, []);
    expect(tp).toEqual({
      watchedCount: 0,
      topDecade: null,
      comfortGenre: null,
      picks: [],
      cache: null,
      stale: true,
    });
  });

  it('handles movies with missing release_date/genre_ids gracefully', () => {
    const movies = [
      movie({ tmdbId: 1, genreIds: null, releaseDate: null }),
      movie({ tmdbId: 2, genreIds: undefined as unknown as null, releaseDate: undefined as unknown as null }),
    ];
    const tp = computeTasteInsights(movies, null, []);
    expect(tp.watchedCount).toBe(2);
    expect(tp.topDecade).toBeNull();
    expect(tp.comfortGenre).toBeNull();
    expect(tp.picks).toEqual([]);
  });

  it('composes decade/genre/picks from movies with a real cache row', () => {
    const movies = [
      movie({ tmdbId: 100, genreIds: [18], releaseDate: '2015-01-01' }),
      movie({ tmdbId: 101, genreIds: [18], releaseDate: '2016-01-01' }),
    ];
    const canon: CanonFilm[] = [film({ tmdbId: 200, genreIds: [18], voteAverage: 8.8 })];

    const tp = computeTasteInsights(movies, cacheRow({ logs_count_at_generation: 2 }), canon);

    expect(tp.watchedCount).toBe(2);
    expect(tp.topDecade).toEqual({ decade: '2010s', count: 2 });
    expect(tp.comfortGenre).toEqual({ genreId: 18, name: 'Drama', count: 2 });
    expect(tp.picks.map((p) => p.tmdbId)).toEqual([200]);
    expect(tp.cache?.summary).toBe('You gravitate toward tense, director-driven thrillers.');
    expect(tp.stale).toBe(false); // watchedCount (2) - logsCountAtGeneration (2) = 0 < STALE_LOG_DELTA
  });
});
