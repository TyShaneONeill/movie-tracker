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

jest.mock('@/lib/movie-cache-service', () => ({
  getMovieDetailsWithCache: jest.fn(),
}));

import {
  searchMovies,
  discoverMoviesByGenre,
  getMovieList,
  getMovieDetails,
  fetchUserMovies,
  addMovieToLibrary,
  updateMovieStatus,
  removeMovieFromLibrary,
  getMovieByTmdbId,
  getMovieLike,
  likeMovie,
  unlikeMovie,
  fetchJourneyById,
  updateJourney,
  deleteJourney,
  fetchJourneysByTmdbId,
  getPersonDetails,
  createNewJourney,
} from '@/lib/movie-service';
import { supabase } from '@/lib/supabase';
import { getMovieDetailsWithCache } from '@/lib/movie-cache-service';
import type { UserMovie } from '@/lib/database.types';
import type { MovieDetailResponse } from '@/lib/tmdb.types';

// Get references to the mock functions from the mocked module
const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

const USER_ID = 'user-abc-123';
const MOVIE_ID = 'movie-uuid-1';

function makeUserMovie(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: MOVIE_ID,
    user_id: USER_ID,
    tmdb_id: 550,
    title: 'Fight Club',
    overview: 'A ticking-Loss-of-identity tale.',
    poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg',
    backdrop_path: '/87hTDiay2N2qWyX4Ds7ybXi9h8I.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
    status: 'watchlist',
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_liked: null,
    journey_number: null,
    journey_notes: null,
    journey_tagline: null,
    journey_photos: null,
    journey_created_at: null,
    journey_updated_at: null,
    watched_at: null,
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
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// ----------------------------------------------------------------------------
// Edge Function wrappers (functions.invoke pattern)
// ----------------------------------------------------------------------------

describe('searchMovies', () => {
  const movies = [makeTMDBMovie(), makeTMDBMovie({ id: 551, title: 'Inception' })];
  const response = { movies, page: 1, totalPages: 5, totalResults: 100 };

  it('returns search results on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await searchMovies('fight', 1, 'title');

    expect(mockInvoke).toHaveBeenCalledWith('search-movies', {
      body: { query: 'fight', page: 1, searchType: 'title' },
    });
    expect(result).toEqual(response);
  });

  it('uses default page=1 and searchType=title', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    await searchMovies('fight');

    expect(mockInvoke).toHaveBeenCalledWith('search-movies', {
      body: { query: 'fight', page: 1, searchType: 'title' },
    });
  });

  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Network fail' } });

    await expect(searchMovies('fight')).rejects.toThrow('Network fail');
  });

  it('throws when error has no message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });

    await expect(searchMovies('fight')).rejects.toThrow('Failed to search movies');
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(searchMovies('fight')).rejects.toThrow('No data returned from search');
  });
});

describe('discoverMoviesByGenre', () => {
  const response = { movies: [makeTMDBMovie()], page: 1, totalPages: 3, totalResults: 60 };

  it('returns discover results on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await discoverMoviesByGenre(28, 2);

    expect(mockInvoke).toHaveBeenCalledWith('discover-movies', {
      body: { genreId: 28, page: 2 },
    });
    expect(result).toEqual(response);
  });

  it('defaults page to 1', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    await discoverMoviesByGenre(28);

    expect(mockInvoke).toHaveBeenCalledWith('discover-movies', {
      body: { genreId: 28, page: 1 },
    });
  });

  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Timeout' } });

    await expect(discoverMoviesByGenre(28)).rejects.toThrow('Timeout');
  });

  it('throws fallback message when error has no message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });

    await expect(discoverMoviesByGenre(28)).rejects.toThrow('Failed to discover movies');
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(discoverMoviesByGenre(28)).rejects.toThrow('No data returned from discover');
  });
});

describe('getMovieList', () => {
  const response = { movies: [makeTMDBMovie()], page: 1, totalPages: 1, totalResults: 1 };

  it('returns movie list on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await getMovieList('trending', 2);

    expect(mockInvoke).toHaveBeenCalledWith('get-movie-lists', {
      body: { type: 'trending', page: 2 },
    });
    expect(result).toEqual(response);
  });

  it('defaults page to 1', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    await getMovieList('now_playing');

    expect(mockInvoke).toHaveBeenCalledWith('get-movie-lists', {
      body: { type: 'now_playing', page: 1 },
    });
  });

  it('throws with type in error message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });

    await expect(getMovieList('upcoming')).rejects.toThrow('Failed to fetch upcoming movies');
  });

  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Server error' } });

    await expect(getMovieList('trending')).rejects.toThrow('Server error');
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(getMovieList('trending')).rejects.toThrow('No data returned from movie list');
  });
});

