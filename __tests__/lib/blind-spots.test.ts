import { computeBlindSpots, ERA_ORDER, type CanonFilm, type Era, type UserMovie } from '@/lib/blind-spots';

function film(overrides: Partial<CanonFilm> & { tmdbId: number; era: Era }): CanonFilm {
  return {
    title: `Film ${overrides.tmdbId}`,
    year: 2000,
    genreIds: [],
    voteAverage: 7,
    posterPath: null,
    ...overrides,
  };
}

function watched(tmdbId: number, genreIds: number[] | null = []): UserMovie {
  return { tmdbId, genreIds };
}

// All 17 non-Western movie genre IDs (TMDB_GENRE_MAP), packed onto one row so
// a single filler "watched" movie covers every genre except Western (37) —
// keeps genre-gap fixtures deterministic without hand-rolling 17 rows.
const ALL_GENRES_EXCEPT_WESTERN = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53, 10752,
];

describe('computeBlindSpots — era coverage', () => {
  it('computes pct as watched/24 (fixed canon-per-era denominator) and flags a gap under 20%', () => {
    const canon = [1, 2, 3, 4].map((tmdbId) => film({ tmdbId, era: 'pre70s' }));
    const userMovies = [1, 2, 3, 4].map((tmdbId) => watched(tmdbId));

    const rp = computeBlindSpots(userMovies, canon);
    const pre70s = rp.eras.find((e) => e.era === 'pre70s')!;

    expect(pre70s.pct).toBe(17); // 4/24 = 16.67% -> rounds to 17
    expect(pre70s.isGap).toBe(true);
  });

  it('does not flag a gap once coverage rounds to 20% or above', () => {
    const canon = [1, 2, 3, 4, 5].map((tmdbId) => film({ tmdbId, era: '70s' }));
    const userMovies = canon.map((f) => watched(f.tmdbId));

    const rp = computeBlindSpots(userMovies, canon);
    const era70s = rp.eras.find((e) => e.era === '70s')!;

    expect(era70s.pct).toBe(21); // 5/24 = 20.83% -> rounds to 21
    expect(era70s.isGap).toBe(false);
  });

  it('reports 0% for an era with no watched canon titles', () => {
    const canon = [film({ tmdbId: 10, era: '80s' })];
    const rp = computeBlindSpots([], canon);
    const era80s = rp.eras.find((e) => e.era === '80s')!;

    expect(era80s.pct).toBe(0);
    expect(era80s.isGap).toBe(true);
  });

  it('always returns all 7 eras in chronological order, even if canon omits one', () => {
    const rp = computeBlindSpots([], [film({ tmdbId: 1, era: '20s' })]);
    expect(rp.eras.map((e) => e.era)).toEqual(ERA_ORDER);
  });
});

describe('computeBlindSpots — genre gaps', () => {
  it('orders genres ascending by watched count, reporting 0 for genres never logged', () => {
    const userMovies: UserMovie[] = [watched(1, [28]), watched(2, [28]), watched(3, [28])];

    const rp = computeBlindSpots(userMovies, []);

    expect(rp.genreGaps).toHaveLength(4);
    expect(rp.genreGaps.every((g) => g.watched === 0)).toBe(true);
    // Action (28) has 3 watched — it must not appear among the bottom-4.
    expect(rp.genreGaps.find((g) => g.genreId === 28)).toBeUndefined();
  });

  it('skips rows with null genreIds when counting', () => {
    const userMovies: UserMovie[] = [watched(1, null), watched(2, null)];
    const rp = computeBlindSpots(userMovies, []);

    expect(rp.genreGaps).toHaveLength(4);
    expect(rp.genreGaps.every((g) => g.watched === 0)).toBe(true);
  });
});

describe('computeBlindSpots — spotlight', () => {
  it('picks the highest-rated UNWATCHED film from the weakest era, excluding watched titles', () => {
    const canon: CanonFilm[] = [
      film({ tmdbId: 1, era: 'pre70s', voteAverage: 9.0 }), // watched — highest score, must be excluded
      film({ tmdbId: 2, era: 'pre70s', voteAverage: 8.0 }), // unwatched — expected spotlight
      ...['70s', '80s', '90s', '00s', '10s', '20s'].flatMap((era, i) => [
        film({ tmdbId: 100 + i * 2, era: era as Era, voteAverage: 7 }),
        film({ tmdbId: 101 + i * 2, era: era as Era, voteAverage: 7 }),
      ]),
    ];
    // pre70s: 1 of 2 canon titles watched (tmdbId 1) -> 1/24 = 4%.
    // every other era: both canon titles watched -> 2/24 = 8% (clearly not weakest).
    const otherEraWatched = ['70s', '80s', '90s', '00s', '10s', '20s'].flatMap((_, i) => [100 + i * 2, 101 + i * 2]);
    const userMovies = [1, ...otherEraWatched].map((tmdbId) => watched(tmdbId));

    const rp = computeBlindSpots(userMovies, canon);

    expect(rp.spotlight?.tmdbId).toBe(2);
    expect(rp.spotlight?.stat).toBe('8.0');
  });
});

