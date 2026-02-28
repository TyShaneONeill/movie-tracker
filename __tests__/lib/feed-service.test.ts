jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import type { ActivityFeedItem } from '@/hooks/use-activity-feed';
import {
  buildFeedList,
  getFollowingIds,
  fetchFollowingFeed,
  fetchCommunityFeedPage,
  getFeedLastSeen,
  updateFeedLastSeen,
  AD_INTERVAL,
} from '@/lib/feed-service';
import { mockSupabaseQuery } from '@/__tests__/fixtures';

// ============================================================================
// Test Data Factory
// ============================================================================

function makeActivityItem(
  overrides: Partial<ActivityFeedItem> = {}
): ActivityFeedItem {
  return {
    id: 'ft-1',
    userId: 'user-1',
    tmdbId: 123,
    movieTitle: 'Test Movie',
    posterPath: '/poster.jpg',
    rating: 8,
    quoteText: 'Great movie!',
    isSpoiler: false,
    visibility: 'public',
    createdAt: '2024-01-01T00:00:00Z',
    mediaType: 'movie',
    userDisplayName: 'John Doe',
    userAvatarUrl: 'https://example.com/avatar.jpg',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildFeedList', () => {
  it('merges following + community items in correct order', () => {
    const following = [
      makeActivityItem({ id: 'f-1' }),
      makeActivityItem({ id: 'f-2' }),
    ];
    const community = [
      makeActivityItem({ id: 'c-1' }),
      makeActivityItem({ id: 'c-2' }),
    ];

    const result = buildFeedList({
      followingItems: following,
      communityItems: community,
      isAllCaughtUp: false,
      adsEnabled: false,
    });

    // Following items first
    expect(result[0]).toEqual({ type: 'activity', data: following[0] });
    expect(result[1]).toEqual({ type: 'activity', data: following[1] });
    // Community header (no caught-up because isAllCaughtUp=false)
    expect(result[2]).toEqual({ type: 'community-header' });
    // Community items
    expect(result[3]).toEqual({ type: 'activity', data: community[0] });
    expect(result[4]).toEqual({ type: 'activity', data: community[1] });
    expect(result).toHaveLength(5);
  });

  it('returns only community items when following is empty', () => {
    const community = [
      makeActivityItem({ id: 'c-1' }),
      makeActivityItem({ id: 'c-2' }),
      makeActivityItem({ id: 'c-3' }),
    ];

    const result = buildFeedList({
      followingItems: [],
      communityItems: community,
      isAllCaughtUp: false,
      adsEnabled: false,
    });

    expect(result).toHaveLength(3);
    expect(result.every((item) => item.type === 'activity')).toBe(true);
    expect(
      result.some((item) => item.type === 'caught-up' || item.type === 'community-header')
    ).toBe(false);
  });

  it('returns only following items when community is empty', () => {
    const following = [
      makeActivityItem({ id: 'f-1' }),
      makeActivityItem({ id: 'f-2' }),
    ];

    const result = buildFeedList({
      followingItems: following,
      communityItems: [],
      isAllCaughtUp: true,
      adsEnabled: false,
    });

    expect(result).toHaveLength(4); // 2 activity + caught-up + community-header
    expect(result[0]).toEqual({ type: 'activity', data: following[0] });
    expect(result[1]).toEqual({ type: 'activity', data: following[1] });
    expect(result[2]).toEqual({ type: 'caught-up' });
    expect(result[3]).toEqual({ type: 'community-header' });
  });

  it('shows caught-up marker when isAllCaughtUp is true', () => {
    const following = [
      makeActivityItem({ id: 'f-1' }),
      makeActivityItem({ id: 'f-2' }),
    ];
    const community = [
      makeActivityItem({ id: 'c-1' }),
      makeActivityItem({ id: 'c-2' }),
    ];

    const result = buildFeedList({
      followingItems: following,
      communityItems: community,
      isAllCaughtUp: true,
      adsEnabled: false,
    });

    // following → caught-up → community-header → community
    expect(result[0]).toEqual({ type: 'activity', data: following[0] });
    expect(result[1]).toEqual({ type: 'activity', data: following[1] });
    expect(result[2]).toEqual({ type: 'caught-up' });
    expect(result[3]).toEqual({ type: 'community-header' });
    expect(result[4]).toEqual({ type: 'activity', data: community[0] });
    expect(result[5]).toEqual({ type: 'activity', data: community[1] });
    expect(result).toHaveLength(6);
  });

  it('omits caught-up marker when isAllCaughtUp is false', () => {
    const following = [
      makeActivityItem({ id: 'f-1' }),
      makeActivityItem({ id: 'f-2' }),
    ];
    const community = [
      makeActivityItem({ id: 'c-1' }),
      makeActivityItem({ id: 'c-2' }),
    ];

    const result = buildFeedList({
      followingItems: following,
      communityItems: community,
      isAllCaughtUp: false,
      adsEnabled: false,
    });

    // following → community-header (no caught-up) → community
    expect(result[0]).toEqual({ type: 'activity', data: following[0] });
    expect(result[1]).toEqual({ type: 'activity', data: following[1] });
    expect(result[2]).toEqual({ type: 'community-header' });
    expect(result[3]).toEqual({ type: 'activity', data: community[0] });
    expect(result[4]).toEqual({ type: 'activity', data: community[1] });
    expect(result).toHaveLength(5);
    expect(result.some((item) => item.type === 'caught-up')).toBe(false);
  });

  it('interleaves ads every AD_INTERVAL items in community section only', () => {
    const communityItems = Array.from({ length: 30 }, (_, i) =>
      makeActivityItem({ id: `c-${i}` })
    );

    const result = buildFeedList({
      followingItems: [],
      communityItems,
      isAllCaughtUp: false,
      adsEnabled: true,
    });

    const adItems = result.filter((item) => item.type === 'ad');
    expect(adItems).toHaveLength(1);

    // The ad should appear after 25 community items (at index 25)
    expect(result[25]).toEqual({ type: 'ad', id: 'ad-community-25' });

    // No ads in the following section (it's empty anyway, but verify structure)
    const beforeAd = result.slice(0, 25);
    expect(beforeAd.every((item) => item.type === 'activity')).toBe(true);
  });

  it('does not interleave ads when adsEnabled is false', () => {
    const communityItems = Array.from({ length: 30 }, (_, i) =>
      makeActivityItem({ id: `c-${i}` })
    );

    const result = buildFeedList({
      followingItems: [],
      communityItems,
      isAllCaughtUp: false,
      adsEnabled: false,
    });

    expect(result.some((item) => item.type === 'ad')).toBe(false);
  });
});