describe('getMovieDetails', () => {
  const movieDetail: MovieDetailResponse = {
    movie: {
      id: 550,
      title: 'Fight Club',
      overview: 'A tale',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      release_date: '1999-10-15',
      vote_average: 8.4,
      vote_count: 25000,
      genre_ids: [18],
      runtime: 139,
      genres: [{ id: 18, name: 'Drama' }],
      tagline: 'Mischief. Mayhem. Soap.',
    },
    cast: [],
    crew: [],
    trailer: null,
    watchProviders: {},
  };

  it('delegates to getMovieDetailsWithCache and returns data', async () => {
    (getMovieDetailsWithCache as jest.Mock).mockResolvedValue({ data: movieDetail });

    const result = await getMovieDetails(550);

    expect(getMovieDetailsWithCache).toHaveBeenCalledWith(550, expect.any(Function));
    expect(result).toEqual(movieDetail);
  });
});

describe('getPersonDetails', () => {
  const personResponse = {
    person: { id: 1, name: 'Actor', biography: 'bio' },
    movieCredits: [],
    crewCredits: [],
  };

  it('returns person details on success', async () => {
    mockInvoke.mockResolvedValue({ data: personResponse, error: null });

    const result = await getPersonDetails(1);

    expect(mockInvoke).toHaveBeenCalledWith('get-person-details', {
      body: { personId: 1 },
    });
    expect(result).toEqual(personResponse);
  });

  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    await expect(getPersonDetails(1)).rejects.toThrow('Not found');
  });

  it('throws fallback message when error has no message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });

    await expect(getPersonDetails(1)).rejects.toThrow('Failed to fetch person details');
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(getPersonDetails(1)).rejects.toThrow('No data returned from person details');
  });
});

// ----------------------------------------------------------------------------
// Database operations (supabase.from() pattern)
// ----------------------------------------------------------------------------

describe('fetchUserMovies', () => {
  it('returns user movies ordered by added_at desc', async () => {
    const movies = [makeUserMovie()];
    const chain = mockSupabaseQuery({ data: movies, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchUserMovies(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.order).toHaveBeenCalledWith('added_at', { ascending: false });
    expect(result).toEqual(movies);
  });

  it('filters by status when provided', async () => {
    const chain = mockSupabaseQuery({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await fetchUserMovies(USER_ID, 'watched');

    // eq is called twice: once for user_id, once for status
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('status', 'watched');
  });

  it('returns empty array when data is null', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchUserMovies(USER_ID);

    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(chain);

    await expect(fetchUserMovies(USER_ID)).rejects.toThrow('DB error');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(fetchUserMovies(USER_ID)).rejects.toThrow('Failed to fetch movies');
  });
});

describe('addMovieToLibrary', () => {
  const movie = makeTMDBMovie();
  const inserted = makeUserMovie({ status: 'watchlist' });

  it('inserts and returns the new user movie', async () => {
    const chain = mockSupabaseQuery({ data: inserted, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await addMovieToLibrary(USER_ID, movie as any);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tmdb_id: movie.id,
        status: 'watchlist',
        title: movie.title,
      })
    );
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(inserted);
  });

  it('defaults status to watchlist', async () => {
    const chain = mockSupabaseQuery({ data: inserted, error: null });
    mockFrom.mockReturnValue(chain);

    await addMovieToLibrary(USER_ID, movie as any);

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'watchlist' })
    );
  });

  it('passes custom status', async () => {
    const chain = mockSupabaseQuery({ data: inserted, error: null });
    mockFrom.mockReturnValue(chain);

    await addMovieToLibrary(USER_ID, movie as any, 'watched');

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'watched' })
    );
  });

  it('throws DUPLICATE on unique constraint violation (23505)', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { code: '23505', message: 'duplicate key' } });
    mockFrom.mockReturnValue(chain);

    await expect(addMovieToLibrary(USER_ID, movie as any)).rejects.toThrow('DUPLICATE');
  });

  it('throws error message for other errors', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Insert failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(addMovieToLibrary(USER_ID, movie as any)).rejects.toThrow('Insert failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { code: 'OTHER' } });
    mockFrom.mockReturnValue(chain);

    await expect(addMovieToLibrary(USER_ID, movie as any)).rejects.toThrow('Failed to add movie');
  });
});

