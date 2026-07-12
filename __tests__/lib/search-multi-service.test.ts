import { makeTMDBMovie } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

// The graceful fallback fans out to these two dedicated services.
jest.mock('@/lib/movie-service', () => ({
  searchMovies: jest.fn(),
}));
jest.mock('@/lib/tv-show-service', () => ({
  searchTvShows: jest.fn(),
}));

import { searchMulti } from '@/lib/search-multi-service';
import { supabase } from '@/lib/supabase';
import { searchMovies } from '@/lib/movie-service';
import { searchTvShows } from '@/lib/tv-show-service';
import type { TMDBTvShow } from '@/lib/tmdb.types';

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockSearchMovies = searchMovies as jest.Mock;
const mockSearchTvShows = searchTvShows as jest.Mock;

function makeTvShow(overrides: Partial<TMDBTvShow> = {}): TMDBTvShow {
  return {
    id: 100,
    name: 'The Bear',
    overview: 'A chef runs a sandwich shop.',
    poster_path: '/tv.jpg',
    backdrop_path: '/tvbd.jpg',
    first_air_date: '2022-06-23',
    vote_average: 8.5,
    vote_count: 5000,
    genre_ids: [35, 18],
    origin_country: ['US'],
    original_language: 'en',
    popularity: 200,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchMulti', () => {
  const movies = [makeTMDBMovie(), makeTMDBMovie({ id: 551, title: 'Inception' })];
  const tvShows = [makeTvShow()];
  const consolidated = {
    movies,
    tvShows,
    movieTotal: 42,
    tvTotal: 7,
    page: 1,
  };

  it('returns the consolidated edge-fn response and does NOT fan out', async () => {
    mockInvoke.mockResolvedValue({ data: consolidated, error: null });

    const result = await searchMulti('dune', 1);

    expect(mockInvoke).toHaveBeenCalledWith('search-multi', {
      body: { query: 'dune', page: 1 },
    });
    expect(result).toEqual(consolidated);
    // No fallback when the consolidated call succeeds.
    expect(mockSearchMovies).not.toHaveBeenCalled();
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('defaults page to 1', async () => {
    mockInvoke.mockResolvedValue({ data: consolidated, error: null });

    await searchMulti('dune');

    expect(mockInvoke).toHaveBeenCalledWith('search-multi', {
      body: { query: 'dune', page: 1 },
    });
  });

  it('falls back to the fan-out when the edge fn errors, assembling the same shape', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Function not found' } });
    mockSearchMovies.mockResolvedValue({ movies, page: 1, totalPages: 3, totalResults: 42 });
    mockSearchTvShows.mockResolvedValue({ shows: tvShows, page: 1, totalPages: 1, totalResults: 7 });

    const result = await searchMulti('dune', 2);

    expect(mockSearchMovies).toHaveBeenCalledWith('dune', 2, 'title');
    expect(mockSearchTvShows).toHaveBeenCalledWith('dune', 2);
    expect(result).toEqual({
      movies,
      tvShows,
      movieTotal: 42,
      tvTotal: 7,
      page: 1,
    });
  });

  it('falls back when the edge fn returns no data (no error)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    mockSearchMovies.mockResolvedValue({ movies, page: 1, totalPages: 3, totalResults: 42 });
    mockSearchTvShows.mockResolvedValue({ shows: tvShows, page: 1, totalPages: 1, totalResults: 7 });

    const result = await searchMulti('dune');

    expect(mockSearchMovies).toHaveBeenCalledWith('dune', 1, 'title');
    expect(mockSearchTvShows).toHaveBeenCalledWith('dune', 1);
    expect(result.movies).toEqual(movies);
    expect(result.tvShows).toEqual(tvShows);
    expect(result.movieTotal).toBe(42);
    expect(result.tvTotal).toBe(7);
  });
});
