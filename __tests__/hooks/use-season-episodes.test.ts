import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/tv-show-service', () => ({
  getSeasonEpisodes: jest.fn(),
}));

import { useSeasonEpisodes } from '@/hooks/use-season-episodes';
import { getSeasonEpisodes } from '@/lib/tv-show-service';
import type { SeasonDetailResponse, TMDBEpisode } from '@/lib/tmdb.types';

const mockGetSeasonEpisodes = getSeasonEpisodes as jest.Mock;

// ============================================================================
// Constants & Factories
// ============================================================================

const SHOW_ID = 1399;
const SEASON_NUMBER = 1;

function makeEpisode(overrides: Partial<TMDBEpisode> = {}): TMDBEpisode {
  return {
    id: 101,
    episode_number: 1,
    season_number: SEASON_NUMBER,
    name: 'Winter Is Coming',
    overview: 'The Stark family faces a new threat.',
    air_date: '2011-04-17',
    runtime: 62,
    still_path: '/still1.jpg',
    vote_average: 8.1,
    vote_count: 500,
    guest_stars: [],
    ...overrides,
  };
}

function makeSeasonDetail(
  overrides: Partial<SeasonDetailResponse> = {}
): SeasonDetailResponse {
  return {
    episodes: [
      makeEpisode({ episode_number: 1 }),
      makeEpisode({ episode_number: 2, id: 102, name: 'The Kingsroad', overview: 'Ned departs.' }),
      makeEpisode({ episode_number: 3, id: 103, name: 'Lord Snow', overview: 'Jon arrives.' }),
    ],
    seasonNumber: SEASON_NUMBER,
    name: 'Season 1',
    overview: 'The first season.',
    posterPath: '/season1.jpg',
    ...overrides,
  };
}

interface RenderOptions {
  showId?: number;
  seasonNumber?: number;
  enabled?: boolean;
}

/**
 * Renders the hook with a fresh QueryClient and waits for loading to complete.
 */
async function renderSeasonEpisodes(opts?: RenderOptions) {
  const {
    showId = SHOW_ID,
    seasonNumber = SEASON_NUMBER,
    enabled,
  } = opts ?? {};

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const rendered = renderHook(
    () => useSeasonEpisodes({ showId, seasonNumber, enabled }),
    { wrapper }
  );

  await waitFor(() => {
    expect(rendered.result.current.isLoading).toBe(false);
  });

  return { ...rendered, queryClient };
}

/**
 * Renders the hook without waiting for load (for disabled-query tests).
 */
function renderSeasonEpisodesNoWait(opts?: RenderOptions) {
  const {
    showId = SHOW_ID,
    seasonNumber = SEASON_NUMBER,
    enabled,
  } = opts ?? {};

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return renderHook(
    () => useSeasonEpisodes({ showId, seasonNumber, enabled }),
    { wrapper }
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('useSeasonEpisodes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSeasonEpisodes.mockResolvedValue(makeSeasonDetail());
  });

  // ==========================================================================
  // Fetching episodes
  // ==========================================================================

  describe('fetching episodes', () => {
    it('fetches and returns episodes for a given season', async () => {
      const { result } = await renderSeasonEpisodes();

      expect(result.current.episodes).toHaveLength(3);
      expect(result.current.episodes[0].name).toBe('Winter Is Coming');
      expect(result.current.episodes[1].name).toBe('The Kingsroad');
      expect(result.current.episodes[2].name).toBe('Lord Snow');
      expect(mockGetSeasonEpisodes).toHaveBeenCalledWith(SHOW_ID, SEASON_NUMBER);
    });

    it('returns episode details including name, number, air_date, runtime, overview', async () => {
      const episode = makeEpisode({
        episode_number: 5,
        name: 'The Wolf and the Lion',
        air_date: '2011-05-15',
        runtime: 55,
        overview: 'A critical episode.',
      });
      mockGetSeasonEpisodes.mockResolvedValue(
        makeSeasonDetail({ episodes: [episode] })
      );

      const { result } = await renderSeasonEpisodes();
      const ep = result.current.episodes[0];

      expect(ep.episode_number).toBe(5);
      expect(ep.name).toBe('The Wolf and the Lion');
      expect(ep.air_date).toBe('2011-05-15');
      expect(ep.runtime).toBe(55);
      expect(ep.overview).toBe('A critical episode.');
    });

    it('returns season metadata (name, overview, posterPath)', async () => {
      mockGetSeasonEpisodes.mockResolvedValue(
        makeSeasonDetail({
          name: 'Season 2',
          overview: 'The war of five kings.',
          posterPath: '/season2.jpg',
        })
      );

      const { result } = await renderSeasonEpisodes({ seasonNumber: 2 });

      expect(result.current.seasonName).toBe('Season 2');
      expect(result.current.seasonOverview).toBe('The war of five kings.');
      expect(result.current.posterPath).toBe('/season2.jpg');
    });
  });

  // ==========================================================================
  // Empty / missing seasons
  // ==========================================================================

  describe('empty / missing seasons', () => {
    it('returns empty episodes array when season has no episodes', async () => {
      mockGetSeasonEpisodes.mockResolvedValue(makeSeasonDetail({ episodes: [] }));

      const { result } = await renderSeasonEpisodes();
      expect(result.current.episodes).toEqual([]);
    });

    it('returns defaults when data is undefined', async () => {
      mockGetSeasonEpisodes.mockResolvedValue(undefined);

      const { result } = await renderSeasonEpisodes();

      expect(result.current.episodes).toEqual([]);
      expect(result.current.seasonName).toBe('');
      expect(result.current.seasonOverview).toBe('');
      expect(result.current.posterPath).toBeNull();
    });

    it('handles null posterPath in response', async () => {
      mockGetSeasonEpisodes.mockResolvedValue(makeSeasonDetail({ posterPath: null }));

      const { result } = await renderSeasonEpisodes();
      expect(result.current.posterPath).toBeNull();
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('sets isError and error when fetch fails', async () => {
      mockGetSeasonEpisodes.mockRejectedValue(new Error('Failed to fetch'));

      const { result } = await renderSeasonEpisodes();

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Failed to fetch');
      expect(result.current.episodes).toEqual([]);
    });
  });

  // ==========================================================================
  // Enabled / disabled behavior (parameterized)
  // ==========================================================================

  describe('enabled / disabled behavior', () => {
    it.each([
      { label: 'enabled is false', opts: { enabled: false } },
      { label: 'showId is 0', opts: { showId: 0 } },
      { label: 'showId is negative', opts: { showId: -1 } },
    ])('does not fetch when $label', async ({ opts }) => {
      renderSeasonEpisodesNoWait(opts);

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetSeasonEpisodes).not.toHaveBeenCalled();
    });

    it('fetches for season number 0 (specials)', async () => {
      mockGetSeasonEpisodes.mockResolvedValue(makeSeasonDetail({ seasonNumber: 0 }));

      await renderSeasonEpisodes({ seasonNumber: 0 });

      expect(mockGetSeasonEpisodes).toHaveBeenCalledWith(SHOW_ID, 0);
    });
  });
});