describe('updateMovieStatus', () => {
  const updated = makeUserMovie({ status: 'watched' });

  it('updates status and returns updated movie', async () => {
    const chain = mockSupabaseQuery({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await updateMovieStatus(MOVIE_ID, 'watched');

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.update).toHaveBeenCalledWith({ status: 'watched' });
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Update failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(updateMovieStatus(MOVIE_ID, 'watched')).rejects.toThrow('Update failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(updateMovieStatus(MOVIE_ID, 'watched')).rejects.toThrow('Failed to update movie');
  });
});

describe('removeMovieFromLibrary', () => {
  it('deletes the movie by id', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await removeMovieFromLibrary(MOVIE_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Delete failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(removeMovieFromLibrary(MOVIE_ID)).rejects.toThrow('Delete failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(removeMovieFromLibrary(MOVIE_ID)).rejects.toThrow('Failed to remove movie');
  });
});

describe('getMovieByTmdbId', () => {
  it('returns user movie when found', async () => {
    const movie = makeUserMovie();
    const chain = mockSupabaseQuery({ data: movie, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMovieByTmdbId(USER_ID, 550);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', 550);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(movie);
  });

  it('returns null when movie not found', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMovieByTmdbId(USER_ID, 999);

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Query failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(getMovieByTmdbId(USER_ID, 550)).rejects.toThrow('Query failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(getMovieByTmdbId(USER_ID, 550)).rejects.toThrow('Failed to check movie');
  });
});

describe('getMovieLike', () => {
  it('returns like record when found', async () => {
    const like = { id: 'like-1', user_id: USER_ID, tmdb_id: 550, title: 'Fight Club', poster_path: '/poster.jpg', created_at: '2024-01-01' };
    const chain = mockSupabaseQuery({ data: like, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMovieLike(USER_ID, 550);

    expect(mockFrom).toHaveBeenCalledWith('user_movie_likes');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', 550);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(like);
  });

  it('returns null when not liked', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMovieLike(USER_ID, 999);

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(getMovieLike(USER_ID, 550)).rejects.toThrow('Failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(getMovieLike(USER_ID, 550)).rejects.toThrow('Failed to check like status');
  });
});

describe('likeMovie', () => {
  const movie = makeTMDBMovie();
  const likeRecord = { id: 'like-1', user_id: USER_ID, tmdb_id: 550, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg', created_at: '2024-01-01' };

  it('inserts a like and returns the record', async () => {
    const chain = mockSupabaseQuery({ data: likeRecord, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await likeMovie(USER_ID, movie as any);

    expect(mockFrom).toHaveBeenCalledWith('user_movie_likes');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tmdb_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
      })
    );
    expect(result).toEqual(likeRecord);
  });

  it('throws ALREADY_LIKED on duplicate (23505)', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { code: '23505', message: 'duplicate' } });
    mockFrom.mockReturnValue(chain);

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('ALREADY_LIKED');
  });

  it('throws error message for other errors', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Insert error' } });
    mockFrom.mockReturnValue(chain);

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('Insert error');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { code: 'OTHER' } });
    mockFrom.mockReturnValue(chain);

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('Failed to like movie');
  });
});

describe('unlikeMovie', () => {
  it('deletes the like by user_id and tmdb_id', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await unlikeMovie(USER_ID, 550);

    expect(mockFrom).toHaveBeenCalledWith('user_movie_likes');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', 550);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Unlike failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(unlikeMovie(USER_ID, 550)).rejects.toThrow('Unlike failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(unlikeMovie(USER_ID, 550)).rejects.toThrow('Failed to unlike movie');
  });
});

// ----------------------------------------------------------------------------
// Journey operations
// ----------------------------------------------------------------------------

