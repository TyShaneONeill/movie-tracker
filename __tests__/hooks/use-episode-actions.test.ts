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
  getWatchedEpisodes: jest.fn(),
  markEpisodeWatched: jest.fn(),
  unmarkEpisodeWatched: jest.fn(),
  markSeasonWatched: jest.fn(),
}));

import { useEpisodeActions } from '@/hooks/use-episode-actions';
import { useAuth } from '@/hooks/use-auth';
import {
  getWatchedEpisodes,
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
} from '@/lib/tv-show-service';
import type { UserEpisodeWatch } from '@/lib/database.types';
import type { TMDBEpisode } from '@/lib/tmdb.types';

const mockUseAuth = useAuth as jest.Mock;
const mockGetWatchedEpisodes = getWatchedEpisodes as jest.Mock;
const mockMarkEpisodeWatched = markEpisodeWatched as jest.Mock;
const mockUnmarkEpisodeWatched = unmarkEpisodeWatched as jest.Mock;
const mockMarkSeasonWatched = markSeasonWatched as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const USER_ID = 'user-123';
const USER_TV_SHOW_ID = 'utv-456';
const TMDB_SHOW_ID = 1399;
const SEASON_NUMBER = 1;
const EPISODE_WATCHES_KEY = ['episodeWatches', USER_ID, USER_TV_SHOW_ID, SEASON_NUMBER];
const USER_TV_SHOW_KEY = ['userTvShow', USER_ID];

function makeEpisode(overrides: Partial<TMDBEpisode> = {}): TMDBEpisode {
  return {
    id: 101,
    episode_number: 1,
    season_number: SEASON_NUMBER,
    name: 'Winter Is Coming',
    overview: 'The first episode',
    air_date: '2011-04-17',
    runtime: 62,
    still_path: '/still1.jpg',
    vote_average: 8.1,
    vote_count: 500,
    guest_stars: [],
    ...overrides,
  };
}

function makeEpisodeWatch(overrides: Partial<UserEpisodeWatch> = {}): UserEpisodeWatch {
  return {
    id: 'ew-1',
    user_id: USER_ID,
    user_tv_show_id: USER_TV_SHOW_ID,
    tmdb_show_id: TMDB_SHOW_ID,
    season_number: SEASON_NUMBER,
    episode_number: 1,
    episode_name: 'Winter Is Coming',
    episode_runtime: 62,
    still_path: '/still1.jpg',
    watched_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    notes: null,
    watch_number: null,
    ...overrides,
  } as UserEpisodeWatch;
}

/**
 * Renders the hook with a fresh QueryClient and waits for loading to complete.
 * Returns the render result plus the queryClient for cache inspection.
 */
async function renderEpisodeActions(args?: {
  userTvShowId?: string;
  tmdbShowId?: number;
  seasonNumber?: number;
}) {
  const {
    userTvShowId = USER_TV_SHOW_ID,
    tmdbShowId = TMDB_SHOW_ID,
    seasonNumber = SEASON_NUMBER,
  } = args ?? {};

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const rendered = renderHook(
    () => useEpisodeActions(userTvShowId, tmdbShowId, seasonNumber),
    { wrapper }
  );

  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });

  return { ...rendered, queryClient };
}

/**
 * Renders the hook without waiting for load (for disabled-query tests).
 */
function renderEpisodeActionsNoWait(args?: {
  userTvShowId?: string;
  tmdbShowId?: number;
  seasonNumber?: number;
}) {
  const {
    userTvShowId = USER_TV_SHOW_ID,
    tmdbShowId = TMDB_SHOW_ID,
    seasonNumber = SEASON_NUMBER,
  } = args ?? {};

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const rendered = renderHook(
    () => useEpisodeActions(userTvShowId, tmdbShowId, seasonNumber),
    { wrapper }
  );

  return { ...rendered, queryClient };
}

// ============================================================================
// Tests
// ============================================================================

