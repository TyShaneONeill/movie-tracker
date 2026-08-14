import { makeTMDBMovie, mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));

jest.mock('@/lib/movie-service', () => ({
  searchMovies: jest.fn(),
  addMovieToLibrary: jest.fn(),
  fetchUserMovies: jest.fn(),
}));

import {
  parseLetterboxdCSV,
  matchMoviesToTMDB,
  markDuplicateMatches,
  importMovies,
  exportCollectionCSV,
  detectLetterboxdCSVType,
  LetterboxdCSVNotStringError,
} from '@/lib/letterboxd-service';
import type { LetterboxdEntry, MatchedMovie } from '@/lib/letterboxd-service';
import { searchMovies, fetchUserMovies, addMovieToLibrary } from '@/lib/movie-service';
import { supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/sentry';
import type { UserMovie } from '@/lib/database.types';

const mockSearchMovies = searchMovies as jest.Mock;
const mockFetchUserMovies = fetchUserMovies as jest.Mock;
const mockAddMovieToLibrary = addMovieToLibrary as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockCaptureMessage = captureMessage as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

const CSV_HEADERS =
  'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date';

/**
 * Build a Letterboxd-style CSV string from an array of row objects.
 * Unspecified fields default to empty strings.
 */
function makeLetterboxdCSV(
  rows: Array<{
    Date?: string;
    Name?: string;
    Year?: string;
    LetterboxdURI?: string;
    Rating?: string;
    Rewatch?: string;
    Tags?: string;
    WatchedDate?: string;
  }>
): string {
  const lines = rows.map((r) =>
    [
      r.Date ?? '',
      r.Name ?? '',
      r.Year ?? '',
      r.LetterboxdURI ?? '',
      r.Rating ?? '',
      r.Rewatch ?? '',
      r.Tags ?? '',
      r.WatchedDate ?? '',
    ].join(',')
  );
  return [CSV_HEADERS, ...lines].join('\n');
}

const USER_ID = 'user-abc-123';

function makeUserMovie(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: 'movie-uuid-1',
    user_id: USER_ID,
    tmdb_id: 550,
    title: 'Fight Club',
    source: 'manual',
    overview: 'A ticking-Loss-of-identity tale.',
    poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg',
    backdrop_path: '/87hTDiay2N2qWyX4Ds7ybXi9h8I.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
    status: 'watched',
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_liked: null,
    journey_number: null,
    journey_notes: null,
    journey_tagline: null,
    journey_photos: null,
    journey_created_at: null,
    journey_updated_at: null,
    watched_at: '2024-03-15T00:00:00Z',
    watch_time: null,
    location_name: null,
    location_type: null,
    auditorium: null,
    seat_location: null,
    ticket_price: null,
    ticket_id: null,
    watch_format: null,
    watched_with: null,
    ai_poster_url: null,
    ai_poster_rarity: null,
    display_poster: null,
    cover_photo_index: null,
    theater_chain: null,
    ticket_type: null,
    mpaa_rating: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LetterboxdEntry> = {}): LetterboxdEntry {
  return {
    name: 'Fight Club',
    year: 1999,
    watchedDate: '2024-03-15',
    rating: 4.5,
    isRewatch: false,
    letterboxdUri: 'https://boxd.it/abc',
    ...overrides,
  };
}

function makeMatchedMovie(overrides: Partial<MatchedMovie> = {}): MatchedMovie {
  return {
    entry: makeEntry({ watchedDate: null }),
    tmdbMovie: makeTMDBMovie() as any,
    status: 'matched',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// parseLetterboxdCSV
// ============================================================================

describe('parseLetterboxdCSV', () => {
  it('parses valid diary CSV with correct field mapping', () => {
    const csv = makeLetterboxdCSV([
      {
        Date: '2024-03-15',
        Name: 'Fight Club',
        Year: '1999',
        LetterboxdURI: 'https://boxd.it/abc',
        Rating: '4.5',
        Rewatch: 'Yes',
        Tags: '',
        WatchedDate: '2024-03-15',
      },
      {
        Date: '2024-03-10',
        Name: 'The Matrix',
        Year: '1999',
        LetterboxdURI: 'https://boxd.it/def',
        Rating: '5',
        Rewatch: '',
        Tags: 'sci-fi',
        WatchedDate: '2024-03-10',
      },
      {
        Date: '2024-02-20',
        Name: 'Parasite',
        Year: '2019',
        LetterboxdURI: 'https://boxd.it/ghi',
        Rating: '4',
        Rewatch: '',
        Tags: '',
        WatchedDate: '2024-02-20',
      },
    ]);

    const result = parseLetterboxdCSV(csv);

    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      name: 'Fight Club',
      year: 1999,
      watchedDate: '2024-03-15',
      rating: 4.5,
      isRewatch: true,
      letterboxdUri: 'https://boxd.it/abc',
    });

    expect(result[1]).toEqual({
      name: 'The Matrix',
      year: 1999,
      watchedDate: '2024-03-10',
      rating: 5,
      isRewatch: false,
      letterboxdUri: 'https://boxd.it/def',
    });

    expect(result[2]).toEqual({
      name: 'Parasite',
      year: 2019,
      watchedDate: '2024-02-20',
      rating: 4,
      isRewatch: false,
      letterboxdUri: 'https://boxd.it/ghi',
    });
  });

  it('handles missing optional fields', () => {
    const csv = makeLetterboxdCSV([
      {
        Date: '2024-03-15',
        Name: 'Fight Club',
        Year: '1999',
      },
    ]);

    const result = parseLetterboxdCSV(csv);

    expect(result).toHaveLength(1);
    expect(result[0].rating).toBeNull();
    expect(result[0].isRewatch).toBe(false);
    expect(result[0].letterboxdUri).toBeNull();
    expect(result[0].watchedDate).toBe('2024-03-15');
  });

  it('skips entries without a movie name', () => {
    const csv = makeLetterboxdCSV([
      { Name: 'Fight Club', Year: '1999', Rating: '4.5' },
      { Name: '', Year: '2000', Rating: '3' },
      { Name: 'The Matrix', Year: '1999', Rating: '5' },
    ]);

    const result = parseLetterboxdCSV(csv);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Fight Club');
    expect(result[1].name).toBe('The Matrix');
  });

  it('returns empty array for CSV with only headers', () => {
    const csv = CSV_HEADERS;

    const result = parseLetterboxdCSV(csv);

    expect(result).toEqual([]);
  });

  it('trims whitespace from movie names', () => {
    const csv = makeLetterboxdCSV([
      { Name: '  Fight Club  ', Year: '1999' },
      { Name: '\tThe Matrix\t', Year: '1999' },
    ]);

    const result = parseLetterboxdCSV(csv);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Fight Club');
    expect(result[1].name).toBe('The Matrix');
  });

  it('throws LetterboxdCSVNotStringError for undefined input', () => {
    expect(() => parseLetterboxdCSV(undefined as unknown as string)).toThrow(
      LetterboxdCSVNotStringError
    );
  });

  it('throws LetterboxdCSVNotStringError for null input', () => {
    expect(() => parseLetterboxdCSV(null as unknown as string)).toThrow(
      LetterboxdCSVNotStringError
    );
  });

  it('throws LetterboxdCSVNotStringError for non-string input', () => {
    expect(() => parseLetterboxdCSV(42 as unknown as string)).toThrow(
      LetterboxdCSVNotStringError
    );
  });
});

// ============================================================================
// detectLetterboxdCSVType
// ============================================================================

describe('detectLetterboxdCSVType', () => {
  it('identifies watched.csv by Date + Name columns without Rating or Watched Date', () => {
    const csv = 'Date,Name,Year,Letterboxd URI\n2023-07-26,Barbie,2023,https://boxd.it/bCLK';
    expect(detectLetterboxdCSVType(csv)).toBe('watched');
  });

  it('identifies diary.csv by Watched Date + Rewatch columns', () => {
    const csv = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2023-07-26,Barbie,2023,https://boxd.it/bCLK,4.5,,in theaters,2023-07-26';
    expect(detectLetterboxdCSVType(csv)).toBe('diary');
  });

  it('identifies ratings.csv by Rating column without Watched Date', () => {
    const csv = 'Date,Name,Year,Letterboxd URI,Rating\n2023-07-26,Barbie,2023,https://boxd.it/bCLK,4.5';
    expect(detectLetterboxdCSVType(csv)).toBe('ratings');
  });

  it('returns unknown for unrecognized CSV headers', () => {
    const csv = 'foo,bar,baz\n1,2,3';
    expect(detectLetterboxdCSVType(csv)).toBe('unknown');
  });

  it('returns unknown for completely empty CSV', () => {
    expect(detectLetterboxdCSVType('')).toBe('unknown');
  });

  it('returns unknown for whitespace-only CSV (routes to wrong-file, not a read error)', () => {
    expect(detectLetterboxdCSVType('   \n  ')).toBe('unknown');
  });

  it('throws LetterboxdCSVNotStringError for undefined input', () => {
    expect(() => detectLetterboxdCSVType(undefined as unknown as string)).toThrow(
      LetterboxdCSVNotStringError
    );
  });

  it('throws LetterboxdCSVNotStringError for null input', () => {
    expect(() => detectLetterboxdCSVType(null as unknown as string)).toThrow(
      LetterboxdCSVNotStringError
    );
  });
});

// ============================================================================
// matchMoviesToTMDB
// ============================================================================

describe('matchMoviesToTMDB', () => {
  it('matches movie by title and year', async () => {
    const wrongYearMovie = makeTMDBMovie({
      id: 100,
      title: 'Fight Club',
      release_date: '2020-01-01',
    });
    const correctYearMovie = makeTMDBMovie({
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
    });

    mockSearchMovies.mockResolvedValue({
      movies: [wrongYearMovie, correctYearMovie],
      page: 1,
      totalPages: 1,
      totalResults: 2,
    });

    const entries = [makeEntry({ name: 'Fight Club', year: 1999 })];

    const result = await matchMoviesToTMDB(entries);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('matched');
    expect(result[0].tmdbMovie).toEqual(correctYearMovie);
    expect(mockSearchMovies).toHaveBeenCalledWith('Fight Club');
  });

  it('falls back to first result when no year match', async () => {
    const firstMovie = makeTMDBMovie({
      id: 100,
      title: 'Fight Club',
      release_date: '2020-01-01',
    });
    const secondMovie = makeTMDBMovie({
      id: 200,
      title: 'Fight Club 2',
      release_date: '2021-05-10',
    });

    mockSearchMovies.mockResolvedValue({
      movies: [firstMovie, secondMovie],
      page: 1,
      totalPages: 1,
      totalResults: 2,
    });

    const entries = [makeEntry({ name: 'Fight Club', year: 1999 })];

    const result = await matchMoviesToTMDB(entries);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('matched');
    expect(result[0].tmdbMovie).toEqual(firstMovie);
  });

  it('marks as unmatched when no results', async () => {
    mockSearchMovies.mockResolvedValue({
      movies: [],
      page: 1,
      totalPages: 0,
      totalResults: 0,
    });

    const entries = [makeEntry({ name: 'Nonexistent Movie', year: 2024 })];

    const result = await matchMoviesToTMDB(entries);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unmatched');
    expect(result[0].tmdbMovie).toBeNull();
  });

  it('calls onProgress callback with incrementing current count', async () => {
    mockSearchMovies
      .mockResolvedValueOnce({
        movies: [makeTMDBMovie({ id: 1, release_date: '1999-10-15' })],
        page: 1,
        totalPages: 1,
        totalResults: 1,
      })
      .mockResolvedValueOnce({
        movies: [],
        page: 1,
        totalPages: 0,
        totalResults: 0,
      })
      .mockResolvedValueOnce({
        movies: [makeTMDBMovie({ id: 3, release_date: '2019-05-30' })],
        page: 1,
        totalPages: 1,
        totalResults: 1,
      });

    const onProgress = jest.fn();
    const entries = [
      makeEntry({ name: 'Fight Club', year: 1999 }),
      makeEntry({ name: 'Unknown Film', year: 2024 }),
      makeEntry({ name: 'Parasite', year: 2019 }),
    ];

    await matchMoviesToTMDB(entries, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);

    // Check incrementing current count
    expect(onProgress.mock.calls[0][0].current).toBe(1);
    expect(onProgress.mock.calls[1][0].current).toBe(2);
    expect(onProgress.mock.calls[2][0].current).toBe(3);

    // Check totals
    expect(onProgress.mock.calls[2][0]).toMatchObject({
      total: 3,
      matched: 2,
      unmatched: 1,
      current: 3,
    });
  });
});

// ============================================================================
// markDuplicateMatches (#813: "Already in collection" was structurally always 0)
// ============================================================================

describe('markDuplicateMatches', () => {
  it('marks only the matches already watched, leaving the rest importable', async () => {
    const matches = [
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 1 }) as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 2 }) as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: null, status: 'unmatched' }),
    ];
    const lookupChain = mockSupabaseQuery({ data: [{ tmdb_id: 2 }], error: null });
    mockFrom.mockReturnValue(lookupChain);

    const duplicates = await markDuplicateMatches(USER_ID, matches);

    expect(duplicates).toBe(1);
    expect(matches[0].status).toBe('matched');
    expect(matches[1].status).toBe('duplicate');
    expect(matches[2].status).toBe('unmatched');
  });

  it('queries watched rows for the candidate tmdb_ids only', async () => {
    const matches = [
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 1 }) as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 2 }) as any, status: 'matched' }),
      // Unmatched entries have no movie to look up.
      makeMatchedMovie({ tmdbMovie: null, status: 'unmatched' }),
    ];
    const lookupChain = mockSupabaseQuery({ data: [], error: null });
    mockFrom.mockReturnValue(lookupChain);

    await markDuplicateMatches(USER_ID, matches);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(lookupChain.select).toHaveBeenCalledWith('tmdb_id');
    expect(lookupChain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    // Scoped to 'watched': a watchlist row for the same movie is NOT a
    // duplicate — importing it is what flips it to watched.
    expect(lookupChain.eq).toHaveBeenCalledWith('status', 'watched');
    expect(lookupChain.in).toHaveBeenCalledWith('tmdb_id', [1, 2]);
  });

  it('marks nothing when the lookup errors — an unverified read must not hide movies from the import', async () => {
    const matches = [
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 1 }) as any, status: 'matched' }),
    ];
    mockFrom.mockReturnValue(
      mockSupabaseQuery({ data: null, error: { message: 'gateway timeout' } })
    );

    const duplicates = await markDuplicateMatches(USER_ID, matches);

    expect(duplicates).toBe(0);
    expect(matches[0].status).toBe('matched');
  });

  it('chunks the lookup at 200 ids and unions the chunk responses', async () => {
    const matches = Array.from({ length: 250 }, (_, i) =>
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: i + 1 }) as any, status: 'matched' })
    );
    const firstChunkIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const secondChunkIds = Array.from({ length: 50 }, (_, i) => i + 201);
    const firstChunk = mockSupabaseQuery({ data: [{ tmdb_id: 5 }], error: null });
    const secondChunk = mockSupabaseQuery({ data: [{ tmdb_id: 205 }], error: null });
    mockFrom.mockReturnValueOnce(firstChunk).mockReturnValueOnce(secondChunk);

    const duplicates = await markDuplicateMatches(USER_ID, matches);

    expect(firstChunk.in).toHaveBeenCalledWith('tmdb_id', firstChunkIds);
    expect(secondChunk.in).toHaveBeenCalledWith('tmdb_id', secondChunkIds);
    expect(duplicates).toBe(2);
    expect(matches[4].status).toBe('duplicate');
    expect(matches[204].status).toBe('duplicate');
  });

  it('skips the read entirely when there is nothing matched to check', async () => {
    const matches = [makeMatchedMovie({ tmdbMovie: null, status: 'unmatched' })];

    expect(await markDuplicateMatches(USER_ID, matches)).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ============================================================================
// importMovies — reconciliation (#812: "Imported: 3" but zero rows persisted)
// ============================================================================

describe('importMovies', () => {
  it('recomputes imported/persistenceFailed when reconciliation finds only a subset actually persisted', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const movieB = makeTMDBMovie({ id: 2, title: 'Movie B' });
    const matches = [
      makeMatchedMovie({ tmdbMovie: movieA as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: movieB as any, status: 'matched' }),
    ];

    // Both upserts resolve successfully in the JS layer...
    mockAddMovieToLibrary
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }))
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-b', tmdb_id: 2 }));

    // ...but the reconciliation read only finds movie A actually persisted.
    const reconcileChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }],
      error: null,
    });
    mockFrom.mockReturnValue(reconcileChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(1);
    expect(result.persistenceFailed).toBe(1);
    expect(matches[0].status).toBe('imported');
    // Reverts to 'matched' (its pre-import state), not 'unmatched' — the
    // top-of-loop guard skips 'unmatched' entries, so 'matched' is what makes
    // a future retry over this same array actually re-attempt it.
    expect(matches[1].status).toBe('matched');

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'letterboxd-import-reconciliation-mismatch',
      { claimed: 2, claimedDistinct: 2, persisted: 1 }
    );
  });

  it('queries reconciliation with the exact user/status/tmdb_id filters addMovieToLibrary wrote', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const movieB = makeTMDBMovie({ id: 2, title: 'Movie B' });
    const matches = [
      makeMatchedMovie({ tmdbMovie: movieA as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: movieB as any, status: 'matched' }),
    ];

    mockAddMovieToLibrary
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }))
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-b', tmdb_id: 2 }));

    const reconcileChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }, { tmdb_id: 2 }],
      error: null,
    });
    mockFrom.mockReturnValue(reconcileChain);

    await importMovies(USER_ID, matches);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(reconcileChain.select).toHaveBeenCalledWith('tmdb_id');
    expect(reconcileChain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(reconcileChain.eq).toHaveBeenCalledWith('status', 'watched');
    expect(reconcileChain.in).toHaveBeenCalledWith('tmdb_id', [1, 2]);
  });

  it('chunks the reconciliation .in() filter into batches of 200 and unions the results', async () => {
    const CLAIMED_COUNT = 250; // spans two chunks at the 200-id chunk size
    const matches = Array.from({ length: CLAIMED_COUNT }, (_, i) =>
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: i + 1 }) as any, status: 'matched' })
    );

    for (let i = 0; i < CLAIMED_COUNT; i++) {
      mockAddMovieToLibrary.mockResolvedValueOnce(
        makeUserMovie({ id: `row-${i + 1}`, tmdb_id: i + 1 })
      );
    }

    // Every claimed id actually persisted, split across both chunk responses.
    const firstChunkIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const secondChunkIds = Array.from({ length: 50 }, (_, i) => i + 201);
    const firstChunkChain = mockSupabaseQuery({
      data: firstChunkIds.map((id) => ({ tmdb_id: id })),
      error: null,
    });
    const secondChunkChain = mockSupabaseQuery({
      data: secondChunkIds.map((id) => ({ tmdb_id: id })),
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(firstChunkChain)
      .mockReturnValueOnce(secondChunkChain);

    const result = await importMovies(USER_ID, matches);

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(firstChunkChain.in).toHaveBeenCalledWith('tmdb_id', firstChunkIds);
    expect(secondChunkChain.in).toHaveBeenCalledWith('tmdb_id', secondChunkIds);
    expect(result.imported).toBe(CLAIMED_COUNT);
    expect(result.persistenceFailed).toBe(0);
  });

  it('treats any chunk erroring as the whole reconciliation being unverifiable — no partial downgrades', async () => {
    const CLAIMED_COUNT = 250;
    const matches = Array.from({ length: CLAIMED_COUNT }, (_, i) =>
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: i + 1 }) as any, status: 'matched' })
    );

    for (let i = 0; i < CLAIMED_COUNT; i++) {
      mockAddMovieToLibrary.mockResolvedValueOnce(
        makeUserMovie({ id: `row-${i + 1}`, tmdb_id: i + 1 })
      );
    }

    // First chunk succeeds and would (wrongly) look like a real gap if acted
    // on alone; second chunk errors, which must void the whole verification.
    const firstChunkChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }], // only 1 of 200 "found" — looks like mass failure
      error: null,
    });
    const secondChunkChain = mockSupabaseQuery({
      data: null,
      error: { message: 'gateway timeout' },
    });
    mockFrom
      .mockReturnValueOnce(firstChunkChain)
      .mockReturnValueOnce(secondChunkChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(CLAIMED_COUNT);
    expect(result.persistenceFailed).toBe(0);
    expect(matches.every((m) => m.status === 'imported')).toBe(true);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'letterboxd-import-reconciliation-mismatch',
      expect.anything()
    );
  });

  it('sends distinct vs raw claimed counts so a rewatch (duplicate tmdb_id) claim does not read as a bigger failure than it is', async () => {
    // Two entries for the same movie (a rewatch) plus one genuinely-failed
    // movie. Both rewatch entries upsert onto the same row (journey_number
    // defaults to 1), so persisting tmdb_id 1 once satisfies both claims —
    // only tmdb_id 2 is a real reconciliation failure.
    const movieRewatch = makeTMDBMovie({ id: 1, title: 'Rewatched Movie' });
    const movieFailed = makeTMDBMovie({ id: 2, title: 'Failed Movie' });
    const matches = [
      makeMatchedMovie({ tmdbMovie: movieRewatch as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: movieRewatch as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: movieFailed as any, status: 'matched' }),
    ];

    mockAddMovieToLibrary
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-1a', tmdb_id: 1 }))
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-1b', tmdb_id: 1 }))
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-2', tmdb_id: 2 }));

    const reconcileChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }],
      error: null,
    });
    mockFrom.mockReturnValue(reconcileChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(2); // both rewatch claims still count
    expect(result.persistenceFailed).toBe(1); // only the real failure
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'letterboxd-import-reconciliation-mismatch',
      { claimed: 3, claimedDistinct: 2, persisted: 1 }
    );
  });

  it('leaves counts untouched when every claimed import reconciles', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const movieB = makeTMDBMovie({ id: 2, title: 'Movie B' });
    const matches = [
      makeMatchedMovie({ tmdbMovie: movieA as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: movieB as any, status: 'matched' }),
    ];

    mockAddMovieToLibrary
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }))
      .mockResolvedValueOnce(makeUserMovie({ id: 'row-b', tmdb_id: 2 }));

    const reconcileChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }, { tmdb_id: 2 }],
      error: null,
    });
    mockFrom.mockReturnValue(reconcileChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(2);
    expect(result.persistenceFailed).toBe(0);
    expect(matches[0].status).toBe('imported');
    expect(matches[1].status).toBe('imported');
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'letterboxd-import-reconciliation-mismatch',
      expect.anything()
    );
  });

  it('tags every imported row as source "import" (and keeps skipEnrich)', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const matches = [makeMatchedMovie({ tmdbMovie: movieA as any, status: 'matched' })];

    mockAddMovieToLibrary.mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }));
    mockFrom.mockReturnValue(mockSupabaseQuery({ data: [{ tmdb_id: 1 }], error: null }));

    await importMovies(USER_ID, matches);

    expect(mockAddMovieToLibrary).toHaveBeenCalledWith(
      USER_ID,
      movieA,
      'watched',
      { skipEnrich: true, source: 'import' }
    );
  });

  it('does not downgrade claimed imports when the reconciliation read itself errors', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const matches = [makeMatchedMovie({ tmdbMovie: movieA as any, status: 'matched' })];

    mockAddMovieToLibrary.mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }));

    const reconcileChain = mockSupabaseQuery({
      data: null,
      error: { message: 'network blip' },
    });
    mockFrom.mockReturnValue(reconcileChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(1);
    expect(result.persistenceFailed).toBe(0);
    expect(matches[0].status).toBe('imported');
  });

  it('captures a message but keeps the movie counted as imported when the watched_at backfill fails', async () => {
    const movieA = makeTMDBMovie({ id: 1, title: 'Movie A' });
    const matches = [
      makeMatchedMovie({
        tmdbMovie: movieA as any,
        status: 'matched',
        entry: makeEntry({ watchedDate: '2024-03-15' }),
      }),
    ];

    mockAddMovieToLibrary.mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }));

    const watchedAtUpdateChain = mockSupabaseQuery({
      data: null,
      error: { message: 'update failed' },
    });
    const reconcileChain = mockSupabaseQuery({
      data: [{ tmdb_id: 1 }],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(watchedAtUpdateChain) // the watched_at update call
      .mockReturnValueOnce(reconcileChain); // the reconciliation select call

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(1);
    expect(result.persistenceFailed).toBe(0);
    expect(matches[0].status).toBe('imported');
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'letterboxd-import-watched-at-update-failed',
      { tmdbId: 1 }
    );
  });

  it('skips reconciliation entirely when nothing was claimed as imported', async () => {
    const matches = [makeMatchedMovie({ tmdbMovie: null, status: 'unmatched' })];

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(0);
    expect(result.persistenceFailed).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('counts pre-flagged duplicates without re-writing them (#813)', async () => {
    const matches = [
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 1 }) as any, status: 'matched' }),
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 2 }) as any, status: 'duplicate' }),
    ];
    mockAddMovieToLibrary.mockResolvedValueOnce(makeUserMovie({ id: 'row-a', tmdb_id: 1 }));
    mockFrom.mockReturnValue(mockSupabaseQuery({ data: [{ tmdb_id: 1 }], error: null }));

    const result = await importMovies(USER_ID, matches);

    expect(result.imported).toBe(1);
    // The row the user already has is reported as such, not re-upserted and
    // then counted as an import.
    expect(result.duplicates).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(mockAddMovieToLibrary).toHaveBeenCalledTimes(1);
    expect(matches[1].status).toBe('duplicate');
  });

  it("corrects a duplicate's watched_at from the CSV date without re-writing the row", async () => {
    const matches = [
      makeMatchedMovie({
        tmdbMovie: makeTMDBMovie({ id: 7 }) as any,
        status: 'duplicate',
        entry: makeEntry({ watchedDate: '2024-03-15' }),
      }),
    ];
    const watchedAtChain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(watchedAtChain);

    const result = await importMovies(USER_ID, matches);

    expect(result.duplicates).toBe(1);
    expect(result.imported).toBe(0);
    // The date the CSV knows better than the existing row is corrected...
    expect(watchedAtChain.update).toHaveBeenCalledWith({ watched_at: '2024-03-15' });
    expect(watchedAtChain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(watchedAtChain.eq).toHaveBeenCalledWith('tmdb_id', 7);
    // ...on journey 1 only, so a rewatch's journeys 2..n keep their own dates.
    expect(watchedAtChain.eq).toHaveBeenCalledWith('journey_number', 1);
    // ...and nothing else about the row is touched (no re-upsert, so no
    // watch_time clobber).
    expect(mockAddMovieToLibrary).not.toHaveBeenCalled();
    expect(watchedAtChain.upsert).not.toHaveBeenCalled();
  });

  it('writes nothing at all for a duplicate with no CSV date', async () => {
    const matches = [
      makeMatchedMovie({
        tmdbMovie: makeTMDBMovie({ id: 7 }) as any,
        status: 'duplicate',
        entry: makeEntry({ watchedDate: null }),
      }),
    ];

    const result = await importMovies(USER_ID, matches);

    expect(result.duplicates).toBe(1);
    expect(mockAddMovieToLibrary).not.toHaveBeenCalled();
    // No update — and no reconciliation either, since nothing was claimed.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reports a failed write as unmatched — there is no error-string duplicate path left', async () => {
    const matches = [
      makeMatchedMovie({ tmdbMovie: makeTMDBMovie({ id: 1 }) as any, status: 'matched' }),
    ];
    // addMovieToLibrary upserts, so it never throws 'DUPLICATE'; the old catch
    // branch that read it was dead and duplicates are now flagged up front.
    mockAddMovieToLibrary.mockRejectedValueOnce(new Error('DUPLICATE'));

    const result = await importMovies(USER_ID, matches);

    expect(result.duplicates).toBe(0);
    expect(result.unmatched).toBe(1);
    expect(result.imported).toBe(0);
    expect(matches[0].status).toBe('unmatched');
  });
});

