import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/tv-show-service', () => ({
  fetchUserTvShows: jest.fn(),
  addTvShowToLibrary: jest.fn(),
  updateTvShowStatus: jest.fn(),
  removeTvShowFromLibrary: jest.fn(),
  getTvShowByTmdbId: jest.fn(),
}));

import { useUserTvShows } from '@/hooks/use-user-tv-shows';
import { useAuth } from '@/hooks/use-auth';
import { fetchUserTvShows } from '@/lib/tv-show-service';
import type { UserTvShow } from '@/lib/database.types';

const mockUseAuth = useAuth as jest.Mock;
const mockFetchUserTvShows = fetchUserTvShows as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const USER_ID = 'user-123';

function makeUserTvShow(overrides: Partial<UserTvShow> = {}): UserTvShow {
  return {
    id: 'tv-show-1',
    user_id: USER_ID,
    tmdb_id: 1399,
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

describe('useUserTvShows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
  });

  // ==========================================================================
  // Fetches user's TV shows
  // ==========================================================================

  describe('fetching shows', () => {
    it('fetches all user TV shows when no status filter is provided', async () => {
      const { wrapper } = createTestHarness();
      const shows = [
        makeUserTvShow({ id: 'tv-1', tmdb_id: 1399, name: 'Breaking Bad', status: 'watchlist' }),
        makeUserTvShow({ id: 'tv-2', tmdb_id: 62560, name: 'Better Call Saul', status: 'watching' }),
        makeUserTvShow({ id: 'tv-3', tmdb_id: 66732, name: 'Stranger Things', status: 'watched' }),
      ];
      mockFetchUserTvShows.mockResolvedValue(shows);

      const { result } = renderHook(() => useUserTvShows(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shows).toEqual(shows);
      expect(result.current.shows).toHaveLength(3);
      expect(result.current.isError).toBe(false);
      expect(mockFetchUserTvShows).toHaveBeenCalledWith(USER_ID, undefined);
    });

    it('fetches user TV shows filtered by status', async () => {
      const { wrapper } = createTestHarness();
      const watchingShows = [
        makeUserTvShow({ id: 'tv-2', tmdb_id: 62560, name: 'Better Call Saul', status: 'watching' }),
      ];
      mockFetchUserTvShows.mockResolvedValue(watchingShows);

      const { result } = renderHook(() => useUserTvShows('watching'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shows).toEqual(watchingShows);
      expect(result.current.shows).toHaveLength(1);
      expect(mockFetchUserTvShows).toHaveBeenCalledWith(USER_ID, 'watching');
    });

    it('returns empty array when user has no TV shows', async () => {
      const { wrapper } = createTestHarness();
      mockFetchUserTvShows.mockResolvedValue([]);

      const { result } = renderHook(() => useUserTvShows(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shows).toEqual([]);
      expect(result.current.shows).toHaveLength(0);
    });

    it('returns empty array when no shows match the status filter', async () => {
      const { wrapper } = createTestHarness();
      mockFetchUserTvShows.mockResolvedValue([]);

      const { result } = renderHook(() => useUserTvShows('dropped'), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shows).toEqual([]);
      expect(mockFetchUserTvShows).toHaveBeenCalledWith(USER_ID, 'dropped');
    });
  });

  // ==========================================================================
  // Query disabled without user
  // ==========================================================================

  describe('unauthenticated state', () => {
    it('does not fetch when user is null', () => {
      const { wrapper } = createTestHarness();
      mockUseAuth.mockReturnValue({ user: null });

      const { result } = renderHook(() => useUserTvShows(), { wrapper });

      expect(result.current.shows).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(mockFetchUserTvShows).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('sets isError and error when fetch fails', async () => {
      const { wrapper } = createTestHarness();
      mockFetchUserTvShows.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useUserTvShows(), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.shows).toEqual([]);
    });
  });

  // ==========================================================================
  // Default return values
  // ==========================================================================

  describe('default values while loading', () => {
    it('returns defaults while loading', () => {
      const { wrapper } = createTestHarness();
      mockFetchUserTvShows.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useUserTvShows(), { wrapper });

      expect(result.current.shows).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isError).toBe(false);
      expect(result.current.isAdding).toBe(false);
      expect(result.current.isUpdating).toBe(false);
      expect(result.current.isRemoving).toBe(false);
    });
  });
});
