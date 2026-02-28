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

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.watchedEpisodes).toEqual(watchedList);
      expect(mockGetWatchedEpisodes).toHaveBeenCalledWith(
        USER_ID,
        USER_TV_SHOW_ID,
        SEASON_NUMBER
      );
    });

    it('returns empty array when no episodes are watched', async () => {
      mockGetWatchedEpisodes.mockResolvedValue([]);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.watchedEpisodes).toEqual([]);
    });
  });

  // ==========================================================================
  // isEpisodeWatched
  // ==========================================================================

  describe('isEpisodeWatched', () => {
    it('returns true for a watched episode number', async () => {
      mockGetWatchedEpisodes.mockResolvedValue([
        makeEpisodeWatch({ episode_number: 3 }),
      ]);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEpisodeWatched(3)).toBe(true);
    });

    it('returns false for an unwatched episode number', async () => {
      mockGetWatchedEpisodes.mockResolvedValue([
        makeEpisodeWatch({ episode_number: 3 }),
      ]);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isEpisodeWatched(5)).toBe(false);
    });
  });

  // ==========================================================================
  // markWatched
  // ==========================================================================

  describe('markWatched', () => {
    it('calls markEpisodeWatched with correct arguments', async () => {
      const episode = makeEpisode({ episode_number: 2 });
      const returnedWatch = makeEpisodeWatch({ episode_number: 2 });
      mockMarkEpisodeWatched.mockResolvedValue(returnedWatch);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markWatched(episode);
      });

      expect(mockMarkEpisodeWatched).toHaveBeenCalledWith(
        USER_ID,
        USER_TV_SHOW_ID,
        TMDB_SHOW_ID,
        episode
      );
    });

    it('invalidates episodeWatches query on success', async () => {
      const episode = makeEpisode();
      mockMarkEpisodeWatched.mockResolvedValue(makeEpisodeWatch());

      const { queryClient, wrapper } = createTestHarness();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markWatched(episode);
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['episodeWatches', USER_ID, USER_TV_SHOW_ID, SEASON_NUMBER],
        })
      );
    });

    it('propagates error when markEpisodeWatched fails', async () => {
      const episode = makeEpisode();
      mockMarkEpisodeWatched.mockRejectedValue(new Error('Network error'));

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.markWatched(episode);
        })
      ).rejects.toThrow('Network error');
    });
  });

  // ==========================================================================
  // unmarkWatched
  // ==========================================================================

  describe('unmarkWatched', () => {
    it('calls unmarkEpisodeWatched with correct arguments', async () => {
      mockUnmarkEpisodeWatched.mockResolvedValue(undefined);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.unmarkWatched(3);
      });

      expect(mockUnmarkEpisodeWatched).toHaveBeenCalledWith(
        USER_ID,
        USER_TV_SHOW_ID,
        SEASON_NUMBER,
        3
      );
    });

    it('invalidates episodeWatches query on success', async () => {
      mockUnmarkEpisodeWatched.mockResolvedValue(undefined);

      const { queryClient, wrapper } = createTestHarness();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.unmarkWatched(1);
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['episodeWatches', USER_ID, USER_TV_SHOW_ID, SEASON_NUMBER],
        })
      );
    });

    it('propagates error when unmarkEpisodeWatched fails', async () => {
      mockUnmarkEpisodeWatched.mockRejectedValue(new Error('Server error'));

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.unmarkWatched(1);
        })
      ).rejects.toThrow('Server error');
    });
  });

  // ==========================================================================
  // markAllWatched (mark entire season)
  // ==========================================================================

  describe('markAllWatched', () => {
    it('calls markSeasonWatched with all episodes', async () => {
      const episodes = [
        makeEpisode({ episode_number: 1 }),
        makeEpisode({ episode_number: 2, id: 102, name: 'The Kingsroad' }),
        makeEpisode({ episode_number: 3, id: 103, name: 'Lord Snow' }),
      ];
      mockMarkSeasonWatched.mockResolvedValue(undefined);

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markAllWatched(episodes);
      });

      expect(mockMarkSeasonWatched).toHaveBeenCalledWith(
        USER_ID,
        USER_TV_SHOW_ID,
        TMDB_SHOW_ID,
        episodes
      );
    });

    it('invalidates episodeWatches query on success', async () => {
      const episodes = [makeEpisode()];
      mockMarkSeasonWatched.mockResolvedValue(undefined);

      const { queryClient, wrapper } = createTestHarness();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markAllWatched(episodes);
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['episodeWatches', USER_ID, USER_TV_SHOW_ID, SEASON_NUMBER],
        })
      );
    });

    it('propagates error when markSeasonWatched fails', async () => {
      const episodes = [makeEpisode()];
      mockMarkSeasonWatched.mockRejectedValue(new Error('Batch insert failed'));

      const { wrapper } = createTestHarness();
      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.markAllWatched(episodes);
        })
      ).rejects.toThrow('Batch insert failed');
    });
  });

  // ==========================================================================
  // Query invalidation covers userTvShow
  // ==========================================================================

  describe('query invalidation', () => {
    it('invalidates userTvShow query after marking an episode watched', async () => {
      mockMarkEpisodeWatched.mockResolvedValue(makeEpisodeWatch());

      const { queryClient, wrapper } = createTestHarness();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.markWatched(makeEpisode());
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['userTvShow', USER_ID],
        })
      );
    });
  });

  // ==========================================================================
  // Disabled when no user
  // ==========================================================================

  describe('disabled state', () => {
    it('does not fetch when user is null', async () => {
      mockUseAuth.mockReturnValue({ user: null });

      const { wrapper } = createTestHarness();
      renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      // Give it time to potentially fire
      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetWatchedEpisodes).not.toHaveBeenCalled();
    });

    it('does not fetch when userTvShowId is empty', async () => {
      const { wrapper } = createTestHarness();
      renderHook(
        () => useEpisodeActions('', TMDB_SHOW_ID, SEASON_NUMBER),
        { wrapper }
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetWatchedEpisodes).not.toHaveBeenCalled();
    });
  });
});
