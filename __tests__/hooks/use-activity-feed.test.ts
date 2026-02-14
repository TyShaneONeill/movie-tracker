import type {
  FirstTakeWithProfile,
  ActivityFeedItem,
} from '@/hooks/use-activity-feed';

import {
  mapToFeedItem,
  ACTIVITY_FEED_SELECT,
} from '@/hooks/use-activity-feed';

// ============================================================================
// Test Data Factory
// ============================================================================

function makeRow(overrides?: Partial<FirstTakeWithProfile>): FirstTakeWithProfile {
  return {
    id: 'ft-1',
    user_id: 'user-1',
    tmdb_id: 123,
    movie_title: 'Test Movie',
    poster_path: '/poster.jpg',
    rating: 8,
    quote_text: 'Great movie!',
    is_spoiler: false,
    created_at: '2024-01-01T00:00:00Z',
    profiles: {
      full_name: 'John Doe',
      username: 'johndoe',
      avatar_url: 'https://example.com/avatar.jpg',
    },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ACTIVITY_FEED_SELECT', () => {
  it('is a single JOINed select string with profiles', () => {
    expect(ACTIVITY_FEED_SELECT).toBe(
      'id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, created_at, profiles(full_name, username, avatar_url)'
    );
  });
});

describe('mapToFeedItem', () => {
  it('maps all fields from snake_case to camelCase', () => {
    const result = mapToFeedItem(makeRow());

    expect(result).toEqual<ActivityFeedItem>({
      id: 'ft-1',
      userId: 'user-1',
      tmdbId: 123,
      movieTitle: 'Test Movie',
      posterPath: '/poster.jpg',
      rating: 8,
      quoteText: 'Great movie!',
      isSpoiler: false,
      createdAt: '2024-01-01T00:00:00Z',
      userDisplayName: 'John Doe',
      userAvatarUrl: 'https://example.com/avatar.jpg',
    });
  });

  it.each([
    {
      desc: 'uses full_name when both present',
      profiles: { full_name: 'Jane', username: 'jane', avatar_url: null },
      expected: 'Jane',
    },
    {
      desc: 'falls back to username when full_name is null',
      profiles: { full_name: null, username: 'jane', avatar_url: null },
      expected: 'jane',
    },
    {
      desc: 'falls back to username when full_name is empty',
      profiles: { full_name: '', username: 'jane', avatar_url: null },
      expected: 'jane',
    },
    {
      desc: 'falls back to Anonymous when both are null',
      profiles: { full_name: null, username: null, avatar_url: null },
      expected: 'Anonymous',
    },
    {
      desc: 'falls back to Anonymous when profiles is null',
      profiles: null,
      expected: 'Anonymous',
    },
  ])('display name: $desc', ({ profiles, expected }) => {
    expect(mapToFeedItem(makeRow({ profiles })).userDisplayName).toBe(expected);
  });

  it('passes through avatar_url or null', () => {
    expect(mapToFeedItem(makeRow()).userAvatarUrl).toBe('https://example.com/avatar.jpg');
    expect(mapToFeedItem(makeRow({ profiles: null })).userAvatarUrl).toBeNull();
    expect(
      mapToFeedItem(makeRow({ profiles: { full_name: 'X', username: null, avatar_url: null } })).userAvatarUrl
    ).toBeNull();
  });

  it('preserves null for nullable fields', () => {
    const result = mapToFeedItem(makeRow({
      rating: null,
      poster_path: null,
      created_at: null,
      is_spoiler: null,
    }));

    expect(result.rating).toBeNull();
    expect(result.posterPath).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.isSpoiler).toBeNull();
  });

  it('maps a batch with mixed profile states', () => {
    const results = [
      makeRow({ id: 'a', profiles: { full_name: 'Alice', username: 'alice', avatar_url: '/a.jpg' } }),
      makeRow({ id: 'b', profiles: { full_name: null, username: 'bob', avatar_url: null } }),
      makeRow({ id: 'c', profiles: null }),
    ].map(mapToFeedItem);

    expect(results.map((r) => r.userDisplayName)).toEqual(['Alice', 'bob', 'Anonymous']);
    expect(results.map((r) => r.userAvatarUrl)).toEqual(['/a.jpg', null, null]);
  });
});
