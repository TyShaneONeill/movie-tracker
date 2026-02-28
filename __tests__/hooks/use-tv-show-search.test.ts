import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  searchTvShows: jest.fn(),
}));

import { useTvShowSearch } from '@/hooks/use-tv-show-search';
import { searchTvShows } from '@/lib/tv-show-service';
import type { TMDBTvShow, SearchTvShowsResponse } from '@/lib/tmdb.types';

const mockSearchTvShows = searchTvShows as jest.Mock;

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

function makeSearchResponse(
  overrides: Partial<SearchTvShowsResponse> = {}
): SearchTvShowsResponse {
  return {
    shows: [makeTvShow()],
    page: 1,
    totalPages: 5,
    totalResults: 100,
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

describe('useTvShowSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns search results from service', async () => {
    const response = makeSearchResponse();
    mockSearchTvShows.mockResolvedValue(response);

    const { result } = renderHook(
      () => useTvShowSearch({ query: 'Breaking Bad' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.shows).toEqual(response.shows);
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.totalResults).toBe(100);
    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 1);
  });

  it('does not search when query is empty', () => {
    const { result } = renderHook(
      () => useTvShowSearch({ query: '' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('does not search when query is whitespace only', () => {
    const { result } = renderHook(
      () => useTvShowSearch({ query: '   ' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('does not search when query is less than 2 characters', () => {
    const { result } = renderHook(
      () => useTvShowSearch({ query: 'a' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('trims query whitespace before searching', async () => {
    mockSearchTvShows.mockResolvedValue(makeSearchResponse());

    const { result } = renderHook(
      () => useTvShowSearch({ query: '  Breaking Bad  ' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 1);
  });

  it('passes page parameter to service', async () => {
    mockSearchTvShows.mockResolvedValue(
      makeSearchResponse({ page: 3, totalPages: 5 })
    );

    const { result } = renderHook(
      () => useTvShowSearch({ query: 'Breaking Bad', page: 3 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSearchTvShows).toHaveBeenCalledWith('Breaking Bad', 3);
    expect(result.current.page).toBe(3);
  });

  it('does not search when enabled is false', () => {
    const { result } = renderHook(
      () => useTvShowSearch({ query: 'Breaking Bad', enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.shows).toEqual([]);
    expect(mockSearchTvShows).not.toHaveBeenCalled();
  });

  it('returns error on service failure', async () => {
    mockSearchTvShows.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useTvShowSearch({ query: 'Breaking Bad' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.shows).toEqual([]);
  });

  it('defaults page and totalPages when data is undefined', () => {
    const { result } = renderHook(
      () => useTvShowSearch({ query: '' }),
      { wrapper: createWrapper() }
    );

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.totalResults).toBe(0);
  });
});
