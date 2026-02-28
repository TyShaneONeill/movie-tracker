import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/tv-show-service', () => ({
  fetchUserTvShows: jest.fn(),
  addTvShowToLibrary: jest.fn(),
  updateTvShowStatus: jest.fn(),
  removeTvShowFromLibrary: jest.fn(),
  getTvShowByTmdbId: jest.fn(),
}));

import { useContinueWatching } from '@/hooks/use-continue-watching';
import { useAuth } from '@/hooks/use-auth';
import { fetchUserTvShows } from '@/lib/tv-show-service';
import type { UserTvShow } from '@/lib/database.types';

const mockUseAuth = useAuth as jest.Mock;
const mockFetchUserTvShows = fetchUserTvShows as jest.Mock;

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

function makeUserTvShow(overrides: Partial<UserTvShow> = {}): UserTvShow {
  return {
    id: 'tv-1',
    user_id: 'user-123',
    tmdb_id: 100,
    name: 'Breaking Bad',
    status: 'watching',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: 'A chemistry teacher turned drug lord.',
    first_air_date: '2008-01-20',
    vote_average: 9.5,
    genre_ids: [18, 80],
    number_of_seasons: 5,
    number_of_episodes: 62,
    current_season: 3,
    current_episode: 5,
    episodes_watched: 25,
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-15T10:00:00Z',
    started_watching_at: '2024-01-05T00:00:00Z',
    finished_at: null,
    is_liked: null,
    user_rating: null,
    ...overrides,
  } as UserTvShow;
}

/** Renders the hook, waits for loading to finish, and returns the result. */
async function renderAndSettle() {
  const { result } = renderHook(() => useContinueWatching(), {
    wrapper: createWrapper(),
  });

  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('useContinueWatching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
    mockFetchUserTvShows.mockResolvedValue([]);
  });

  it('returns shows sorted by most recently updated', async () => {
    mockFetchUserTvShows.mockResolvedValue([
      makeUserTvShow({ id: 'tv-1', tmdb_id: 100, name: 'Breaking Bad', updated_at: '2024-06-10T00:00:00Z' }),
      makeUserTvShow({ id: 'tv-2', tmdb_id: 200, name: 'Better Call Saul', updated_at: '2024-06-15T00:00:00Z' }),
      makeUserTvShow({ id: 'tv-3', tmdb_id: 300, name: 'The Wire', updated_at: '2024-06-12T00:00:00Z' }),
    ]);

    const result = await renderAndSettle();

    expect(result.current.shows.map((s) => s.name)).toEqual([
      'Better Call Saul',
      'The Wire',
      'Breaking Bad',
    ]);
  });

  it('returns empty array when no shows are being watched', async () => {
    const result = await renderAndSettle();
    expect(result.current.shows).toEqual([]);
  });

  it('returns empty array when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useContinueWatching(), {
      wrapper: createWrapper(),
    });

    expect(result.current.shows).toEqual([]);
  });

  it('limits results to 10 shows', async () => {
    const shows = Array.from({ length: 15 }, (_, i) =>
      makeUserTvShow({
        id: `tv-${i}`,
        tmdb_id: 100 + i,
        name: `Show ${i}`,
        updated_at: `2024-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      })
    );
    mockFetchUserTvShows.mockResolvedValue(shows);

    const result = await renderAndSettle();
    expect(result.current.shows).toHaveLength(10);
  });

  it('sorts shows with null updated_at last', async () => {
    mockFetchUserTvShows.mockResolvedValue([
      makeUserTvShow({ id: 'tv-2', tmdb_id: 200, name: 'No Date', updated_at: null }),
      makeUserTvShow({ id: 'tv-1', tmdb_id: 100, name: 'Has Date', updated_at: '2024-06-15T00:00:00Z' }),
    ]);

    const result = await renderAndSettle();

    expect(result.current.shows[0].name).toBe('Has Date');
    expect(result.current.shows[1].name).toBe('No Date');
  });

  it('exposes isLoading state that transitions from true to false', async () => {
    let resolveShows!: (value: UserTvShow[]) => void;
    mockFetchUserTvShows.mockReturnValue(
      new Promise<UserTvShow[]>((resolve) => { resolveShows = resolve; })
    );

    const { result } = renderHook(() => useContinueWatching(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    resolveShows([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls fetchUserTvShows with "watching" status filter', async () => {
    await renderAndSettle();
    expect(mockFetchUserTvShows).toHaveBeenCalledWith('user-123', 'watching');
  });
});
