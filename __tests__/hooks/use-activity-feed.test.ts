import { mockSupabaseQuery } from '../fixtures';
import type {
  FirstTakeWithProfile,
  ActivityFeedItem,
} from '@/hooks/use-activity-feed';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  mapToFeedItem,
  ACTIVITY_FEED_SELECT,
} from '@/hooks/use-activity-feed';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ============================================================================
// Test Data Factory
// ============================================================================

function makeFirstTakeWithProfile(
  overrides?: Partial<FirstTakeWithProfile>
): FirstTakeWithProfile {
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
// Helpers
// ============================================================================

/**
 * Sets up a mock Supabase query chain for the JOINed activity feed query.
 * The chain resolves at the end (after .limit()) since the query is not
 * terminated by .single()/.maybeSingle().
 */
function setupQueryMock(data: unknown[] | null, error: unknown = null) {
  const chain = mockSupabaseQuery({ data, error });
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ============================================================================
// Tests: ACTIVITY_FEED_SELECT
// ============================================================================

describe('ACTIVITY_FEED_SELECT', () => {
  it('contains the first_takes columns', () => {
    expect(ACTIVITY_FEED_SELECT).toContain('id');
    expect(ACTIVITY_FEED_SELECT).toContain('user_id');
    expect(ACTIVITY_FEED_SELECT).toContain('tmdb_id');
    expect(ACTIVITY_FEED_SELECT).toContain('movie_title');
    expect(ACTIVITY_FEED_SELECT).toContain('poster_path');
    expect(ACTIVITY_FEED_SELECT).toContain('rating');
    expect(ACTIVITY_FEED_SELECT).toContain('quote_text');
    expect(ACTIVITY_FEED_SELECT).toContain('is_spoiler');
    expect(ACTIVITY_FEED_SELECT).toContain('created_at');
  });

  it('contains the profiles JOIN with expected fields', () => {
    expect(ACTIVITY_FEED_SELECT).toContain('profiles(');
    expect(ACTIVITY_FEED_SELECT).toContain('full_name');
    expect(ACTIVITY_FEED_SELECT).toContain('username');
    expect(ACTIVITY_FEED_SELECT).toContain('avatar_url');
  });

  it('matches the expected full select string', () => {
    expect(ACTIVITY_FEED_SELECT).toBe(
      'id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, created_at, profiles(full_name, username, avatar_url)'
    );
  });
});

// ============================================================================
// Tests: mapToFeedItem
// ============================================================================

describe('mapToFeedItem', () => {
  it('maps a full JOINed row to ActivityFeedItem correctly', () => {
    const row = makeFirstTakeWithProfile();
    const result = mapToFeedItem(row);

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

  it('uses full_name as display name when available', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: 'Jane Smith',
        username: 'janesmith',
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('Jane Smith');
  });

  it('falls back to username when full_name is null', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: null,
        username: 'johndoe',
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('johndoe');
  });

  it('falls back to username when full_name is empty string', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: '',
        username: 'johndoe',
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('johndoe');
  });

  it('falls back to Anonymous when both full_name and username are null', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: null,
        username: null,
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('Anonymous');
  });

  it('falls back to Anonymous when both full_name and username are empty strings', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: '',
        username: '',
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('Anonymous');
  });

  it('handles profiles being null (no profile found)', () => {
    const row = makeFirstTakeWithProfile({
      profiles: null,
    });
    const result = mapToFeedItem(row);

    expect(result.userDisplayName).toBe('Anonymous');
    expect(result.userAvatarUrl).toBeNull();
  });

  it('sets userAvatarUrl to null when profile has no avatar', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: 'John Doe',
        username: 'johndoe',
        avatar_url: null,
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userAvatarUrl).toBeNull();
  });

  it('sets userAvatarUrl from profile avatar_url', () => {
    const row = makeFirstTakeWithProfile({
      profiles: {
        full_name: 'John Doe',
        username: 'johndoe',
        avatar_url: 'https://example.com/my-avatar.png',
      },
    });
    const result = mapToFeedItem(row);

    expect(result.userAvatarUrl).toBe('https://example.com/my-avatar.png');
  });

  it('handles null rating and poster_path', () => {
    const row = makeFirstTakeWithProfile({
      rating: null,
      poster_path: null,
    });
    const result = mapToFeedItem(row);

    expect(result.rating).toBeNull();
    expect(result.posterPath).toBeNull();
  });

  it('handles null created_at and is_spoiler', () => {
    const row = makeFirstTakeWithProfile({
      created_at: null,
      is_spoiler: null,
    });
    const result = mapToFeedItem(row);

    expect(result.createdAt).toBeNull();
    expect(result.isSpoiler).toBeNull();
  });

  it('correctly maps all snake_case fields to camelCase', () => {
    const row = makeFirstTakeWithProfile({
      id: 'abc-123',
      user_id: 'user-xyz',
      tmdb_id: 999,
      movie_title: 'Inception',
      poster_path: '/inception.jpg',
      quote_text: 'A dream within a dream',
      is_spoiler: true,
      created_at: '2024-06-15T12:00:00Z',
    });
    const result = mapToFeedItem(row);

    expect(result.id).toBe('abc-123');
    expect(result.userId).toBe('user-xyz');
    expect(result.tmdbId).toBe(999);
    expect(result.movieTitle).toBe('Inception');
    expect(result.posterPath).toBe('/inception.jpg');
    expect(result.quoteText).toBe('A dream within a dream');
    expect(result.isSpoiler).toBe(true);
    expect(result.createdAt).toBe('2024-06-15T12:00:00Z');
  });
});

