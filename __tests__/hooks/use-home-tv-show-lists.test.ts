import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  getTvShowList: jest.fn(),
}));

import { useHomeTvShowLists } from '@/hooks/use-home-tv-show-lists';
import { getTvShowList } from '@/lib/tv-show-service';
import type { TMDBTvShow, TvShowListResponse } from '@/lib/tmdb.types';

const mockGetTvShowList = getTvShowList as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

function makeTvShow(overrides: Partial<TMDBTvShow> = {}): TMDBTvShow {
  return {
    id: 1,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher turned meth maker.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2008-01-20',
    vote_average: 9.5,
    vote_count: 10000,
    genre_ids: [18, 80],
    origin_country: ['US'],
    original_language: 'en',
    popularity: 100,
    ...overrides,
  };
}

function makeListResponse(
  overrides: Partial<TvShowListResponse> = {}
): TvShowListResponse {
  return {
    shows: [makeTvShow()],
    page: 1,
    totalPages: 1,
    totalResults: 1,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('useHomeTvShowLists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns trending and airing today shows', async () => {
    const trendingShow = makeTvShow({ id: 1, name: 'Trending Show' });
    const airingShow = makeTvShow({ id: 2, name: 'Airing Today Show' });

    mockGetTvShowList.mockImplementation((type: string) => {
      if (type === 'trending') {
        return Promise.resolve(makeListResponse({ shows: [trendingShow] }));
      }
      if (type === 'airing_today') {
        return Promise.resolve(makeListResponse({ shows: [airingShow] }));
      }
      return Promise.resolve(makeListResponse({ shows: [] }));
    });

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.trendingShows).toEqual([trendingShow]);
    expect(result.current.airingTodayShows).toEqual([airingShow]);
  });

  it('deduplicates shows across sections with airing today priority', async () => {
    const sharedShow = makeTvShow({ id: 1, name: 'Shared Show' });
    const trendingOnly = makeTvShow({ id: 2, name: 'Trending Only' });

    mockGetTvShowList.mockImplementation((type: string) => {
      if (type === 'trending') {
        return Promise.resolve(
          makeListResponse({ shows: [sharedShow, trendingOnly] })
        );
      }
      if (type === 'airing_today') {
        return Promise.resolve(makeListResponse({ shows: [sharedShow] }));
      }
      return Promise.resolve(makeListResponse({ shows: [] }));
    });

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Shared show appears in airing today (priority)
    expect(result.current.airingTodayShows).toEqual([sharedShow]);
    // Trending should NOT contain the shared show
    expect(result.current.trendingShows).toEqual([trendingOnly]);
  });

  it('deduplicates within airing today itself', async () => {
    const show = makeTvShow({ id: 1 });

    mockGetTvShowList.mockImplementation((type: string) => {
      if (type === 'trending') {
        return Promise.resolve(makeListResponse({ shows: [] }));
      }
      if (type === 'airing_today') {
        return Promise.resolve(makeListResponse({ shows: [show, show] }));
      }
      return Promise.resolve(makeListResponse({ shows: [] }));
    });

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.airingTodayShows).toHaveLength(1);
  });

  it('shows loading state while fetching', () => {
    // Make the promises hang to observe loading state
    mockGetTvShowList.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });

  it('is loading when only one list has resolved', async () => {
    let resolveTrending: (v: TvShowListResponse) => void;
    const trendingPromise = new Promise<TvShowListResponse>((r) => {
      resolveTrending = r;
    });

    mockGetTvShowList.mockImplementation((type: string) => {
      if (type === 'trending') return trendingPromise;
      if (type === 'airing_today') {
        return Promise.resolve(makeListResponse({ shows: [] }));
      }
      return Promise.resolve(makeListResponse({ shows: [] }));
    });

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    // Airing today resolves but trending is still pending
    await waitFor(() => {
      // At minimum one query is still loading
      expect(result.current.isLoading).toBe(true);
    });

    // Now resolve trending
    resolveTrending!(makeListResponse({ shows: [] }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('returns empty arrays when both lists return empty', async () => {
    mockGetTvShowList.mockResolvedValue(makeListResponse({ shows: [] }));

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });

  it('handles service errors gracefully', async () => {
    mockGetTvShowList.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useHomeTvShowLists(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Even with errors, arrays should be empty not undefined
    expect(result.current.trendingShows).toEqual([]);
    expect(result.current.airingTodayShows).toEqual([]);
  });
});