describe('getFollowingIds', () => {
  it('returns array of following IDs', async () => {
    const chain = mockSupabaseQuery({
      data: [{ following_id: 'u1' }, { following_id: 'u2' }],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getFollowingIds('my-user');

    expect(result).toEqual(['u1', 'u2']);
    expect(supabase.from).toHaveBeenCalledWith('follows');
    expect(chain.eq).toHaveBeenCalledWith('follower_id', 'my-user');
  });

  it('returns empty array when no follows', async () => {
    const chain = mockSupabaseQuery({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getFollowingIds('my-user');

    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: { message: 'fail' },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(getFollowingIds('my-user')).rejects.toEqual({
      message: 'fail',
    });
  });
});

describe('fetchFollowingFeed', () => {
  it('returns empty array for empty followingIds', async () => {
    const result = await fetchFollowingFeed([]);

    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('queries with correct filters for following feed', async () => {
    const chain = mockSupabaseQuery({
      data: [
        {
          id: 'ft-1',
          user_id: 'u1',
          tmdb_id: 100,
          movie_title: 'Movie A',
          poster_path: '/a.jpg',
          rating: 7,
          quote_text: 'Nice!',
          is_spoiler: false,
          visibility: 'public',
          created_at: '2024-01-01T00:00:00Z',
          profiles: {
            full_name: 'User One',
            username: 'userone',
            avatar_url: null,
          },
        },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchFollowingFeed(['u1', 'u2']);

    expect(supabase.from).toHaveBeenCalledWith('first_takes');
    expect(chain.in).toHaveBeenCalledWith('user_id', ['u1', 'u2']);
    expect(chain.in).toHaveBeenCalledWith('visibility', [
      'public',
      'followers_only',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ft-1');
    expect(result[0].userId).toBe('u1');
  });
});

describe('fetchCommunityFeedPage', () => {
  it('excludes followed users and self', async () => {
    const chain = mockSupabaseQuery({
      data: [],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await fetchCommunityFeedPage('me', ['u1', 'u2']);

    expect(supabase.from).toHaveBeenCalledWith('first_takes');
    expect(chain.not).toHaveBeenCalledWith(
      'user_id',
      'in',
      '(u1,u2,me)'
    );
    expect(chain.eq).toHaveBeenCalledWith('visibility', 'public');
  });

  it('applies cursor when provided', async () => {
    const chain = mockSupabaseQuery({
      data: [],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await fetchCommunityFeedPage('me', ['u1'], '2024-01-01T00:00:00Z');

    expect(chain.lt).toHaveBeenCalledWith(
      'created_at',
      '2024-01-01T00:00:00Z'
    );
  });

  it('returns null nextCursor when fewer items than PAGE_SIZE', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `ft-${i}`,
      user_id: `u-${i}`,
      tmdb_id: i,
      movie_title: `Movie ${i}`,
      poster_path: null,
      rating: null,
      quote_text: 'Quote',
      is_spoiler: false,
      visibility: 'public',
      created_at: '2024-01-01T00:00:00Z',
      profiles: { full_name: `User ${i}`, username: null, avatar_url: null },
    }));

    const chain = mockSupabaseQuery({ data: rows, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchCommunityFeedPage('me', []);

    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(5);
  });
});

describe('getFeedLastSeen', () => {
  it('returns feed_last_seen_at value', async () => {
    const chain = mockSupabaseQuery({
      data: { feed_last_seen_at: '2024-01-01' },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getFeedLastSeen('user-1');

    expect(result).toBe('2024-01-01');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(chain.single).toHaveBeenCalled();
  });

  it('returns null when not set', async () => {
    const chain = mockSupabaseQuery({
      data: { feed_last_seen_at: null },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getFeedLastSeen('user-1');

    expect(result).toBeNull();
  });
});

describe('updateFeedLastSeen', () => {
  it('calls update with current timestamp', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const userId = 'user-1';
    await updateFeedLastSeen(userId);

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        feed_last_seen_at: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        ),
      })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', userId);
  });
});
