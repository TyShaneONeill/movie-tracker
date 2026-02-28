/**
 * Shared helpers for TV show hook tests.
 * Consolidates duplicated factories and wrappers used across
 * use-tv-show-search, use-discover-tv-shows, and use-home-tv-show-lists tests.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { TMDBTvShow, SearchTvShowsResponse, TvShowListResponse } from '@/lib/tmdb.types';

// ============================================================================
// Fixture Factories
// ============================================================================

export function makeTMDBTvShow(overrides: Partial<TMDBTvShow> = {}): TMDBTvShow {
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

export function makeSearchTvShowsResponse(
  overrides: Partial<SearchTvShowsResponse> = {}
): SearchTvShowsResponse {
  return {
    shows: [makeTMDBTvShow()],
    page: 1,
    totalPages: 5,
    totalResults: 100,
    ...overrides,
  };
}

export function makeTvShowListResponse(
  overrides: Partial<TvShowListResponse> = {}
): TvShowListResponse {
  return {
    shows: [makeTMDBTvShow()],
    page: 1,
    totalPages: 1,
    totalResults: 1,
    ...overrides,
  };
}

// ============================================================================
// Test Harness
// ============================================================================

/**
 * Creates a QueryClientProvider wrapper for renderHook tests.
 * Disables retries to make tests deterministic.
 */
export function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}
