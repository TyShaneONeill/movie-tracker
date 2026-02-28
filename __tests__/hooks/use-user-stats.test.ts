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

function createClientAndWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
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

/** Renders the hook with default wrapper and waits for success. */
async function renderAndSettle() {
  const { result } = renderHook(() => useUserStats(), {
    wrapper: createWrapper(),
  });

  await waitFor(() => {
    expect(result.current.isSuccess).toBe(true);
  });

  return result;
}

/** Renders the hook with overridden mock data and waits for success. */
async function renderWithResponse(overrides: Record<string, unknown>) {
  mockInvoke.mockResolvedValue({
    data: makeEdgeFunctionResponse(overrides),
    error: null,
  });
  return renderAndSettle();
}

// ============================================================================
// Tests
// ============================================================================

describe('useUserStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
    mockInvoke.mockResolvedValue({ data: makeEdgeFunctionResponse(), error: null });
  });

  // ============================================================================
  // React Query Configuration
  // ============================================================================

  describe('React Query configuration', () => {
    it.each([
      ['staleTime', 10 * 60 * 1000],
      ['gcTime', 30 * 60 * 1000],
      ['refetchOnMount', false],
    ])('passes %s = %s', async (option, expected) => {
      const { client, wrapper } = createClientAndWrapper();

      const { result } = renderHook(() => useUserStats(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess || result.current.isError || !result.current.isFetching).toBe(true);
      });

      const queries = client.getQueryCache().getAll();
      expect(queries).toHaveLength(1);
      expect(queries[0].options[option as keyof typeof queries[0]['options']]).toBe(expected);
    });
  });

  // ============================================================================
  // Query Key
  // ============================================================================

  describe('query key', () => {
    it('includes the user ID', async () => {
      mockUseAuth.mockReturnValue({ user: { id: 'user-xyz-789' } });
      const { client, wrapper } = createClientAndWrapper();

      renderHook(() => useUserStats(), { wrapper });

      await waitFor(() => {
        const queries = client.getQueryCache().getAll();
        expect(queries).toHaveLength(1);
      });

      expect(client.getQueryCache().getAll()[0].queryKey).toEqual(['userStats', 'user-xyz-789']);
    });
  });

  // ============================================================================
  // Enabled Gating
  // ============================================================================

  describe('enabled gating', () => {
    it('does not fetch when user is null', async () => {
      mockUseAuth.mockReturnValue({ user: null });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('fetches when user is present', async () => {
      await renderAndSettle();
      expect(mockInvoke).toHaveBeenCalledWith('get-user-stats');
    });
  });

  // ============================================================================
  // Data Mapping
  // ============================================================================

  describe('fetchUserStats', () => {
    it('calls supabase.functions.invoke with get-user-stats', async () => {
      await renderAndSettle();

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith('get-user-stats');
    });

    it('maps genre IDs to names using TMDB_GENRE_MAP', async () => {
      const result = await renderAndSettle();

      expect(result.current.data!.genres).toEqual([
        { genreId: 28, genreName: 'Action', count: 15, percentage: 35.7 },
        { genreId: 18, genreName: 'Drama', count: 10, percentage: 23.8 },
      ]);
    });

    it('falls back to "Other" for unknown genre IDs', async () => {
      const result = await renderWithResponse({
        genres: [{ genreId: 99999, count: 3, percentage: 100 }],
      });

      expect(result.current.data!.genres[0].genreName).toBe('Other');
    });

    it('passes through summary and monthlyActivity unchanged', async () => {
      const response = makeEdgeFunctionResponse();
      const result = await renderAndSettle();

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
  // TV Show Stats
  // ============================================================================

  describe('TV show stats', () => {
    it.each([
      ['totalTvWatched', 5],
      ['totalEpisodesWatched', 48],
      ['totalWatchTimeMinutes', 3200],
    ] as const)('includes %s = %s in summary', async (field, expected) => {
      const result = await renderAndSettle();
      expect(result.current.data!.summary[field]).toBe(expected);
    });

    it('passes through custom TV summary fields unchanged', async () => {
      const customSummary = {
        totalWatched: 100,
        totalTvWatched: 12,
        totalFirstTakes: 20,
        averageRating: 8.2,
        totalEpisodesWatched: 150,
        totalWatchTimeMinutes: 9000,
      };

      const result = await renderWithResponse({ summary: customSummary });
      expect(result.current.data!.summary).toEqual(customSummary);
    });

    it('maps TV genre IDs to names in combined genre list', async () => {
      const result = await renderWithResponse({
        genres: [
          { genreId: 18, count: 20, percentage: 50 },
          { genreId: 10765, count: 10, percentage: 25 },
          { genreId: 28, count: 10, percentage: 25 },
        ],
      });

      const genres = result.current.data!.genres;
      expect(genres).toHaveLength(3);
      expect(genres[0]).toEqual({ genreId: 18, genreName: 'Drama', count: 20, percentage: 50 });
      expect(genres[2]).toEqual({ genreId: 28, genreName: 'Action', count: 10, percentage: 25 });
    });
  });
});
