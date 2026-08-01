import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * The community feed is fetched at PAGE_SIZE and filtered AFTER (wordless
 * takes, blocked users), so a page can arrive full and render empty. The list
 * only asks for more via onEndReached, and an empty list never reaches its
 * end — so an all-wordless page would strand the feed on "you're all caught up"
 * with hasNextPage still true. The hook advances past those pages itself,
 * bounded so a pathological stretch of the table can't spin.
 */

jest.mock('@/lib/feed-service', () => ({
  getFollowingIds: jest.fn(),
  fetchFollowingFeed: jest.fn(),
  fetchFollowingReviews: jest.fn(),
  fetchFollowingComments: jest.fn(),
  fetchCommunityFeedPage: jest.fn(),
  getFeedLastSeen: jest.fn(),
  updateFeedLastSeen: jest.fn(),
  buildFeedList: jest.fn(() => []),
}));

jest.mock('@/lib/ads-context', () => ({ useAds: () => ({ adsEnabled: false }) }));
jest.mock('@/hooks/use-blocked-users', () => ({
  useBlockedUsers: () => ({ blockedIds: [] }),
}));

import {
  getFollowingIds,
  fetchFollowingFeed,
  fetchFollowingReviews,
  fetchFollowingComments,
  fetchCommunityFeedPage,
  getFeedLastSeen,
} from '@/lib/feed-service';
import type { ActivityFeedItem } from '@/hooks/use-activity-feed';
import { usePrioritizedFeed, AUTO_ADVANCE_PAGE_CAP } from '@/hooks/use-prioritized-feed';

function item(id: string): ActivityFeedItem {
  return {
    id,
    userId: 'u1',
    tmdbId: 100,
    movieTitle: 'Movie A',
    posterPath: null,
    rating: 8,
    quoteText: 'Worth it',
    isSpoiler: false,
    visibility: 'public',
    createdAt: '2026-07-31T12:00:00Z',
    mediaType: 'movie',
    userDisplayName: 'Alice',
    userAvatarUrl: null,
    activityType: 'first_take',
  };
}

/** A page whose 20 rows all filtered out, but whose cursor is still live. */
const emptyPage = (cursor: string) => ({ items: [], nextCursor: cursor });

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
  (getFollowingIds as jest.Mock).mockResolvedValue([]);
  (fetchFollowingFeed as jest.Mock).mockResolvedValue([]);
  (fetchFollowingReviews as jest.Mock).mockResolvedValue([]);
  (fetchFollowingComments as jest.Mock).mockResolvedValue([]);
  (getFeedLastSeen as jest.Mock).mockResolvedValue(null);
});

describe('community feed auto-advance', () => {
  it('fetches the next page when a full page filters down to nothing', async () => {
    // Page 1: 20 of 20 wordless → zero items, cursor still live.
    // Page 2: a real take. Nothing scrolled; the hook must get there itself.
    (fetchCommunityFeedPage as jest.Mock)
      .mockResolvedValueOnce(emptyPage('2026-07-31T11:00:00Z'))
      .mockResolvedValueOnce({ items: [item('ft-1')], nextCursor: null });

    const { result } = renderHook(() => usePrioritizedFeed('me'), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current.communityItems.map((i) => i.id)).toEqual(['ft-1'])
    );
    expect(fetchCommunityFeedPage).toHaveBeenCalledTimes(2);
  });

  it('walks several consecutive empty pages before reaching content', async () => {
    (fetchCommunityFeedPage as jest.Mock)
      .mockResolvedValueOnce(emptyPage('c1'))
      .mockResolvedValueOnce(emptyPage('c2'))
      .mockResolvedValueOnce({ items: [item('ft-2')], nextCursor: null });

    const { result } = renderHook(() => usePrioritizedFeed('me'), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current.communityItems.map((i) => i.id)).toEqual(['ft-2'])
    );
    expect(fetchCommunityFeedPage).toHaveBeenCalledTimes(3);
  });

  it('stops at the cap so a pathological feed cannot spin', async () => {
    // Every page empty, cursor never exhausts.
    (fetchCommunityFeedPage as jest.Mock).mockImplementation(async () =>
      emptyPage('never-ends')
    );

    const { result } = renderHook(() => usePrioritizedFeed('me'), {
      wrapper: createWrapper(),
    });

    // 1 initial fetch + AUTO_ADVANCE_PAGE_CAP auto-advances, then it waits for
    // the user rather than continuing on its own.
    await waitFor(() =>
      expect(fetchCommunityFeedPage).toHaveBeenCalledTimes(AUTO_ADVANCE_PAGE_CAP + 1)
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCommunityFeedPage).toHaveBeenCalledTimes(AUTO_ADVANCE_PAGE_CAP + 1);
    expect(result.current.communityItems).toEqual([]);
  });

  it('does not auto-advance when the page has content', async () => {
    (fetchCommunityFeedPage as jest.Mock).mockResolvedValue({
      items: [item('ft-3')],
      nextCursor: 'more',
    });

    const { result } = renderHook(() => usePrioritizedFeed('me'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.communityItems.length).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCommunityFeedPage).toHaveBeenCalledTimes(1);
  });
});
