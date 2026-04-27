import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/achievement-context', () => ({
  useAchievementCheck: () => ({ triggerAchievementCheck: jest.fn() }),
}));

jest.mock('@/hooks/use-popcorn-earn', () => ({
  usePopcornEarn: () => ({ earn: jest.fn() }),
}));

jest.mock('@/lib/movie-service', () => ({
  getMovieByTmdbId: jest.fn(),
  addMovieToLibrary: jest.fn(),
  removeMovieFromLibrary: jest.fn(),
  updateMovieStatus: jest.fn(),
  downgradeMovieStatus: jest.fn(),
  getMovieLike: jest.fn(),
  likeMovie: jest.fn(),
  unlikeMovie: jest.fn(),
}));

import { useMovieActions } from '@/hooks/use-movie-actions';
import { useAuth } from '@/hooks/use-auth';
import {
  getMovieByTmdbId,
  addMovieToLibrary,
  removeMovieFromLibrary,
  updateMovieStatus,
  downgradeMovieStatus,
  getMovieLike,
  likeMovie,
  unlikeMovie,
} from '@/lib/movie-service';
import type { UserMovie, UserMovieLike } from '@/lib/database.types';

const mockUseAuth = useAuth as jest.Mock;
const mockGetMovieByTmdbId = getMovieByTmdbId as jest.Mock;
const mockAddMovieToLibrary = addMovieToLibrary as jest.Mock;
const mockRemoveMovieFromLibrary = removeMovieFromLibrary as jest.Mock;
const mockUpdateMovieStatus = updateMovieStatus as jest.Mock;
const mockDowngradeMovieStatus = downgradeMovieStatus as jest.Mock;
const mockGetMovieLike = getMovieLike as jest.Mock;
const mockLikeMovie = likeMovie as jest.Mock;
const mockUnlikeMovie = unlikeMovie as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const USER_ID = 'user-123';
const TMDB_ID = 42;
const USER_MOVIE_KEY = ['userMovie', USER_ID, TMDB_ID];
const USER_LIKE_KEY = ['userMovieLike', USER_ID, TMDB_ID];

function makeUserMovie(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: 'movie-1',
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
    title: 'Fight Club',
    status: 'watchlist',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: 'A movie',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    watched_at: null,
    is_liked: null,
    ticket_id: null,
    ticket_price: null,
    watch_format: null,
    watch_time: null,
    watched_with: null,
    seat_location: null,
    location_name: null,
    location_type: null,
    auditorium: null,
    journey_notes: null,
    journey_tagline: null,
    journey_photos: null,
    journey_number: null,
    journey_created_at: null,
    journey_updated_at: null,
    cover_photo_index: null,
    ai_poster_url: null,
    ai_poster_rarity: null,
    display_poster: null,
    ...overrides,
  } as UserMovie;
}

