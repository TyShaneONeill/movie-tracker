import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  discoverTvShowsByGenre: jest.fn(),
}));

import { useDiscoverTvShows } from '@/hooks/use-discover-tv-shows';
import { discoverTvShowsByGenre } from '@/lib/tv-show-service';
import type { TMDBTvShow, SearchTvShowsResponse } from '@/lib/tmdb.types';

const mockDiscoverTvShowsByGenre = discoverTvShowsByGenre as jest.Mock;

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

function makeDiscoverResponse(
  overrides: Partial<SearchTvShowsResponse> = {}
): SearchTvShowsResponse {
  return {
    shows: [makeTvShow()],
    page: 1,
    totalPages: 3,
    totalResults: 60,
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

describe('useDiscoverTvShows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns shows filtered by genre', async () => {
    const response = makeDiscoverResponse();
    mockDiscoverTvShowsByGenre.mockResolvedValue(response);

    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.shows).toEqual(response.shows);
    expect(mockDiscoverTvShowsByGenre).toHaveBeenCalledWith(18, 1);
  });

  it('does not fetch when genreId is null', () => {
    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: null }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockDiscoverTvShowsByGenre).not.toHaveBeenCalled();
  });

  it('does not fetch when genreId is 0', () => {
    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 0 }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(mockDiscoverTvShowsByGenre).not.toHaveBeenCalled();
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18, enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(mockDiscoverTvShowsByGenre).not.toHaveBeenCalled();
  });

  it('indicates hasNextPage when more pages available', async () => {
    mockDiscoverTvShowsByGenre.mockResolvedValue(
      makeDiscoverResponse({ page: 1, totalPages: 3 })
    );

    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasNextPage).toBe(true);
  });

  it('indicates no next page when on last page', async () => {
    mockDiscoverTvShowsByGenre.mockResolvedValue(
      makeDiscoverResponse({ page: 3, totalPages: 3 })
    );

    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasNextPage).toBe(false);
  });

  it('flattens shows from multiple pages', async () => {
    const page1Shows = [makeTvShow({ id: 1, name: 'Show A' })];
    const page2Shows = [makeTvShow({ id: 2, name: 'Show B' })];

    mockDiscoverTvShowsByGenre
      .mockResolvedValueOnce(
        makeDiscoverResponse({ shows: page1Shows, page: 1, totalPages: 2 })
      )
      .mockResolvedValueOnce(
        makeDiscoverResponse({ shows: page2Shows, page: 2, totalPages: 2 })
      );

    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // First page loaded
    expect(result.current.shows).toHaveLength(1);
    expect(result.current.shows[0].name).toBe('Show A');

    // Fetch next page
    result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.shows).toHaveLength(2);
    });

    expect(result.current.shows[0].name).toBe('Show A');
    expect(result.current.shows[1].name).toBe('Show B');
  });

  it('returns error on service failure', async () => {
    mockDiscoverTvShowsByGenre.mockRejectedValue(
      new Error('Failed to discover TV shows')
    );

    const { result } = renderHook(
      () => useDiscoverTvShows({ genreId: 18 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to discover TV shows');
    expect(result.current.shows).toEqual([]);
  });
});
