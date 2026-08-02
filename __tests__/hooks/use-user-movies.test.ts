import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/movie-service', () => ({
  fetchUserMovies: jest.fn(),
  addMovieToLibrary: jest.fn(),
  updateMovieStatus: jest.fn(),
  removeMovieFromLibrary: jest.fn(),
  getMovieByTmdbId: jest.fn(),
}));

import { useUserMovies, groupMoviesByTmdbId } from '@/hooks/use-user-movies';
import { useAuth } from '@/hooks/use-auth';
import { fetchUserMovies } from '@/lib/movie-service';
import type { UserMovie } from '@/lib/database.types';

const mockUseAuth = useAuth as jest.Mock;
const mockFetchUserMovies = fetchUserMovies as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

const USER_ID = 'user-abc-123';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return Wrapper;
}

function makeUserMovie(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: 'movie-uuid-1',
    user_id: USER_ID,
    tmdb_id: 550,
    title: 'Fight Club',
    source: 'manual',
    overview: 'A ticking-Loss-of-identity tale.',
    poster_path: '/pB8BM7pdSp6B6Ih7QI4DrWVkJUN.jpg',
    backdrop_path: '/87hTDiay2N2qWyX4Ds7ybXi9h8I.jpg',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18, 53],
    status: 'watched',
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_liked: null,
    journey_number: null,
    journey_notes: null,
    journey_tagline: null,
    journey_photos: null,
    journey_created_at: null,
    journey_updated_at: null,
    watched_at: null,
    watch_time: null,
    location_name: null,
    location_type: null,
    auditorium: null,
    seat_location: null,
    ticket_price: null,
    ticket_id: null,
    watch_format: null,
    watched_with: null,
    ai_poster_url: null,
    ai_poster_rarity: null,
    display_poster: null,
    cover_photo_index: null,
    theater_chain: null,
    ticket_type: null,
    mpaa_rating: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: USER_ID } });
  mockFetchUserMovies.mockResolvedValue([]);
});

// ============================================================================
// groupMoviesByTmdbId
// ============================================================================