describe('computeBlindSpots — picks dedupe', () => {
  it('never lets a film appear as both the spotlight and a pick', () => {
    const canon: CanonFilm[] = [
      film({ tmdbId: 1, era: 'pre70s', voteAverage: 9, genreIds: [37] }), // unwatched Western — highest score in weakest era
      film({ tmdbId: 2, era: 'pre70s', voteAverage: 8, genreIds: [28] }), // unwatched, next-best in weakest era
      film({ tmdbId: 10, era: '70s', voteAverage: 7 }),
      film({ tmdbId: 11, era: '70s', voteAverage: 7 }),
      film({ tmdbId: 12, era: '80s', voteAverage: 7 }),
      film({ tmdbId: 13, era: '80s', voteAverage: 7 }),
      film({ tmdbId: 14, era: '90s', voteAverage: 7 }),
      film({ tmdbId: 15, era: '90s', voteAverage: 7 }),
      film({ tmdbId: 16, era: '00s', voteAverage: 7 }),
      film({ tmdbId: 17, era: '00s', voteAverage: 7 }),
      film({ tmdbId: 18, era: '10s', voteAverage: 7 }),
      film({ tmdbId: 19, era: '10s', voteAverage: 7 }),
      film({ tmdbId: 20, era: '20s', voteAverage: 7 }),
      film({ tmdbId: 21, era: '20s', voteAverage: 7 }),
      // Second unwatched Western — the genre pick's expected fallback once
      // film 1 is already claimed by the spotlight.
      film({ tmdbId: 99, era: '20s', voteAverage: 6, genreIds: [37] }),
    ];
    const userMovies = [
      watched(10), watched(11), watched(12), watched(13), watched(14), watched(15),
      watched(16), watched(17), watched(18), watched(19), watched(20), watched(21),
      // Filler row covering every movie genre except Western, so Western is
      // deterministically the single least-watched genre.
      watched(500, ALL_GENRES_EXCEPT_WESTERN),
    ];

    const rp = computeBlindSpots(userMovies, canon);

    expect(rp.spotlight?.tmdbId).toBe(1); // highest-rated unwatched film in the weakest era (pre70s)

    const pickIds = rp.picks.map((p) => p.tmdbId);
    expect(pickIds).not.toContain(1);
    expect(new Set(pickIds).size).toBe(pickIds.length); // no film repeats across picks either

    const genrePick = rp.picks.find((p) => p.gapTag === 'Western gap');
    expect(genrePick?.tmdbId).toBe(99); // NOT film 1 — already claimed by the spotlight
  });
});

describe('computeBlindSpots — insufficient / edge-case data', () => {
  it('handles an empty library without throwing — all eras gapped, genres all at 0', () => {
    const canon = ERA_ORDER.flatMap((era, i) => [
      film({ tmdbId: i * 2 + 1, era, voteAverage: 7 }),
      film({ tmdbId: i * 2 + 2, era, voteAverage: 6 }),
    ]);

    const rp = computeBlindSpots([], canon);

    expect(rp.watchedCount).toBe(0);
    expect(rp.eras.every((e) => e.pct === 0 && e.isGap)).toBe(true);
    expect(rp.genreGaps).toHaveLength(4);
    expect(rp.genreGaps.every((g) => g.watched === 0)).toBe(true);
    // Spotlight/picks are still computable purely from canon when the
    // library is empty (everything is unwatched).
    expect(rp.spotlight).not.toBeNull();
    expect(rp.picks.length).toBeGreaterThan(0);
  });

  it('falls back to an honest empty state when the user has watched the entire canon', () => {
    const canon = [film({ tmdbId: 1, era: 'pre70s' }), film({ tmdbId: 2, era: '70s' })];
    const userMovies = canon.map((f) => watched(f.tmdbId));

    const rp = computeBlindSpots(userMovies, canon);

    expect(rp.spotlight).toBeNull();
    expect(rp.picks).toEqual([]);
  });
});