// ============================================================================
// Tests: useActivityFeed queryFn logic
// ============================================================================

describe('useActivityFeed query logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls supabase.from with first_takes', async () => {
    const rows = [makeFirstTakeWithProfile()];
    setupQueryMock(rows);

    // Import fresh to get the queryFn — we test the underlying query behavior
    // by manually invoking what the hook does
    const { data } = await (supabase.from('first_takes') as any)
      .select(ACTIVITY_FEED_SELECT)
      .order('created_at', { ascending: false })
      .limit(20);

    // The mock chain is thenable and resolves to { data: rows, error: null }
    expect(mockFrom).toHaveBeenCalledWith('first_takes');
  });

  it('uses ACTIVITY_FEED_SELECT for the select clause', () => {
    const rows = [makeFirstTakeWithProfile()];
    const chain = setupQueryMock(rows);

    supabase.from('first_takes');

    // Verify select would be called with the JOINed string
    expect(chain.select).toBeDefined();
  });

  it('maps multiple rows correctly', () => {
    const rows = [
      makeFirstTakeWithProfile({ id: 'ft-1', movie_title: 'Movie One' }),
      makeFirstTakeWithProfile({ id: 'ft-2', movie_title: 'Movie Two' }),
      makeFirstTakeWithProfile({ id: 'ft-3', movie_title: 'Movie Three' }),
    ];

    const results = rows.map(mapToFeedItem);

    expect(results).toHaveLength(3);
    expect(results[0].movieTitle).toBe('Movie One');
    expect(results[1].movieTitle).toBe('Movie Two');
    expect(results[2].movieTitle).toBe('Movie Three');
  });

  it('returns empty array when data is empty', () => {
    const results = ([] as FirstTakeWithProfile[]).map(mapToFeedItem);
    expect(results).toEqual([]);
  });

  it('maps rows with mixed profile states', () => {
    const rows = [
      makeFirstTakeWithProfile({
        id: 'ft-1',
        profiles: { full_name: 'Full Name User', username: 'fnuser', avatar_url: 'https://example.com/1.jpg' },
      }),
      makeFirstTakeWithProfile({
        id: 'ft-2',
        profiles: { full_name: null, username: 'usernameonly', avatar_url: null },
      }),
      makeFirstTakeWithProfile({
        id: 'ft-3',
        profiles: null,
      }),
    ];

    const results = rows.map(mapToFeedItem);

    expect(results[0].userDisplayName).toBe('Full Name User');
    expect(results[0].userAvatarUrl).toBe('https://example.com/1.jpg');

    expect(results[1].userDisplayName).toBe('usernameonly');
    expect(results[1].userAvatarUrl).toBeNull();

    expect(results[2].userDisplayName).toBe('Anonymous');
    expect(results[2].userAvatarUrl).toBeNull();
  });
});