function makeUserMovieLike(overrides: Partial<UserMovieLike> = {}): UserMovieLike {
  return {
    id: 'like-1',
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
    title: 'Fight Club',
    poster_path: '/poster.jpg',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as UserMovieLike;
}

function makeTMDBMovie(overrides: Record<string, unknown> = {}) {
  return {
    id: TMDB_ID,
    title: 'Fight Club',
    overview: 'A movie',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    vote_count: 25000,
    genre_ids: [18, 53],
    ...overrides,
  };
}

/**
 * Creates a QueryClient and wrapper for renderHook.
 * Returns both so tests can inspect the cache directly.
 */
function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

/** Returns a promise that never resolves — used to prove optimistic updates happen before the server responds. */
function neverResolve(): Promise<never> {
  return new Promise(() => {});
}

// ============================================================================
// Tests
// ============================================================================

describe('useMovieActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
    // Default: queries return null (movie not saved, not liked)
    mockGetMovieByTmdbId.mockResolvedValue(null);
    mockGetMovieLike.mockResolvedValue(null);
  });

  // ==========================================================================
  // changeStatus optimistic update
  // ==========================================================================

  describe('changeStatus optimistic update', () => {
    it.each([
      { from: 'watchlist', to: 'watched' },
      { from: 'watchlist', to: 'watching' },
      { from: 'watching', to: 'watched' },
      { from: 'watched', to: 'watchlist' },
    ] as const)(
      'optimistically updates cache from "$from" to "$to" before server responds',
      async ({ from, to }) => {
        const { queryClient, wrapper } = createTestHarness();
        const existingMovie = makeUserMovie({ status: from });

        // Query function must return the movie so hook's internal userMovie is populated
        mockGetMovieByTmdbId.mockResolvedValue(existingMovie);
        // Server call will never resolve — proving the update is optimistic
        mockUpdateMovieStatus.mockReturnValue(neverResolve());

        const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

        // Wait for the query to populate the hook's userMovie
        await waitFor(() => {
          expect(result.current.currentStatus).toBe(from);
        });

        // Trigger the mutation (don't await — it will never resolve)
        act(() => {
          result.current.changeStatus(to);
        });

        // Cache should already have the new status
        await waitFor(() => {
          const cached = queryClient.getQueryData<UserMovie>(USER_MOVIE_KEY);
          expect(cached?.status).toBe(to);
        });
      }
    );

    it('rolls back to previous status on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingMovie = makeUserMovie({ status: 'watchlist' });

      // Query function must return the movie so hook's internal userMovie is populated
      mockGetMovieByTmdbId.mockResolvedValue(existingMovie);
      mockUpdateMovieStatus.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watchlist');
      });

      // Trigger and let it fail
      await act(async () => {
        try {
          await result.current.changeStatus('watched');
        } catch {
          // expected
        }
      });

      // Cache should have reverted
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovie>(USER_MOVIE_KEY);
        expect(cached?.status).toBe('watchlist');
      });
    });
  });

  // ==========================================================================
  // toggleLike optimistic update
  // ==========================================================================

  describe('toggleLike optimistic update', () => {
    it('optimistically sets cache to a truthy object when liking', async () => {
      const { queryClient, wrapper } = createTestHarness();

      // Seed: no existing like
      queryClient.setQueryData(USER_LIKE_KEY, null);
      mockLikeMovie.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isLiked).toBe(false);
      });

      act(() => {
        result.current.toggleLike(makeTMDBMovie() as any);
      });

      // Cache should flip to a truthy placeholder
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovieLike | null>(USER_LIKE_KEY);
        expect(cached).toBeTruthy();
        expect(cached?.user_id).toBe(USER_ID);
        expect(cached?.tmdb_id).toBe(TMDB_ID);
      });
    });

    it('optimistically sets cache to null when unliking', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingLike = makeUserMovieLike();

      // Query function must return the like so hook's internal userLike is populated
      mockGetMovieLike.mockResolvedValue(existingLike);
      mockUnlikeMovie.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isLiked).toBe(true);
      });

      act(() => {
        result.current.toggleLike(makeTMDBMovie() as any);
      });

      // Cache should flip to null
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovieLike | null>(USER_LIKE_KEY);
        expect(cached).toBeNull();
      });
    });

    it.each([
      {
        scenario: 'like rollback',
        seedLike: null as UserMovieLike | null,
        expectedAfterRollback: null,
        setupMocks: () => {
          mockGetMovieLike.mockResolvedValue(null);
          mockLikeMovie.mockRejectedValue(new Error('Server error'));
        },
      },
      {
        scenario: 'unlike rollback',
        seedLike: makeUserMovieLike() as UserMovieLike | null,
        expectedAfterRollback: expect.objectContaining({ id: 'like-1' }),
        setupMocks: () => {
          mockGetMovieLike.mockResolvedValue(makeUserMovieLike());
          mockUnlikeMovie.mockRejectedValue(new Error('Server error'));
        },
      },
    ])(
      'rolls back on server error ($scenario)',
      async ({ seedLike, expectedAfterRollback, setupMocks }) => {
        const { queryClient, wrapper } = createTestHarness();

        setupMocks();

        const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

        await waitFor(() => {
          expect(result.current.isLiked).toBe(!!seedLike);
        });

        await act(async () => {
          try {
            await result.current.toggleLike(makeTMDBMovie() as any);
          } catch {
            // expected
          }
        });

        // Cache should have reverted to the original value
        await waitFor(() => {
          const cached = queryClient.getQueryData<UserMovieLike | null>(USER_LIKE_KEY);
          if (expectedAfterRollback === null) {
            expect(cached).toBeNull();
          } else {
            expect(cached).toEqual(expectedAfterRollback);
          }
        });
      }
    );
  });

  // ==========================================================================
  // addToWatchlist optimistic update
  // ==========================================================================

  describe('addToWatchlist optimistic update', () => {
    it.each([
      { status: 'watchlist' as const },
      { status: 'watching' as const },
      { status: 'watched' as const },
    ])(
      'optimistically updates cache from null to a UserMovie with status "$status" before server responds',
      async ({ status }) => {
        const { queryClient, wrapper } = createTestHarness();

        // Seed: no existing movie in cache
        queryClient.setQueryData(USER_MOVIE_KEY, null);
        // Server call will never resolve — proving the update is optimistic
        mockAddMovieToLibrary.mockReturnValue(neverResolve());

        const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

        // Wait for hook to settle (no saved movie)
        await waitFor(() => {
          expect(result.current.isSaved).toBe(false);
        });

        const movie = makeTMDBMovie();

        // Trigger the mutation (don't await — it will never resolve)
        act(() => {
          result.current.addToWatchlist(movie as any, status);
        });

        // Cache should already have a truthy UserMovie with correct fields
        await waitFor(() => {
          const cached = queryClient.getQueryData<UserMovie | null>(USER_MOVIE_KEY);
          expect(cached).toBeTruthy();
          expect(cached?.tmdb_id).toBe(TMDB_ID);
          expect(cached?.status).toBe(status);
          expect(cached?.title).toBe('Fight Club');
          expect(cached?.poster_path).toBe('/poster.jpg');
        });
      }
    );

    it('rolls back cache to null on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();

      // Seed: no existing movie in cache
      queryClient.setQueryData(USER_MOVIE_KEY, null);
      mockAddMovieToLibrary.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(false);
      });

      const movie = makeTMDBMovie();

      await act(async () => {
        try {
          await result.current.addToWatchlist(movie as any, 'watchlist');
        } catch {
          // expected
        }
      });

      // Cache should have reverted to null
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovie | null>(USER_MOVIE_KEY);
        expect(cached).toBeNull();
      });
    });
  });

  // ==========================================================================
  // removeFromWatchlist optimistic update
  // ==========================================================================

  describe('removeFromWatchlist optimistic update', () => {
    it('optimistically sets cache to null before server responds', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingMovie = makeUserMovie();

      // Query function must return the movie so hook's internal userMovie is populated
      mockGetMovieByTmdbId.mockResolvedValue(existingMovie);
      // Server call will never resolve — proving the update is optimistic
      mockRemoveMovieFromLibrary.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      // Wait for the query to populate the hook's userMovie
      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      // Trigger the mutation (don't await — it will never resolve)
      act(() => {
        result.current.removeFromWatchlist();
      });

      // Cache should already be null
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovie | null>(USER_MOVIE_KEY);
        expect(cached).toBeNull();
      });
    });

    it('rolls back to original UserMovie on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingMovie = makeUserMovie({ id: 'movie-1', status: 'watchlist' });

      // Query function must return the movie so hook's internal userMovie is populated
      mockGetMovieByTmdbId.mockResolvedValue(existingMovie);
      mockRemoveMovieFromLibrary.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      await act(async () => {
        try {
          await result.current.removeFromWatchlist();
        } catch {
          // expected
        }
      });

      // Cache should have reverted to the original UserMovie
      await waitFor(() => {
        const cached = queryClient.getQueryData<UserMovie | null>(USER_MOVIE_KEY);
        expect(cached).toBeTruthy();
        expect(cached?.id).toBe('movie-1');
        expect(cached?.status).toBe('watchlist');
      });
    });
  });

  // ==========================================================================
  // Watchlist invalidation (cross-screen freshness — SP4-A follow-up)
  // ==========================================================================

  describe('watchlist invalidation', () => {
    it('invalidates watchlist-tmdb-ids when adding to watchlist', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(null);
      mockAddMovieToLibrary.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(false);
      });

      await act(async () => {
        await result.current.addToWatchlist(makeTMDBMovie() as any, 'watchlist');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when removing from watchlist', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));
      mockRemoveMovieFromLibrary.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      await act(async () => {
        await result.current.removeFromWatchlist();
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when changing status', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));
      mockUpdateMovieStatus.mockResolvedValue(makeUserMovie({ status: 'watching' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watchlist');
      });

      await act(async () => {
        await result.current.changeStatus('watching');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when downgrading status', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watched' }));
      mockDowngradeMovieStatus.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watched');
      });

      await act(async () => {
        await result.current.downgradeStatus('watchlist');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });
  });
});
