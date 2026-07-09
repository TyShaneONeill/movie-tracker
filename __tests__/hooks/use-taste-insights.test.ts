import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(() => ({ user: { id: 'user-123' } })),
}));

const mockUsePremium = jest.fn();
jest.mock('@/hooks/use-premium', () => ({
  usePremium: () => mockUsePremium(),
}));

import { useTasteInsights } from '@/hooks/use-taste-insights';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;

/** Wires `user_movies` + `taste_profile_cache` selects to fixed responses,
 *  mirroring the chained-eq mocking style in use-generate-art.test.ts. */
function mockMoviesAndCache(movies: Record<string, unknown>[], cacheRow: Record<string, unknown> | null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_movies') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: movies, error: null }),
          }),
        }),
      };
    }
    if (table === 'taste_profile_cache') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: cacheRow, error: null }),
          }),
        }),
      };
    }
    return { select: jest.fn() };
  });
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

const SIX_MOVIES = Array.from({ length: 6 }, (_, i) => ({
  tmdb_id: i + 1,
  genre_ids: [18],
  release_date: '2015-01-01',
}));

// ============================================================================
// Tests
// ============================================================================

describe('useTasteInsights — premium gating (PS-22 review P1-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { success: true, summary: 'x' }, error: null });
  });

  it('never auto-regenerates for a free user, even when the profile is stale (no cache row)', async () => {
    mockUsePremium.mockReturnValue({ isPremium: false });
    mockMoviesAndCache(SIX_MOVIES, null); // null cache -> stale per computeStaleness

    const { wrapper } = createTestHarness();
    const { result } = renderHook(() => useTasteInsights(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.stale).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('manual regenerate() no-ops for a free user (does not call the edge function)', async () => {
    mockUsePremium.mockReturnValue({ isPremium: false });
    mockMoviesAndCache(SIX_MOVIES, null);

    const { wrapper } = createTestHarness();
    const { result } = renderHook(() => useTasteInsights(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    act(() => {
      result.current.regenerate();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('auto-regenerates exactly once for a premium user when the profile is stale', async () => {
    mockUsePremium.mockReturnValue({ isPremium: true });
    mockMoviesAndCache(SIX_MOVIES, null);

    const { wrapper } = createTestHarness();
    const { result } = renderHook(() => useTasteInsights(), { wrapper });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith('generate-taste-summary', expect.any(Object));
  });

  it('does not auto-regenerate for a premium user when the cache is fresh', async () => {
    mockUsePremium.mockReturnValue({ isPremium: true });
    // logs_count_at_generation matches watchedCount (delta 0) -> not stale
    mockMoviesAndCache(SIX_MOVIES, {
      summary: 'You gravitate toward drama.',
      aggregates: { topDirectors: [], topStudio: null },
      logs_count_at_generation: SIX_MOVIES.length,
      generated_at: '2026-07-01T00:00:00.000Z',
    });

    const { wrapper } = createTestHarness();
    const { result } = renderHook(() => useTasteInsights(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.stale).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('manual regenerate() calls the edge function for a premium user', async () => {
    mockUsePremium.mockReturnValue({ isPremium: true });
    mockMoviesAndCache(SIX_MOVIES, {
      summary: 'You gravitate toward drama.',
      aggregates: { topDirectors: [], topStudio: null },
      logs_count_at_generation: SIX_MOVIES.length, // fresh, so no auto-trigger
      generated_at: '2026-07-01T00:00:00.000Z',
    });

    const { wrapper } = createTestHarness();
    const { result } = renderHook(() => useTasteInsights(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockInvoke).not.toHaveBeenCalled(); // sanity: no auto-trigger fired yet

    await act(async () => {
      result.current.regenerate();
    });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  });
});
