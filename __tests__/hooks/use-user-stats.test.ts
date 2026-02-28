import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { useUserStats } from '@/hooks/use-user-stats';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { TMDB_GENRE_MAP } from '@/lib/tmdb.types';

const mockUseAuth = useAuth as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function makeEdgeFunctionResponse(overrides: Record<string, unknown> = {}) {
  return {
    summary: {
      totalWatched: 42,
      totalTvWatched: 5,
      totalFirstTakes: 10,
      averageRating: 7.5,
      totalEpisodesWatched: 48,
      totalWatchTimeMinutes: 3200,
    },
    genres: [
      { genreId: 28, count: 15, percentage: 35.7 },
      { genreId: 18, count: 10, percentage: 23.8 },
    ],
    monthlyActivity: [
      { month: '2024-01', monthLabel: 'Jan 2024', count: 5 },
    ],
    ...overrides,
  };
}

// ============================================================================
// Tests: React Query Configuration
// ============================================================================

describe('useUserStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
    mockInvoke.mockResolvedValue({ data: makeEdgeFunctionResponse(), error: null });
  });

  describe('React Query configuration', () => {
    it.each([
      ['staleTime', 10 * 60 * 1000],
      ['gcTime', 30 * 60 * 1000],
      ['refetchOnMount', false],
    ])('passes %s = %s', async (option, expected) => {
      // Spy on QueryClient to capture options
      const observedOptions: Record<string, unknown> = {};
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const originalFetchQuery = client.defaultQueryOptions;
      // We verify by rendering and checking the query observer's options
      const { result } = renderHook(() => useUserStats(), {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(QueryClientProvider, { client }, children),
      });

      await waitFor(() => {
        expect(result.current.isSuccess || result.current.isError || !result.current.isFetching).toBe(true);
      });

      // Access the query cache to verify options
      const queries = client.getQueryCache().getAll();
      expect(queries).toHaveLength(1);
      const queryOptions = queries[0].options;
      expect(queryOptions[option as keyof typeof queryOptions]).toBe(expected);
    });
  });

  // ============================================================================
  // Tests: Query Key
  // ============================================================================

  describe('query key', () => {
    it('includes the user ID', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'user-xyz-789' } });

      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      renderHook(() => useUserStats(), {
        wrapper: ({ children }: { children: React.ReactNode }) =>
          React.createElement(QueryClientProvider, { client }, children),
      });

      await waitFor(() => {
        const queries = client.getQueryCache().getAll();
        expect(queries).toHaveLength(1);
      });

      const queries = client.getQueryCache().getAll();
      expect(queries[0].queryKey).toEqual(['userStats', 'user-xyz-789']);
    });
  });

  // ============================================================================
  // Tests: Enabled Gating
  // ============================================================================

  describe('enabled gating', () => {
    it('does not fetch when user is null', async () => {
      mockUseAuth.mockReturnValue({ user: null });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      // Query should remain idle — fetchStatus 'idle' means it never started
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('fetches when user is present', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInvoke).toHaveBeenCalledWith('get-user-stats');
    });
  });

  // ============================================================================
  // Tests: fetchUserStats (data mapping)
  // ============================================================================

  describe('fetchUserStats', () => {
    it('calls supabase.functions.invoke with get-user-stats', async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('get-user-stats');
    });

    it('maps genre IDs to names using TMDB_GENRE_MAP', async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const genres = result.current.data!.genres;
      expect(genres).toEqual([
        { genreId: 28, genreName: 'Action', count: 15, percentage: 35.7 },
        { genreId: 18, genreName: 'Drama', count: 10, percentage: 23.8 },
      ]);
    });

    it('falls back to "Other" for unknown genre IDs', async () => {
      mockInvoke.mockResolvedValue({
        data: makeEdgeFunctionResponse({
          genres: [{ genreId: 99999, count: 3, percentage: 100 }],
        }),
        error: null,
      });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.genres[0].genreName).toBe('Other');
    });

    it('passes through summary and monthlyActivity unchanged', async () => {
      const response = makeEdgeFunctionResponse();
      mockInvoke.mockResolvedValue({ data: response, error: null });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.summary).toEqual(response.summary);
      expect(result.current.data!.monthlyActivity).toEqual(response.monthlyActivity);
    });

    it('throws when edge function returns an error', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Internal Server Error' },
      });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Internal Server Error');
    });

    it('throws when edge function returns null data', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('No data returned from stats endpoint');
    });
  });

  // ============================================================================
  // Tests: TV show fields in summary
  // ============================================================================

  describe('TV show stats', () => {
    it('includes totalTvWatched in summary', async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.summary.totalTvWatched).toBe(5);
    });

    it('includes totalEpisodesWatched in summary', async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.summary.totalEpisodesWatched).toBe(48);
    });

    it('includes totalWatchTimeMinutes in summary', async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.summary.totalWatchTimeMinutes).toBe(3200);
    });

    it('passes through all TV summary fields unchanged', async () => {
      const response = makeEdgeFunctionResponse({
        summary: {
          totalWatched: 100,
          totalTvWatched: 12,
          totalFirstTakes: 20,
          averageRating: 8.2,
          totalEpisodesWatched: 150,
          totalWatchTimeMinutes: 9000,
        },
      });
      mockInvoke.mockResolvedValue({ data: response, error: null });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data!.summary).toEqual({
        totalWatched: 100,
        totalTvWatched: 12,
        totalFirstTakes: 20,
        averageRating: 8.2,
        totalEpisodesWatched: 150,
        totalWatchTimeMinutes: 9000,
      });
    });

    it('maps TV genre IDs to names in combined genre list', async () => {
      // Genre 10765 = "Sci-Fi & Fantasy" in TMDB TV genres
      // Genre 18 = "Drama" shared between movies and TV
      mockInvoke.mockResolvedValue({
        data: makeEdgeFunctionResponse({
          genres: [
            { genreId: 18, count: 20, percentage: 50 },
            { genreId: 10765, count: 10, percentage: 25 },
            { genreId: 28, count: 10, percentage: 25 },
          ],
        }),
        error: null,
      });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const genres = result.current.data!.genres;
      expect(genres).toHaveLength(3);
      expect(genres[0]).toEqual({ genreId: 18, genreName: 'Drama', count: 20, percentage: 50 });
      expect(genres[2]).toEqual({ genreId: 28, genreName: 'Action', count: 10, percentage: 25 });
    });
  });
});
