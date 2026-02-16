jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { mockSupabaseQuery } from '@/__tests__/fixtures';
import {
  hasLikedWatchlist,
  getWatchlistLikeCount,
  likeWatchlist,
  unlikeWatchlist,
  getWatchlistComments,
  addWatchlistComment,
  deleteWatchlistComment,
} from '@/lib/watchlist-social-service';

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hasLikedWatchlist', () => {
  it('returns true when like exists', async () => {
    const chain = mockSupabaseQuery({
      data: { user_id: 'u1' },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await hasLikedWatchlist('u1', 'owner-1');

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('watchlist_likes');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(chain.eq).toHaveBeenCalledWith('owner_id', 'owner-1');
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('returns false when no like exists', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await hasLikedWatchlist('u1', 'owner-1');

    expect(result).toBe(false);
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: { message: 'fail' },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(hasLikedWatchlist('u1', 'owner-1')).rejects.toEqual({
      message: 'fail',
    });
  });
});

describe('getWatchlistLikeCount', () => {
  it('returns count', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    // The service destructures { count, error } from the awaited result,
    // so we need the thenable to resolve with { count: 5, error: null }.
    (chain as any).then = (resolve: (v: unknown) => void) =>
      resolve({ count: 5, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getWatchlistLikeCount('owner-1');

    expect(result).toBe(5);
    expect(supabase.from).toHaveBeenCalledWith('watchlist_likes');
    expect(chain.select).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    });
    expect(chain.eq).toHaveBeenCalledWith('owner_id', 'owner-1');
  });

  it('returns 0 when null count', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    (chain as any).then = (resolve: (v: unknown) => void) =>
      resolve({ count: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getWatchlistLikeCount('owner-1');

    expect(result).toBe(0);
  });
});

describe('likeWatchlist', () => {
  it('inserts like row', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await likeWatchlist('u1', 'owner-1');

    expect(supabase.from).toHaveBeenCalledWith('watchlist_likes');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      owner_id: 'owner-1',
    });
  });

  it('throws ALREADY_LIKED on unique violation', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(likeWatchlist('u1', 'owner-1')).rejects.toThrow(
      'ALREADY_LIKED'
    );
  });

  it('throws on other errors', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: { code: '42P01', message: 'bad' },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(likeWatchlist('u1', 'owner-1')).rejects.toEqual({
      code: '42P01',
      message: 'bad',
    });
  });
});

describe('unlikeWatchlist', () => {
  it('deletes like row', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await unlikeWatchlist('u1', 'owner-1');

    expect(supabase.from).toHaveBeenCalledWith('watchlist_likes');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(chain.eq).toHaveBeenCalledWith('owner_id', 'owner-1');
  });

  it('throws on error', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: { message: 'delete failed' },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(unlikeWatchlist('u1', 'owner-1')).rejects.toEqual({
      message: 'delete failed',
    });
  });
});

describe('getWatchlistComments', () => {
  it('returns comments with profiles', async () => {
    const mockComments = [
      {
        id: 'c1',
        owner_id: 'o1',
        user_id: 'u1',
        text: 'Nice!',
        created_at: '2024-01-01T00:00:00Z',
        profiles: {
          full_name: 'Alice',
          username: 'alice',
          avatar_url: '/a.jpg',
        },
      },
    ];
    const chain = mockSupabaseQuery({
      data: mockComments,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getWatchlistComments('o1');

    expect(result).toEqual(mockComments);
    expect(supabase.from).toHaveBeenCalledWith('watchlist_comments');
    expect(chain.eq).toHaveBeenCalledWith('owner_id', 'o1');
    expect(chain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('returns empty array when no comments', async () => {
    const chain = mockSupabaseQuery({
      data: [],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getWatchlistComments('o1');

    expect(result).toEqual([]);
  });
});

describe('addWatchlistComment', () => {
  it('inserts and returns comment with profile', async () => {
    const mockComment = {
      id: 'new-1',
      owner_id: 'o1',
      user_id: 'u1',
      text: 'Great picks!',
      created_at: '2024-01-01',
      profiles: {
        full_name: 'Bob',
        username: 'bob',
        avatar_url: null,
      },
    };
    const chain = mockSupabaseQuery({
      data: mockComment,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await addWatchlistComment('u1', 'o1', 'Great picks!');

    expect(result).toEqual(mockComment);
    expect(supabase.from).toHaveBeenCalledWith('watchlist_comments');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      owner_id: 'o1',
      text: 'Great picks!',
    });
    expect(chain.select).toHaveBeenCalledWith(
      '*, profiles(full_name, username, avatar_url)'
    );
    expect(chain.single).toHaveBeenCalled();
  });
});

describe('deleteWatchlistComment', () => {
  it('deletes comment by id', async () => {
    const chain = mockSupabaseQuery({
      data: null,
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await deleteWatchlistComment('c1');

    expect(supabase.from).toHaveBeenCalledWith('watchlist_comments');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
  });
});