describe('useEpisodeActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
    mockGetWatchedEpisodes.mockResolvedValue([]);
  });

  // ==========================================================================
  // Initial state
  // ==========================================================================

  describe('initial state', () => {
    it('fetches watched episodes on mount', async () => {
      const watchedList = [makeEpisodeWatch({ episode_number: 1 })];
      mockGetWatchedEpisodes.mockResolvedValue(watchedList);

      const { result } = await renderEpisodeActions();

      expect(result.current.watchedEpisodes).toEqual(watchedList);
      expect(mockGetWatchedEpisodes).toHaveBeenCalledWith(
        USER_ID,
        USER_TV_SHOW_ID,
        SEASON_NUMBER
      );
    });

    it('returns empty array when no episodes are watched', async () => {
      const { result } = await renderEpisodeActions();
      expect(result.current.watchedEpisodes).toEqual([]);
    });
  });

  // ==========================================================================
  // isEpisodeWatched
  // ==========================================================================

  describe('isEpisodeWatched', () => {
    it.each([
      { episodeNum: 3, expected: true, label: 'watched' },
      { episodeNum: 5, expected: false, label: 'unwatched' },
    ])('returns $expected for $label episode number $episodeNum', async ({ episodeNum, expected }) => {
      mockGetWatchedEpisodes.mockResolvedValue([
        makeEpisodeWatch({ episode_number: 3 }),
      ]);

      const { result } = await renderEpisodeActions();
      expect(result.current.isEpisodeWatched(episodeNum)).toBe(expected);
    });
  });

  // ==========================================================================
  // Mutation calls with correct arguments
  // ==========================================================================

  describe('mutation calls', () => {
    it('markWatched calls markEpisodeWatched with correct arguments', async () => {
      const episode = makeEpisode({ episode_number: 2 });
      mockMarkEpisodeWatched.mockResolvedValue(makeEpisodeWatch({ episode_number: 2 }));

      const { result } = await renderEpisodeActions();

      await act(async () => {
        await result.current.markWatched(episode);
      });

      expect(mockMarkEpisodeWatched).toHaveBeenCalledWith(
        USER_ID, USER_TV_SHOW_ID, TMDB_SHOW_ID, episode
      );
    });

    it('unmarkWatched calls unmarkEpisodeWatched with correct arguments', async () => {
      mockUnmarkEpisodeWatched.mockResolvedValue(undefined);

      const { result } = await renderEpisodeActions();

      await act(async () => {
        await result.current.unmarkWatched(3);
      });

      expect(mockUnmarkEpisodeWatched).toHaveBeenCalledWith(
        USER_ID, USER_TV_SHOW_ID, SEASON_NUMBER, 3
      );
    });

    it('markAllWatched calls markSeasonWatched with all episodes', async () => {
      const episodes = [
        makeEpisode({ episode_number: 1 }),
        makeEpisode({ episode_number: 2, id: 102, name: 'The Kingsroad' }),
        makeEpisode({ episode_number: 3, id: 103, name: 'Lord Snow' }),
      ];
      mockMarkSeasonWatched.mockResolvedValue(undefined);

      const { result } = await renderEpisodeActions();

      await act(async () => {
        await result.current.markAllWatched(episodes);
      });

      expect(mockMarkSeasonWatched).toHaveBeenCalledWith(
        USER_ID, USER_TV_SHOW_ID, TMDB_SHOW_ID, episodes
      );
    });
  });

  // ==========================================================================
  // Query invalidation (parameterized across all mutations)
  // ==========================================================================

  describe('query invalidation', () => {
    it.each([
      {
        label: 'markWatched',
        setup: () => mockMarkEpisodeWatched.mockResolvedValue(makeEpisodeWatch()),
        trigger: (result: any) => result.current.markWatched(makeEpisode()),
      },
      {
        label: 'unmarkWatched',
        setup: () => mockUnmarkEpisodeWatched.mockResolvedValue(undefined),
        trigger: (result: any) => result.current.unmarkWatched(1),
      },
      {
        label: 'markAllWatched',
        setup: () => mockMarkSeasonWatched.mockResolvedValue(undefined),
        trigger: (result: any) => result.current.markAllWatched([makeEpisode()]),
      },
    ])(
      'invalidates episodeWatches and userTvShow queries after $label',
      async ({ setup, trigger }) => {
        setup();

        const { result, queryClient } = await renderEpisodeActions();
        const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

        await act(async () => {
          await trigger(result);
        });

        expect(invalidateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: EPISODE_WATCHES_KEY })
        );
        expect(invalidateSpy).toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: USER_TV_SHOW_KEY })
        );
      }
    );
  });

  // ==========================================================================
  // Error propagation (parameterized across all mutations)
  // ==========================================================================

  describe('error propagation', () => {
    it.each([
      {
        label: 'markWatched',
        setup: () => mockMarkEpisodeWatched.mockRejectedValue(new Error('Network error')),
        trigger: (result: any) => result.current.markWatched(makeEpisode()),
        expectedMsg: 'Network error',
      },
      {
        label: 'unmarkWatched',
        setup: () => mockUnmarkEpisodeWatched.mockRejectedValue(new Error('Server error')),
        trigger: (result: any) => result.current.unmarkWatched(1),
        expectedMsg: 'Server error',
      },
      {
        label: 'markAllWatched',
        setup: () => mockMarkSeasonWatched.mockRejectedValue(new Error('Batch insert failed')),
        trigger: (result: any) => result.current.markAllWatched([makeEpisode()]),
        expectedMsg: 'Batch insert failed',
      },
    ])(
      'propagates error from $label',
      async ({ setup, trigger, expectedMsg }) => {
        setup();

        const { result } = await renderEpisodeActions();

        await expect(
          act(async () => {
            await trigger(result);
          })
        ).rejects.toThrow(expectedMsg);
      }
    );
  });

  // ==========================================================================
  // Disabled state (parameterized)
  // ==========================================================================

  describe('disabled state', () => {
    it.each([
      {
        label: 'user is null',
        authOverride: { user: null },
        hookArgs: {},
      },
      {
        label: 'userTvShowId is empty',
        authOverride: undefined,
        hookArgs: { userTvShowId: '' },
      },
    ])('does not fetch when $label', async ({ authOverride, hookArgs }) => {
      if (authOverride) {
        mockUseAuth.mockReturnValue(authOverride);
      }

      renderEpisodeActionsNoWait(hookArgs);

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetWatchedEpisodes).not.toHaveBeenCalled();
    });
  });
});