describe('groupMoviesByTmdbId', () => {
  it('surfaces the rewatch with the most recent watched_at as primary', () => {
    const original = makeUserMovie({
      id: 'old',
      watched_at: '2020-03-15',
      added_at: '2020-03-16T00:00:00Z',
    });
    const rewatch = makeUserMovie({
      id: 'rewatch',
      watched_at: '2026-07-01',
      added_at: '2026-07-02T00:00:00Z',
    });

    // Order-independent: the rewatch wins whichever side of the array it's on
    for (const input of [[original, rewatch], [rewatch, original]]) {
      const [grouped] = groupMoviesByTmdbId(input);
      expect(grouped.id).toBe('rewatch');
      expect(grouped.journeyCount).toBe(2);
    }
  });

  it('falls back to added_at when watched_at is null', () => {
    const datedOldWatch = makeUserMovie({
      id: 'dated',
      watched_at: '2023-01-01',
      added_at: '2023-01-01T00:00:00Z',
    });
    const importedRecently = makeUserMovie({
      id: 'imported',
      watched_at: null,
      added_at: '2026-06-01T00:00:00Z',
    });

    const [grouped] = groupMoviesByTmdbId([datedOldWatch, importedRecently]);
    expect(grouped.id).toBe('imported');
  });

  it('explicit ai_generated display preference beats a more recent watch', () => {
    const aiPreferred = makeUserMovie({
      id: 'ai-preferred',
      watched_at: '2020-01-01',
      display_poster: 'ai_generated',
      ai_poster_url: 'https://example.com/ai.png',
    });
    const recentPlain = makeUserMovie({
      id: 'recent-plain',
      watched_at: '2026-07-01',
    });

    for (const input of [[aiPreferred, recentPlain], [recentPlain, aiPreferred]]) {
      const [grouped] = groupMoviesByTmdbId(input);
      expect(grouped.id).toBe('ai-preferred');
    }
  });

  it('having AI art available beats recency when neither has explicit preference', () => {
    const withArt = makeUserMovie({
      id: 'with-art',
      watched_at: '2020-01-01',
      ai_poster_url: 'https://example.com/ai.png',
    });
    const recentNoArt = makeUserMovie({
      id: 'recent-no-art',
      watched_at: '2026-07-01',
    });

    for (const input of [[recentNoArt, withArt], [withArt, recentNoArt]]) {
      const [grouped] = groupMoviesByTmdbId(input);
      expect(grouped.id).toBe('with-art');
    }
  });

  it('within the same AI tier, the most recent watch wins', () => {
    const oldAi = makeUserMovie({
      id: 'old-ai',
      watched_at: '2020-01-01',
      display_poster: 'ai_generated',
      ai_poster_url: 'https://example.com/old.png',
    });
    const newAi = makeUserMovie({
      id: 'new-ai',
      watched_at: '2026-07-01',
      display_poster: 'ai_generated',
      ai_poster_url: 'https://example.com/new.png',
    });

    const [grouped] = groupMoviesByTmdbId([oldAi, newAi]);
    expect(grouped.id).toBe('new-ai');
  });

  it('keeps distinct tmdb_ids as separate entries', () => {
    const grouped = groupMoviesByTmdbId([
      makeUserMovie({ id: 'a', tmdb_id: 550 }),
      makeUserMovie({ id: 'b', tmdb_id: 27205 }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped.map((m) => m.journeyCount)).toEqual([1, 1]);
  });
});

// ============================================================================
// useUserMovies orderBy plumbing
// ============================================================================

describe('useUserMovies orderBy', () => {
  it('defaults to added ordering', async () => {
    const { result } = renderHook(() => useUserMovies('watched'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchUserMovies).toHaveBeenCalledWith(USER_ID, 'watched', 'added');
  });

  it('passes watched ordering through to fetchUserMovies', async () => {
    const { result } = renderHook(() => useUserMovies('watched', 'watched'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchUserMovies).toHaveBeenCalledWith(USER_ID, 'watched', 'watched');
  });

  it('re-sorts client-side so a fresh undated mark-as-watched outranks old dated rows', async () => {
    // SQL NULLS LAST returns the undated row at the bottom; the client-side
    // coalesce (watched_at ?? added_at) must lift it above the 2019 watch.
    const oldDated = makeUserMovie({
      id: 'old-dated',
      tmdb_id: 1,
      watched_at: '2019-01-01',
      added_at: '2026-07-16T00:00:00Z',
    });
    const freshUndated = makeUserMovie({
      id: 'fresh-undated',
      tmdb_id: 2,
      watched_at: null,
      added_at: '2026-07-21T00:00:00Z',
    });
    mockFetchUserMovies.mockResolvedValue([oldDated, freshUndated]);

    const { result } = renderHook(() => useUserMovies('watched', 'watched'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.movies).toHaveLength(2));
    expect(result.current.movies.map((m) => m.id)).toEqual(['fresh-undated', 'old-dated']);
    expect(result.current.groupedMovies.map((m) => m.id)).toEqual(['fresh-undated', 'old-dated']);
  });

  it('does not re-sort in default added mode', async () => {
    // 'first' is OLDER: a recency sort would flip this pair, so the assertion
    // fails if the orderBy guard is removed and the re-sort runs unconditionally
    const first = makeUserMovie({ id: 'first', tmdb_id: 1, added_at: '2026-07-16T00:00:00Z' });
    const second = makeUserMovie({ id: 'second', tmdb_id: 2, added_at: '2026-07-21T00:00:00Z' });
    mockFetchUserMovies.mockResolvedValue([first, second]);

    const { result } = renderHook(() => useUserMovies('watched'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.movies).toHaveLength(2));
    expect(result.current.movies.map((m) => m.id)).toEqual(['first', 'second']);
  });
});