// ============================================================================
// exportCollectionCSV
// ============================================================================

describe('exportCollectionCSV', () => {
  it('generates valid CSV with headers and data rows', async () => {
    const movies = [
      makeUserMovie({
        tmdb_id: 550,
        title: 'Fight Club',
        release_date: '1999-10-15',
        watched_at: '2024-03-15T18:30:00Z',
      }),
      makeUserMovie({
        id: 'movie-uuid-2',
        tmdb_id: 603,
        title: 'The Matrix',
        release_date: '1999-03-31',
        watched_at: '2024-02-10T20:00:00Z',
      }),
    ];

    mockFetchUserMovies.mockResolvedValue(movies);

    const firstTakesChain = mockSupabaseQuery({
      data: [
        { tmdb_id: 550, rating: 9, quote_text: 'First rule...' },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(firstTakesChain);

    const csv = await exportCollectionCSV(USER_ID);

    // Verify headers
    expect(csv).toContain('Title');
    expect(csv).toContain('Year');
    expect(csv).toContain('Rating');
    expect(csv).toContain('Watched Date');
    expect(csv).toContain('Review');

    // Verify Fight Club row (has first take)
    expect(csv).toContain('Fight Club');
    expect(csv).toContain('1999');
    expect(csv).toContain('2024-03-15');
    expect(csv).toContain('9');
    expect(csv).toContain('First rule...');

    // Verify The Matrix row (no first take)
    expect(csv).toContain('The Matrix');
    expect(csv).toContain('2024-02-10');

    expect(mockFetchUserMovies).toHaveBeenCalledWith(USER_ID);
    expect(mockFrom).toHaveBeenCalledWith('first_takes');
  });

  it('handles empty collection', async () => {
    mockFetchUserMovies.mockResolvedValue([]);

    const firstTakesChain = mockSupabaseQuery({
      data: [],
      error: null,
    });
    mockFrom.mockReturnValue(firstTakesChain);

    const csv = await exportCollectionCSV(USER_ID);

    // Should have headers but no data rows
    // PapaParse returns empty string for empty data array
    expect(csv).toBe('');
  });
});
