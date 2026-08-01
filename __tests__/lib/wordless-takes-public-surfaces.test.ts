import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * One suite per PUBLIC first-take surface, asserting the same invariant: a
 * rating-only take never reaches the render tree, while a worded take beside it
 * does (Ty, 2026-07-31).
 *
 * These sit at each surface's DATA boundary — the hook or service the screen
 * renders straight out of — because that is where the filter lives. Dropping a
 * take there is what makes the room's hero, its ledger, its "View all N takes"
 * count, and the view-all screen agree with each other without four separate
 * filters.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-blocked-users', () => ({ useBlockedUsers: jest.fn() }));

// use-episode-room pulls in the achievement celebration tree (expo-haptics /
// expo-asset) for its unlock mutation — irrelevant to the take stream.
jest.mock('@/lib/achievement-context', () => ({
  useAchievementCheck: () => ({ triggerAchievementCheck: jest.fn() }),
}));
jest.mock('@/lib/tv-show-service', () => ({
  getTvShowByTmdbId: jest.fn(),
  addTvShowToLibrary: jest.fn(),
  markEpisodeWatched: jest.fn(),
}));

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import { mockSupabaseQuery } from '@/__tests__/fixtures';

import { fetchFollowingFeed, fetchCommunityFeedPage } from '@/lib/feed-service';
import { fetchMovieReviews } from '@/lib/review-service';
import { useFirstTakes } from '@/hooks/use-first-takes';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useEpisodeRoomTakes } from '@/hooks/use-episode-room';

const WORDED = 'The reveal recontextualises the whole season';

/** A `first_takes` row as the feed's JOINed select returns it. */
function feedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ft-worded',
    user_id: 'u1',
    tmdb_id: 100,
    movie_title: 'Movie A',
    poster_path: '/a.jpg',
    rating: 8,
    quote_text: WORDED,
    is_spoiler: false,
    visibility: 'public',
    created_at: '2026-07-31T12:00:00Z',
    media_type: 'movie',
    edited_at: null,
    is_rewatch: false,
    season_number: null,
    episode_number: null,
    profiles: { full_name: 'Alice', username: 'alice', avatar_url: null },
    ...overrides,
  };
}

/** A raw `first_takes` row as `select('*')` returns it. */
function takeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ft-worded',
    user_id: 'u1',
    tmdb_id: 100,
    movie_title: 'Movie A',
    poster_path: '/a.jpg',
    rating: 8,
    quote_text: WORDED,
    is_spoiler: false,
    visibility: 'public',
    created_at: '2026-07-31T12:00:00Z',
    media_type: 'movie',
    comment_count: 0,
    like_count: 0,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });
  (useBlockedUsers as jest.Mock).mockReturnValue({ blockedIds: [] });
});

// ---------------------------------------------------------------------------
// Feed — legacy + v2 (both read through feed-service)
// ---------------------------------------------------------------------------

describe('feed (following)', () => {
  it('renders the worded take and drops the rating-only one', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({
        data: [
          feedRow(),
          feedRow({ id: 'ft-empty', quote_text: '' }),
          feedRow({ id: 'ft-blank', quote_text: '   ' }),
        ],
        error: null,
      })
    );

    const items = await fetchFollowingFeed(['u1']);

    expect(items.map((i) => i.id)).toEqual(['ft-worded']);
  });
});

describe('feed (community)', () => {
  it('drops rating-only takes without stalling pagination', async () => {
    // A FULL page (20 rows) where all but one are wordless: the page shrinks to
    // one item, but nextCursor must still be set off the raw page or the feed
    // would stop paging the moment a page is mostly wordless.
    const rows = [
      feedRow(),
      ...Array.from({ length: 19 }, (_, i) =>
        feedRow({
          id: `ft-blank-${i}`,
          quote_text: '  ',
          created_at: `2026-07-31T11:${String(i).padStart(2, '0')}:00Z`,
        })
      ),
    ];
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: rows, error: null })
    );

    const { items, nextCursor } = await fetchCommunityFeedPage('me', []);

    expect(items.map((i) => i.id)).toEqual(['ft-worded']);
    expect(nextCursor).toBe('2026-07-31T11:18:00Z');
  });
});

// ---------------------------------------------------------------------------
// Movie / TV detail — Community Reviews + both all-reviews screens
// ---------------------------------------------------------------------------

describe('movie & TV detail take section', () => {
  it('drops rating-only first takes but never touches reviews', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        reviews: [
          { id: 'ft-1', source: 'first_take', quoteText: WORDED },
          { id: 'ft-2', source: 'first_take', quoteText: '' },
          { id: 'ft-3', source: 'first_take', quoteText: '  \n' },
          // A review carries its own body; the take rule must not reach it.
          { id: 'rev-1', source: 'review', quoteText: '', reviewText: 'Long form' },
        ],
        page: 1,
        totalPages: 1,
        totalCount: 4,
      },
      error: null,
    });

    const result = await fetchMovieReviews(123);

    expect(result.reviews.map((r) => r.id)).toEqual(['ft-1', 'rev-1']);
    // Server-computed pagination is passed through untouched — see the PR body:
    // aligning totalCount needs an edge-function change, not a client one.
    expect(result.totalCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Profiles — own tab and another user's tab
// ---------------------------------------------------------------------------

describe('own profile First Takes tab', () => {
  it('drops a whitespace-only take the SQL guard let through', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({
        data: [takeRow(), takeRow({ id: 'ft-blank', quote_text: ' ' })],
        error: null,
      })
    );

    const { result } = renderHook(() => useFirstTakes(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.id)).toEqual(['ft-worded']);
  });
});

describe("another user's profile First Takes tab", () => {
  it('drops rating-only takes from the list', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({
        data: [takeRow(), takeRow({ id: 'ft-empty', quote_text: '' })],
        error: null,
      })
    );

    const { result } = renderHook(() => useUserProfile('other-user', 'first-takes'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.firstTakes.length).toBeGreaterThan(0));
    expect(result.current.firstTakes.map((t) => t.id)).toEqual(['ft-worded']);
  });

  it('counts the tab the same way it renders it', async () => {
    const chain = mockSupabaseQuery({ data: [], error: null, count: 0 } as never);
    (supabase.from as jest.Mock).mockReturnValue(chain);

    renderHook(() => useUserProfile('other-user'), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(chain.like).toHaveBeenCalledWith('quote_text', '_%')
    );
  });
});

// ---------------------------------------------------------------------------
// Debrief Room — hero, ledger, view-all screen, and both take counts
// ---------------------------------------------------------------------------

describe('Debrief Room take stream', () => {
  it('drops rating-only takes, so hero/ledger/counts all agree', async () => {
    const takes = [
      takeRow({ id: 'ft-blank', quote_text: '   ', comment_count: 42 }),
      takeRow(),
    ];
    const profiles = [
      { id: 'u1', full_name: 'Alice', username: 'alice', avatar_url: null, updated_at: null },
    ];
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockSupabaseQuery({ data: takes, error: null }))
      .mockReturnValueOnce(mockSupabaseQuery({ data: profiles, error: null }));

    const { result } = renderHook(
      () => useEpisodeRoomTakes(1396, 2, 4, true),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // The wordless take has the most engagement — without the filter it would
    // have been the hero stub.
    expect(result.current.takes.map((e) => e.take.id)).toEqual(['ft-worded']);
    // The "View all N takes" CTA and the "· N takes" header both read this.
    expect(result.current.takes.length).toBe(1);
  });
});
