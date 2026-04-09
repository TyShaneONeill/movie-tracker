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
  exportCollectionCSV,
  detectLetterboxdCSVType,
} from '@/lib/letterboxd-service';
import type { LetterboxdEntry } from '@/lib/letterboxd-service';
import { searchMovies, fetchUserMovies } from '@/lib/movie-service';
import { supabase } from '@/lib/supabase';
import type { UserMovie } from '@/lib/database.types';

const mockSearchMovies = searchMovies as jest.Mock;
const mockFetchUserMovies = fetchUserMovies as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

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
