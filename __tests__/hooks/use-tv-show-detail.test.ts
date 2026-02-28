import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  getTvShowDetails: jest.fn(),
}));

import { useTvShowDetail } from '@/hooks/use-tv-show-detail';
import { getTvShowDetails } from '@/lib/tv-show-service';
import type {
  TvShowDetailResponse,
  TMDBTvShowDetail,
  TMDBCastMember,
  TMDBCrewMember,
  TMDBVideo,
  TMDBSeason,
  TMDBTvRecommendation,
} from '@/lib/tmdb.types';

const mockGetTvShowDetails = getTvShowDetails as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const SHOW_ID = 1399;

function makeTvShowDetail(overrides: Partial<TMDBTvShowDetail> = {}): TMDBTvShowDetail {
  return {
    id: SHOW_ID,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher diagnosed with cancer.',
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    first_air_date: '2008-01-20',
    last_air_date: '2013-09-29',
    vote_average: 8.9,
    vote_count: 12000,
    genre_ids: [18, 80],
    genres: [
      { id: 18, name: 'Drama' },
      { id: 80, name: 'Crime' },
    ],
    tagline: 'All Hail the King',
    status: 'Ended',
    type: 'Scripted',
    in_production: false,
    number_of_seasons: 5,
    number_of_episodes: 62,
    episode_run_time: [45, 47],
    networks: [{ id: 174, name: 'AMC', logo_path: '/amc.png' }],
    created_by: [{ id: 66633, name: 'Vince Gilligan', profile_path: '/vince.jpg' }],
    seasons: [],
    original_language: 'en',
    origin_country: ['US'],
    ...overrides,
  };
}

function makeCast(): TMDBCastMember[] {
  return [
    { id: 17419, name: 'Bryan Cranston', character: 'Walter White', profile_path: '/bryan.jpg', order: 0 },
    { id: 84497, name: 'Aaron Paul', character: 'Jesse Pinkman', profile_path: '/aaron.jpg', order: 1 },
  ];
}

function makeCrew(): TMDBCrewMember[] {
  return [
    { id: 66633, name: 'Vince Gilligan', job: 'Creator', department: 'Production', profile_path: '/vince.jpg' },
  ];
}

function makeTrailer(): TMDBVideo {
  return {
    id: 'trailer-1',
    key: 'HhesaQXLnNY',
    site: 'YouTube',
    type: 'Trailer',
    official: true,
    name: 'Official Trailer',
    published_at: '2008-01-20T00:00:00.000Z',
  };
}

function makeSeasons(): TMDBSeason[] {
  return [
    { id: 3572, season_number: 1, name: 'Season 1', overview: '', poster_path: '/s1.jpg', air_date: '2008-01-20', episode_count: 7, vote_average: 8.2 },
    { id: 3573, season_number: 2, name: 'Season 2', overview: '', poster_path: '/s2.jpg', air_date: '2009-03-08', episode_count: 13, vote_average: 8.5 },
  ];
}

function makeRecommendations(): TMDBTvRecommendation[] {
  return [
    { id: 62560, name: 'Better Call Saul', poster_path: '/bcs.jpg', backdrop_path: '/bcs_bg.jpg', first_air_date: '2015-02-08', vote_average: 8.6, overview: 'Prequel', genre_ids: [18, 80] },
  ];
}

function makeFullResponse(overrides: Partial<TvShowDetailResponse> = {}): TvShowDetailResponse {
  return {
    show: makeTvShowDetail(),
    cast: makeCast(),
    crew: makeCrew(),
    trailer: makeTrailer(),
    watchProviders: {
      US: {
        flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }],
        link: 'https://tmdb.org/watch',
      },
    },
    seasons: makeSeasons(),
    recommendations: makeRecommendations(),
    ...overrides,
  };
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

describe('useTvShowDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Returns full show data
  // ==========================================================================

  describe('successful data fetching', () => {
    it('returns show data, cast, crew, trailer, watchProviders, seasons, and recommendations', async () => {
      const { wrapper } = createTestHarness();
      const fullResponse = makeFullResponse();
      mockGetTvShowDetails.mockResolvedValue(fullResponse);

      const { result } = renderHook(() => useTvShowDetail({ showId: SHOW_ID }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.show).toEqual(fullResponse.show);
      expect(result.current.cast).toEqual(fullResponse.cast);
      expect(result.current.crew).toEqual(fullResponse.crew);
      expect(result.current.trailer).toEqual(fullResponse.trailer);
      expect(result.current.watchProviders).toEqual(fullResponse.watchProviders);
      expect(result.current.seasons).toEqual(fullResponse.seasons);
      expect(result.current.recommendations).toEqual(fullResponse.recommendations);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('accepts string showId and converts to number', async () => {
      const { wrapper } = createTestHarness();
      mockGetTvShowDetails.mockResolvedValue(makeFullResponse());

      const { result } = renderHook(() => useTvShowDetail({ showId: '1399' }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetTvShowDetails).toHaveBeenCalledWith(1399);
      expect(result.current.show).toBeTruthy();
    });

    it('returns null trailer when no trailer is available', async () => {
      const { wrapper } = createTestHarness();
      mockGetTvShowDetails.mockResolvedValue(makeFullResponse({ trailer: null }));

      const { result } = renderHook(() => useTvShowDetail({ showId: SHOW_ID }), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.trailer).toBeNull();
    });
  });

  // ==========================================================================
  // Returns defaults when loading/no data
  // ==========================================================================

  describe('default values', () => {
    it('returns defaults while loading', () => {
      const { wrapper } = createTestHarness();
      mockGetTvShowDetails.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useTvShowDetail({ showId: SHOW_ID }), { wrapper });

      expect(result.current.show).toBeNull();
      expect(result.current.cast).toEqual([]);
      expect(result.current.crew).toEqual([]);
      expect(result.current.trailer).toBeNull();
      expect(result.current.watchProviders).toEqual({});
      expect(result.current.seasons).toEqual([]);
      expect(result.current.recommendations).toEqual([]);
      expect(result.current.isLoading).toBe(true);
    });

    it('does not fetch when enabled is false', () => {
      const { wrapper } = createTestHarness();

      renderHook(() => useTvShowDetail({ showId: SHOW_ID, enabled: false }), { wrapper });

      expect(mockGetTvShowDetails).not.toHaveBeenCalled();
    });

    it('does not fetch with invalid showId (NaN)', () => {
      const { wrapper } = createTestHarness();

      renderHook(() => useTvShowDetail({ showId: 'abc' }), { wrapper });

      expect(mockGetTvShowDetails).not.toHaveBeenCalled();
    });

    it('does not fetch with invalid showId (0)', () => {
      const { wrapper } = createTestHarness();

      renderHook(() => useTvShowDetail({ showId: 0 }), { wrapper });

      expect(mockGetTvShowDetails).not.toHaveBeenCalled();
    });

    it('does not fetch with invalid showId (negative)', () => {
      const { wrapper } = createTestHarness();

      renderHook(() => useTvShowDetail({ showId: -1 }), { wrapper });

      expect(mockGetTvShowDetails).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('sets isError and error when query fails', async () => {
      const { wrapper } = createTestHarness();
      mockGetTvShowDetails.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTvShowDetail({ showId: SHOW_ID }), { wrapper });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.show).toBeNull();
      expect(result.current.cast).toEqual([]);
    });
  });
});
