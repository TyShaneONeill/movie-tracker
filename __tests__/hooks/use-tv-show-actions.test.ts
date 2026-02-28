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

jest.mock('@/lib/tv-show-service', () => ({
  getTvShowByTmdbId: jest.fn(),
  addTvShowToLibrary: jest.fn(),
  removeTvShowFromLibrary: jest.fn(),
  updateTvShowStatus: jest.fn(),
  getTvShowLike: jest.fn(),
  likeTvShow: jest.fn(),
  unlikeTvShow: jest.fn(),
}));

import { useTvShowActions } from '@/hooks/use-tv-show-actions';
import { useAuth } from '@/hooks/use-auth';
import {
  getTvShowByTmdbId,
  addTvShowToLibrary,
  removeTvShowFromLibrary,
  updateTvShowStatus,
  getTvShowLike,
  likeTvShow,
  unlikeTvShow,
} from '@/lib/tv-show-service';
import type { UserTvShow, UserTvShowLike } from '@/lib/database.types';

const mockUseAuth = useAuth as jest.Mock;
const mockGetTvShowByTmdbId = getTvShowByTmdbId as jest.Mock;
const mockAddTvShowToLibrary = addTvShowToLibrary as jest.Mock;
const mockRemoveTvShowFromLibrary = removeTvShowFromLibrary as jest.Mock;
const mockUpdateTvShowStatus = updateTvShowStatus as jest.Mock;
const mockGetTvShowLike = getTvShowLike as jest.Mock;
const mockLikeTvShow = likeTvShow as jest.Mock;
const mockUnlikeTvShow = unlikeTvShow as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const USER_ID = 'user-123';
const TMDB_ID = 1399;
const USER_TV_SHOW_KEY = ['userTvShow', USER_ID, TMDB_ID];
const USER_TV_SHOW_LIKE_KEY = ['userTvShowLike', USER_ID, TMDB_ID];

function makeUserTvShow(overrides: Partial<UserTvShow> = {}): UserTvShow {
  return {
    id: 'tv-show-1',
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
    name: 'Breaking Bad',
    status: 'watchlist',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: 'A chemistry teacher diagnosed with cancer.',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    genre_ids: [18, 80],
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    current_season: null,
    current_episode: null,
    episodes_watched: null,
    number_of_seasons: null,
    number_of_episodes: null,
    started_watching_at: null,
    finished_at: null,
    is_liked: null,
    user_rating: null,
    ...overrides,
  } as UserTvShow;
}

