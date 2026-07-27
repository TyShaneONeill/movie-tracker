import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  getAiredEpisodeCount: jest.fn(),
}));

import { useShowCaughtUp } from '@/hooks/use-show-caught-up';
import { getAiredEpisodeCount } from '@/lib/tv-show-service';

const mockGetAiredEpisodeCount = getAiredEpisodeCount as jest.Mock;

const TMDB_SHOW_ID = 12345;

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper };
}

// ============================================================================
// Tests
// ============================================================================

describe('useShowCaughtUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when a Returning Series has watched every aired episode', async () => {
    mockGetAiredEpisodeCount.mockResolvedValue(40);
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: 'Returning Series',
          episodesWatched: 40,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when a Returning Series still has unwatched aired episodes', async () => {
    mockGetAiredEpisodeCount.mockResolvedValue(40);
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: 'Returning Series',
          episodesWatched: 38,
        }),
      { wrapper }
    );

    await waitFor(() => expect(mockGetAiredEpisodeCount).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('returns false for an Ended show even when fully watched (Watched pill applies instead)', async () => {
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: 'Ended',
          episodesWatched: 40,
        }),
      { wrapper }
    );

    expect(result.current).toBe(false);
    expect(mockGetAiredEpisodeCount).not.toHaveBeenCalled();
  });

  it('returns false for a Canceled show', async () => {
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: 'Canceled',
          episodesWatched: 40,
        }),
      { wrapper }
    );

    expect(result.current).toBe(false);
    expect(mockGetAiredEpisodeCount).not.toHaveBeenCalled();
  });

  it('returns false when currentStatus is not "watching" (e.g. watchlist)', async () => {
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watchlist',
          tmdbStatus: 'Returning Series',
          episodesWatched: 0,
        }),
      { wrapper }
    );

    expect(result.current).toBe(false);
    expect(mockGetAiredEpisodeCount).not.toHaveBeenCalled();
  });

  it('returns false when the aired-episode catalog has no data yet (count 0)', async () => {
    mockGetAiredEpisodeCount.mockResolvedValue(0);
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: 'Returning Series',
          episodesWatched: 5,
        }),
      { wrapper }
    );

    await waitFor(() => expect(mockGetAiredEpisodeCount).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('returns false when tmdbStatus is not yet known (null)', () => {
    const { wrapper } = createTestHarness();

    const { result } = renderHook(
      () =>
        useShowCaughtUp({
          tmdbShowId: TMDB_SHOW_ID,
          currentStatus: 'watching',
          tmdbStatus: null,
          episodesWatched: 5,
        }),
      { wrapper }
    );

    expect(result.current).toBe(false);
    expect(mockGetAiredEpisodeCount).not.toHaveBeenCalled();
  });
});