describe('fetchJourneyById', () => {
  it('returns the journey when found', async () => {
    const journey = makeUserMovie({ status: 'watched' });
    const chain = mockSupabaseQuery({ data: journey, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchJourneyById(MOVIE_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(journey);
  });

  it('returns null when journey not found', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchJourneyById('nonexistent');

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Fetch failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(fetchJourneyById(MOVIE_ID)).rejects.toThrow('Fetch failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(fetchJourneyById(MOVIE_ID)).rejects.toThrow('Failed to fetch journey');
  });
});

describe('updateJourney', () => {
  const journeyData = { journey_notes: 'Great movie!', watched_at: '2024-06-15' };

  it('updates journey with journey_updated_at and returns updated record', async () => {
    const updated = makeUserMovie({ journey_notes: 'Great movie!', watched_at: '2024-06-15' });
    const chain = mockSupabaseQuery({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await updateJourney(MOVIE_ID, journeyData);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        journey_notes: 'Great movie!',
        watched_at: '2024-06-15',
        journey_updated_at: expect.any(String),
      })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Update error' } });
    mockFrom.mockReturnValue(chain);

    await expect(updateJourney(MOVIE_ID, journeyData)).rejects.toThrow('Update error');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(updateJourney(MOVIE_ID, journeyData)).rejects.toThrow('Failed to update journey');
  });
});

describe('deleteJourney', () => {
  it('deletes the journey by id', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await deleteJourney(MOVIE_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Delete error' } });
    mockFrom.mockReturnValue(chain);

    await expect(deleteJourney(MOVIE_ID)).rejects.toThrow('Delete error');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(deleteJourney(MOVIE_ID)).rejects.toThrow('Failed to delete journey');
  });
});

describe('fetchJourneysByTmdbId', () => {
  it('returns journeys filtered by user_id, tmdb_id, and status=watched', async () => {
    const journeys = [
      makeUserMovie({ status: 'watched', journey_number: 1 }),
      makeUserMovie({ id: 'movie-uuid-2', status: 'watched', journey_number: 2 }),
    ];
    const chain = mockSupabaseQuery({ data: journeys, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchJourneysByTmdbId(USER_ID, 550);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', 550);
    expect(chain.eq).toHaveBeenCalledWith('status', 'watched');
    expect(chain.order).toHaveBeenCalledWith('journey_number', { ascending: true });
    expect(result).toEqual(journeys);
  });

  it('returns empty array when data is null', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchJourneysByTmdbId(USER_ID, 999);

    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({ data: null, error: { message: 'Fetch failed' } });
    mockFrom.mockReturnValue(chain);

    await expect(fetchJourneysByTmdbId(USER_ID, 550)).rejects.toThrow('Fetch failed');
  });

  it('throws fallback message when error has no message', async () => {
    const chain = mockSupabaseQuery({ data: null, error: {} });
    mockFrom.mockReturnValue(chain);

    await expect(fetchJourneysByTmdbId(USER_ID, 550)).rejects.toThrow('Failed to fetch journeys');
  });
});

describe('createNewJourney', () => {
  const existingJourney = makeUserMovie({
    status: 'watched',
    journey_number: 1,
  });

  it('creates a new journey with incremented journey_number', async () => {
    // First call: fetchJourneysByTmdbId (the internal call)
    const existingJourneys = [
      makeUserMovie({ journey_number: 1 }),
      makeUserMovie({ id: 'movie-uuid-2', journey_number: 2 }),
    ];
    const fetchChain = mockSupabaseQuery({ data: existingJourneys, error: null });

    // Second call: insert
    const newJourney = makeUserMovie({ id: 'movie-uuid-3', journey_number: 3, status: 'watched' });
    const insertChain = mockSupabaseQuery({ data: newJourney, error: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)   // fetchJourneysByTmdbId
      .mockReturnValueOnce(insertChain); // insert

    const result = await createNewJourney(USER_ID, existingJourney);

    // Verify the insert had journey_number = 3 (max of existing 1,2 + 1)
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tmdb_id: existingJourney.tmdb_id,
        status: 'watched',
        journey_number: 3,
        journey_created_at: expect.any(String),
      })
    );
    expect(result).toEqual(newJourney);
  });

  it('throws on insert error', async () => {
    const fetchChain = mockSupabaseQuery({ data: [], error: null });
    const insertChain = mockSupabaseQuery({ data: null, error: { message: 'Insert failed' } });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain);

    await expect(createNewJourney(USER_ID, existingJourney)).rejects.toThrow('Insert failed');
  });

  it('throws fallback message when insert error has no message', async () => {
    const fetchChain = mockSupabaseQuery({ data: [], error: null });
    const insertChain = mockSupabaseQuery({ data: null, error: {} });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain);

    await expect(createNewJourney(USER_ID, existingJourney)).rejects.toThrow('Failed to create new journey');
  });

  it('starts journey_number at 1 when no existing journeys', async () => {
    const fetchChain = mockSupabaseQuery({ data: [], error: null });
    const newJourney = makeUserMovie({ id: 'movie-uuid-3', journey_number: 1 });
    const insertChain = mockSupabaseQuery({ data: newJourney, error: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain);

    await createNewJourney(USER_ID, existingJourney);

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ journey_number: 1 })
    );
  });
});