function makeUserTvShowLike(overrides: Partial<UserTvShowLike> = {}): UserTvShowLike {
  return {
    id: 'like-1',
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
    name: 'Breaking Bad',
    poster_path: '/poster.jpg',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as UserTvShowLike;
}

function makeTMDBTvShow(overrides: Record<string, unknown> = {}) {
  return {
    id: TMDB_ID,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher diagnosed with cancer.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    vote_count: 12000,
    genre_ids: [18, 80],
    origin_country: ['US'],
    original_language: 'en',
    popularity: 100.0,
    ...overrides,
  };
}

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

/** Returns a promise that never resolves -- used to prove optimistic updates happen before the server responds. */
function neverResolve(): Promise<never> {
  return new Promise(() => {});
}

// ============================================================================
// Tests
// ============================================================================

describe('useTvShowActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
    // Default: queries return null (show not saved, not liked)
    mockGetTvShowByTmdbId.mockResolvedValue(null);
    mockGetTvShowLike.mockResolvedValue(null);
  });

  // ==========================================================================
  // changeStatus optimistic update
  // ==========================================================================

  describe('changeStatus optimistic update', () => {
    it.each([
      { from: 'watchlist', to: 'watching' },
      { from: 'watchlist', to: 'watched' },
      { from: 'watching', to: 'watched' },
      { from: 'watched', to: 'watchlist' },
      { from: 'watching', to: 'dropped' },
      { from: 'watching', to: 'on_hold' },
    ] as const)(
      'optimistically updates cache from "$from" to "$to" before server responds',
      async ({ from, to }) => {
        const { queryClient, wrapper } = createTestHarness();
        const existingShow = makeUserTvShow({ status: from });

        mockGetTvShowByTmdbId.mockResolvedValue(existingShow);
        mockUpdateTvShowStatus.mockReturnValue(neverResolve());

        const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

        await waitFor(() => {
          expect(result.current.currentStatus).toBe(from);
        });

        act(() => {
          result.current.changeStatus(to);
        });

        await waitFor(() => {
          const cached = queryClient.getQueryData<UserTvShow>(USER_TV_SHOW_KEY);
          expect(cached?.status).toBe(to);
        });
      }
    );

    it('rolls back to previous status on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingShow = makeUserTvShow({ status: 'watchlist' });

      mockGetTvShowByTmdbId.mockResolvedValue(existingShow);
      mockUpdateTvShowStatus.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watchlist');
      });

      await act(async () => {
        try {
          await result.current.changeStatus('watched');
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShow>(USER_TV_SHOW_KEY);
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

      queryClient.setQueryData(USER_TV_SHOW_LIKE_KEY, null);
      mockLikeTvShow.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isLiked).toBe(false);
      });

      act(() => {
        result.current.toggleLike(makeTMDBTvShow() as any);
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShowLike | null>(USER_TV_SHOW_LIKE_KEY);
        expect(cached).toBeTruthy();
        expect(cached?.user_id).toBe(USER_ID);
        expect(cached?.tmdb_id).toBe(TMDB_ID);
      });
    });

    it('optimistically sets cache to null when unliking', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingLike = makeUserTvShowLike();

      mockGetTvShowLike.mockResolvedValue(existingLike);
      mockUnlikeTvShow.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isLiked).toBe(true);
      });

      act(() => {
        result.current.toggleLike(makeTMDBTvShow() as any);
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShowLike | null>(USER_TV_SHOW_LIKE_KEY);
        expect(cached).toBeNull();
      });
    });

    it.each([
      {
        scenario: 'like rollback',
        seedLike: null as UserTvShowLike | null,
        expectedAfterRollback: null,
        setupMocks: () => {
          mockGetTvShowLike.mockResolvedValue(null);
          mockLikeTvShow.mockRejectedValue(new Error('Server error'));
        },
      },
      {
        scenario: 'unlike rollback',
        seedLike: makeUserTvShowLike() as UserTvShowLike | null,
        expectedAfterRollback: expect.objectContaining({ id: 'like-1' }),
        setupMocks: () => {
          mockGetTvShowLike.mockResolvedValue(makeUserTvShowLike());
          mockUnlikeTvShow.mockRejectedValue(new Error('Server error'));
        },
      },
    ])(
      'rolls back on server error ($scenario)',
      async ({ seedLike, expectedAfterRollback, setupMocks }) => {
        const { queryClient, wrapper } = createTestHarness();

        setupMocks();

        const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

        await waitFor(() => {
          expect(result.current.isLiked).toBe(!!seedLike);
        });

        await act(async () => {
          try {
            await result.current.toggleLike(makeTMDBTvShow() as any);
          } catch {
            // expected
          }
        });

        await waitFor(() => {
          const cached = queryClient.getQueryData<UserTvShowLike | null>(USER_TV_SHOW_LIKE_KEY);
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
  // addToLibrary optimistic update
  // ==========================================================================

  describe('addToLibrary optimistic update', () => {
    it.each([
      { status: 'watchlist' as const },
      { status: 'watching' as const },
      { status: 'watched' as const },
    ])(
      'optimistically updates cache from null to a UserTvShow with status "$status" before server responds',
      async ({ status }) => {
        const { queryClient, wrapper } = createTestHarness();

        queryClient.setQueryData(USER_TV_SHOW_KEY, null);
        mockAddTvShowToLibrary.mockReturnValue(neverResolve());

        const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

        await waitFor(() => {
          expect(result.current.isSaved).toBe(false);
        });

        const show = makeTMDBTvShow();

        act(() => {
          result.current.addToLibrary(show as any, status);
        });

        await waitFor(() => {
          const cached = queryClient.getQueryData<UserTvShow | null>(USER_TV_SHOW_KEY);
          expect(cached).toBeTruthy();
          expect(cached?.tmdb_id).toBe(TMDB_ID);
          expect(cached?.status).toBe(status);
          expect(cached?.name).toBe('Breaking Bad');
          expect(cached?.poster_path).toBe('/poster.jpg');
        });
      }
    );

    it('rolls back cache to null on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();

      queryClient.setQueryData(USER_TV_SHOW_KEY, null);
      mockAddTvShowToLibrary.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(false);
      });

      const show = makeTMDBTvShow();

      await act(async () => {
        try {
          await result.current.addToLibrary(show as any, 'watchlist');
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShow | null>(USER_TV_SHOW_KEY);
        expect(cached).toBeNull();
      });
    });
  });

  // ==========================================================================
  // removeFromLibrary optimistic update
  // ==========================================================================

  describe('removeFromLibrary optimistic update', () => {
    it('optimistically sets cache to null before server responds', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingShow = makeUserTvShow();

      mockGetTvShowByTmdbId.mockResolvedValue(existingShow);
      mockRemoveTvShowFromLibrary.mockReturnValue(neverResolve());

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      act(() => {
        result.current.removeFromLibrary();
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShow | null>(USER_TV_SHOW_KEY);
        expect(cached).toBeNull();
      });
    });

    it('rolls back to original UserTvShow on server error', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const existingShow = makeUserTvShow({ id: 'tv-show-1', status: 'watchlist' });

      mockGetTvShowByTmdbId.mockResolvedValue(existingShow);
      mockRemoveTvShowFromLibrary.mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTvShowActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      await act(async () => {
        try {
          await result.current.removeFromLibrary();
        } catch {
          // expected
        }
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<UserTvShow | null>(USER_TV_SHOW_KEY);
        expect(cached).toBeTruthy();
        expect(cached?.id).toBe('tv-show-1');
        expect(cached?.status).toBe('watchlist');
      });
    });
  });
});
