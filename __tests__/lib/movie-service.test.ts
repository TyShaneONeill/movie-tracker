import { makeTMDBMovie, mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
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
// Shared Constants & Helpers
// ============================================================================

const USER_ID = 'user-abc-123';
const MOVIE_ID = 'movie-uuid-1';
const TMDB_ID = 550;

function makeUserMovie(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: MOVIE_ID,
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
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

/** Set up mockFrom to return a Supabase query chain with the given result. */
function setupQueryChain(result: { data: unknown; error: unknown }) {
  const chain = mockSupabaseQuery(result);
  mockFrom.mockReturnValue(chain);
  return chain;
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
      id: TMDB_ID,
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

    const result = await getMovieDetails(TMDB_ID);

    expect(getMovieDetailsWithCache).toHaveBeenCalledWith(TMDB_ID, expect.any(Function));
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
    const chain = setupQueryChain({ data: movies, error: null });

    const result = await fetchUserMovies(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.order).toHaveBeenCalledWith('added_at', { ascending: false });
    expect(result).toEqual(movies);
  });

  it('filters by status when provided', async () => {
    const chain = setupQueryChain({ data: [], error: null });

    await fetchUserMovies(USER_ID, 'watched');

    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('status', 'watched');
  });

  it('returns empty array when data is null', async () => {
    setupQueryChain({ data: null, error: null });

    const result = await fetchUserMovies(USER_ID);

    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'DB error' } });

    await expect(fetchUserMovies(USER_ID)).rejects.toThrow('DB error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(fetchUserMovies(USER_ID)).rejects.toThrow('Failed to fetch movies');
  });
});

describe('addMovieToLibrary', () => {
  const movie = makeTMDBMovie();
  const upserted = makeUserMovie({ status: 'watchlist' });

  it('upserts and returns the user movie', async () => {
    const chain = setupQueryChain({ data: upserted, error: null });

    const result = await addMovieToLibrary(USER_ID, movie as any);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tmdb_id: movie.id,
        status: 'watchlist',
        title: movie.title,
      }),
      { onConflict: 'user_id,tmdb_id,journey_number' }
    );
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(upserted);
  });

  it('calls upsert with onConflict for duplicate prevention', async () => {
    const chain = setupQueryChain({ data: upserted, error: null });

    await addMovieToLibrary(USER_ID, movie as any);

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.any(Object),
      { onConflict: 'user_id,tmdb_id,journey_number' }
    );
  });

  it('defaults status to watchlist', async () => {
    const chain = setupQueryChain({ data: upserted, error: null });

    await addMovieToLibrary(USER_ID, movie as any);

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'watchlist' }),
      expect.any(Object)
    );
  });

  it('passes custom status', async () => {
    const chain = setupQueryChain({ data: upserted, error: null });

    await addMovieToLibrary(USER_ID, movie as any, 'watched');

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'watched' }),
      expect.any(Object)
    );
  });

  it('throws error message on failure', async () => {
    setupQueryChain({ data: null, error: { message: 'Insert failed' } });

    await expect(addMovieToLibrary(USER_ID, movie as any)).rejects.toThrow('Insert failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: { code: 'OTHER' } });

    await expect(addMovieToLibrary(USER_ID, movie as any)).rejects.toThrow('Failed to add movie');
  });
});

describe('updateMovieStatus', () => {
  const updated = makeUserMovie({ status: 'watched' });

  it('updates status by user_id and tmdb_id and returns updated movie', async () => {
    const chain = setupQueryChain({ data: updated, error: null });

    const result = await updateMovieStatus(USER_ID, TMDB_ID, 'watched');

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'watched',
        watch_time: expect.stringMatching(/^\d{2}:\d{2}$/),
      })
    );
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it('does not set watch_time for non-watched statuses', async () => {
    const chain = setupQueryChain({ data: updated, error: null });

    await updateMovieStatus(USER_ID, TMDB_ID, 'watching');

    expect(chain.update).toHaveBeenCalledWith({ status: 'watching' });
  });

  it('uses user_id and tmdb_id for lookup (not row id)', async () => {
    const chain = setupQueryChain({ data: updated, error: null });

    await updateMovieStatus(USER_ID, TMDB_ID, 'watching');

    // Verify .eq is called with user_id and tmdb_id
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ['user_id', USER_ID],
        ['tmdb_id', TMDB_ID],
      ])
    );
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Update failed' } });

    await expect(updateMovieStatus(USER_ID, TMDB_ID, 'watched')).rejects.toThrow('Update failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(updateMovieStatus(USER_ID, TMDB_ID, 'watched')).rejects.toThrow('Failed to update movie');
  });
});

describe('removeMovieFromLibrary', () => {
  it('deletes the movie by user_id and tmdb_id', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await removeMovieFromLibrary(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
  });

  it('uses user_id and tmdb_id for lookup (not row id)', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await removeMovieFromLibrary(USER_ID, TMDB_ID);

    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ['user_id', USER_ID],
        ['tmdb_id', TMDB_ID],
      ])
    );
  });

  it('does not throw when no row exists', async () => {
    setupQueryChain({ data: null, error: null });

    await expect(removeMovieFromLibrary(USER_ID, TMDB_ID)).resolves.toBeUndefined();
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Delete failed' } });

    await expect(removeMovieFromLibrary(USER_ID, TMDB_ID)).rejects.toThrow('Delete failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(removeMovieFromLibrary(USER_ID, TMDB_ID)).rejects.toThrow('Failed to remove movie');
  });
});

describe('getMovieByTmdbId', () => {
  it('returns user movie when found', async () => {
    const movie = makeUserMovie();
    const chain = setupQueryChain({ data: movie, error: null });

    const result = await getMovieByTmdbId(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(movie);
  });

  it('returns null when movie not found', async () => {
    setupQueryChain({ data: null, error: null });

    const result = await getMovieByTmdbId(USER_ID, 999);

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Query failed' } });

    await expect(getMovieByTmdbId(USER_ID, TMDB_ID)).rejects.toThrow('Query failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(getMovieByTmdbId(USER_ID, TMDB_ID)).rejects.toThrow('Failed to check movie');
  });
});

describe('getMovieLike', () => {
  it('returns like record when found', async () => {
    const like = { id: 'like-1', user_id: USER_ID, tmdb_id: TMDB_ID, title: 'Fight Club', poster_path: '/poster.jpg', created_at: '2024-01-01' };
    const chain = setupQueryChain({ data: like, error: null });

    const result = await getMovieLike(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movie_likes');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(like);
  });

  it('returns null when not liked', async () => {
    setupQueryChain({ data: null, error: null });

    const result = await getMovieLike(USER_ID, 999);

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Failed' } });

    await expect(getMovieLike(USER_ID, TMDB_ID)).rejects.toThrow('Failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(getMovieLike(USER_ID, TMDB_ID)).rejects.toThrow('Failed to check like status');
  });
});

describe('likeMovie', () => {
  const movie = makeTMDBMovie();
  const likeRecord = { id: 'like-1', user_id: USER_ID, tmdb_id: TMDB_ID, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg', created_at: '2024-01-01' };

  it('inserts a like and returns the record', async () => {
    const chain = setupQueryChain({ data: likeRecord, error: null });

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
    setupQueryChain({ data: null, error: { code: '23505', message: 'duplicate' } });

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('ALREADY_LIKED');
  });

  it('throws error message for other errors', async () => {
    setupQueryChain({ data: null, error: { message: 'Insert error' } });

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('Insert error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: { code: 'OTHER' } });

    await expect(likeMovie(USER_ID, movie as any)).rejects.toThrow('Failed to like movie');
  });
});

describe('unlikeMovie', () => {
  it('deletes the like by user_id and tmdb_id', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await unlikeMovie(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movie_likes');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Unlike failed' } });

    await expect(unlikeMovie(USER_ID, TMDB_ID)).rejects.toThrow('Unlike failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(unlikeMovie(USER_ID, TMDB_ID)).rejects.toThrow('Failed to unlike movie');
  });
});

// ----------------------------------------------------------------------------
// Journey operations
// ----------------------------------------------------------------------------

describe('fetchJourneyById', () => {
  it('returns the journey when found', async () => {
    const journey = makeUserMovie({ status: 'watched' });
    const chain = setupQueryChain({ data: journey, error: null });

    const result = await fetchJourneyById(MOVIE_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(journey);
  });

  it('returns null when journey not found', async () => {
    setupQueryChain({ data: null, error: null });

    const result = await fetchJourneyById('nonexistent');

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Fetch failed' } });

    await expect(fetchJourneyById(MOVIE_ID)).rejects.toThrow('Fetch failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(fetchJourneyById(MOVIE_ID)).rejects.toThrow('Failed to fetch journey');
  });
});

describe('updateJourney', () => {
  const journeyData = { journey_notes: 'Great movie!', watched_at: '2024-06-15' };

  it('updates journey with journey_updated_at and returns updated record', async () => {
    const updated = makeUserMovie({ journey_notes: 'Great movie!', watched_at: '2024-06-15' });
    const chain = setupQueryChain({ data: updated, error: null });

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
    setupQueryChain({ data: null, error: { message: 'Update error' } });

    await expect(updateJourney(MOVIE_ID, journeyData)).rejects.toThrow('Update error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(updateJourney(MOVIE_ID, journeyData)).rejects.toThrow('Failed to update journey');
  });
});

describe('deleteJourney', () => {
  it('deletes the journey by id', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await deleteJourney(MOVIE_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', MOVIE_ID);
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Delete error' } });

    await expect(deleteJourney(MOVIE_ID)).rejects.toThrow('Delete error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(deleteJourney(MOVIE_ID)).rejects.toThrow('Failed to delete journey');
  });
});

describe('fetchJourneysByTmdbId', () => {
  it('returns journeys filtered by user_id, tmdb_id, and status=watched', async () => {
    const journeys = [
      makeUserMovie({ status: 'watched', journey_number: 1 }),
      makeUserMovie({ id: 'movie-uuid-2', status: 'watched', journey_number: 2 }),
    ];
    const chain = setupQueryChain({ data: journeys, error: null });

    const result = await fetchJourneysByTmdbId(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.eq).toHaveBeenCalledWith('status', 'watched');
    expect(chain.order).toHaveBeenCalledWith('journey_number', { ascending: true });
    expect(result).toEqual(journeys);
  });

  it('returns empty array when data is null', async () => {
    setupQueryChain({ data: null, error: null });

    const result = await fetchJourneysByTmdbId(USER_ID, 999);

    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'Fetch failed' } });

    await expect(fetchJourneysByTmdbId(USER_ID, TMDB_ID)).rejects.toThrow('Fetch failed');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });

    await expect(fetchJourneysByTmdbId(USER_ID, TMDB_ID)).rejects.toThrow('Failed to fetch journeys');
  });
});

describe('createNewJourney', () => {
  const mockRpc = supabase.rpc as jest.Mock;
  const existingJourney = makeUserMovie({
    status: 'watched',
    journey_number: 1,
  });

  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('calls RPC with correct parameters and returns the new journey', async () => {
    const newJourney = makeUserMovie({ id: 'movie-uuid-3', journey_number: 3, status: 'watched' });
    mockRpc.mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: newJourney, error: null }),
    });

    const result = await createNewJourney(USER_ID, existingJourney);

    expect(mockRpc).toHaveBeenCalledWith('create_journey_with_next_number', {
      p_user_id: USER_ID,
      p_tmdb_id: existingJourney.tmdb_id,
      p_title: existingJourney.title,
      p_overview: existingJourney.overview ?? null,
      p_poster_path: existingJourney.poster_path ?? null,
      p_backdrop_path: existingJourney.backdrop_path ?? null,
      p_release_date: existingJourney.release_date ?? null,
      p_vote_average: existingJourney.vote_average ?? null,
      p_genre_ids: existingJourney.genre_ids ?? [],
    });
    expect(result).toEqual(newJourney);
  });

  it('throws on RPC error', async () => {
    mockRpc.mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
    });

    await expect(createNewJourney(USER_ID, existingJourney)).rejects.toThrow('Insert failed');
  });

  it('throws fallback message when error has no message', async () => {
    mockRpc.mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: null, error: {} }),
    });

    await expect(createNewJourney(USER_ID, existingJourney)).rejects.toThrow('Failed to create new journey');
  });
});
