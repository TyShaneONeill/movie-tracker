jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { mockSupabaseQuery } from '@/__tests__/fixtures';
import {
  createList,
  updateList,
  deleteList,
  getList,
  getListWithMovies,
  getUserLists,
  addMovieToList,
  removeMovieFromList,
  updateListItemNotes,
  reorderListMovies,
} from '@/lib/list-service';

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// Fixtures
// ============================================================================

const fakeList = {
  id: 'list-1',
  user_id: 'user-1',
  name: 'My Favorites',
  description: 'Best movies ever',
  is_public: false,
  cover_image_url: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const fakeMovie = (position: number, tmdbId = 550) => ({
  id: `item-${position}`,
  list_id: 'list-1',
  tmdb_id: tmdbId,
  title: 'Fight Club',
  poster_path: '/poster.jpg',
  position,
  notes: null,
  added_at: '2025-01-01T00:00:00Z',
});

// ============================================================================
// createList
// ============================================================================

describe('createList', () => {
  it('creates and returns a new list', async () => {
    const chain = mockSupabaseQuery({ data: fakeList, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await createList('user-1', 'My Favorites', 'Best movies ever');

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'My Favorites',
      description: 'Best movies ever',
      is_public: false,
    });
    expect(chain.select).toHaveBeenCalled();
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(fakeList);
  });

  it('throws on error', async () => {
    const error = { message: 'insert failed', code: 'PGRST000' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(createList('user-1', 'My List')).rejects.toEqual(error);
  });
});

// ============================================================================
// updateList
// ============================================================================

describe('updateList', () => {
  it('updates and returns the list', async () => {
    const updated = { ...fakeList, name: 'Renamed' };
    const chain = mockSupabaseQuery({ data: updated, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await updateList('list-1', { name: 'Renamed' });

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Renamed', updated_at: expect.any(String) })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'list-1');
    expect(chain.select).toHaveBeenCalled();
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  it('throws on error', async () => {
    const error = { message: 'update failed' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(updateList('list-1', { name: 'X' })).rejects.toEqual(error);
  });
});

// ============================================================================
// deleteList
// ============================================================================

describe('deleteList', () => {
  it('deletes the list', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await deleteList('list-1');

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'list-1');
  });

  it('throws on error', async () => {
    const error = { message: 'delete failed' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(deleteList('list-1')).rejects.toEqual(error);
  });
});

// ============================================================================
// getList
// ============================================================================

describe('getList', () => {
  it('returns a list by id', async () => {
    const chain = mockSupabaseQuery({ data: fakeList, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getList('list-1');

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', 'list-1');
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(fakeList);
  });

  it('throws on error', async () => {
    const error = { message: 'not found' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(getList('list-1')).rejects.toEqual(error);
  });
});

// ============================================================================
// getListWithMovies
// ============================================================================

describe('getListWithMovies', () => {
  it('returns list with sorted movies and count', async () => {
    const movies = [fakeMovie(2, 100), fakeMovie(0, 200), fakeMovie(1, 300)];
    const listData = { ...fakeList, list_movies: movies };
    const chain = mockSupabaseQuery({ data: listData, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getListWithMovies('list-1');

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.select).toHaveBeenCalledWith('*, list_movies(*)');
    expect(chain.eq).toHaveBeenCalledWith('id', 'list-1');
    expect(chain.single).toHaveBeenCalled();

    // Movies sorted by position
    expect(result.movies[0].tmdb_id).toBe(200);
    expect(result.movies[1].tmdb_id).toBe(300);
    expect(result.movies[2].tmdb_id).toBe(100);
    expect(result.movie_count).toBe(3);
  });

  it('returns empty movies array when list has no movies', async () => {
    const listData = { ...fakeList, list_movies: null };
    const chain = mockSupabaseQuery({ data: listData, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getListWithMovies('list-1');

    expect(result.movies).toEqual([]);
    expect(result.movie_count).toBe(0);
  });
});

// ============================================================================
// getUserLists
// ============================================================================

describe('getUserLists', () => {
  it('returns transformed lists with movie previews', async () => {
    const movies = [
      fakeMovie(0, 100),
      fakeMovie(1, 200),
      fakeMovie(2, 300),
      fakeMovie(3, 400),
      fakeMovie(4, 500),
    ];
    const lists = [{ ...fakeList, list_movies: movies }];
    const chain = mockSupabaseQuery({ data: lists, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getUserLists('user-1');

    expect(supabase.from).toHaveBeenCalledWith('user_lists');
    expect(chain.select).toHaveBeenCalledWith(
      '*, list_movies(id, list_id, tmdb_id, title, poster_path, position, added_at)'
    );
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false });

    // Sliced to first 4 movies
    expect(result[0].movies).toHaveLength(4);
    // Total count reflects all movies
    expect(result[0].movie_count).toBe(5);
  });

  it('returns empty array when no lists', async () => {
    const chain = mockSupabaseQuery({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await getUserLists('user-1');

    expect(result).toEqual([]);
  });
});

// ============================================================================
// addMovieToList
// ============================================================================

describe('addMovieToList', () => {
  it('adds movie with next position', async () => {
    // First call: query max position
    const positionChain = mockSupabaseQuery({
      data: [{ position: 2 }],
      error: null,
    });

    // Second call: insert the movie
    const insertedMovie = fakeMovie(3, 550);
    const insertChain = mockSupabaseQuery({ data: insertedMovie, error: null });

    // Third call: touchListUpdatedAt
    const touchChain = mockSupabaseQuery({ data: null, error: null });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(positionChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(touchChain);

    const result = await addMovieToList('list-1', 550, 'Fight Club', '/poster.jpg', 'Great film');

    // Verify position query
    expect((supabase.from as jest.Mock).mock.calls[0][0]).toBe('list_movies');
    expect(positionChain.select).toHaveBeenCalledWith('position');
    expect(positionChain.eq).toHaveBeenCalledWith('list_id', 'list-1');
    expect(positionChain.order).toHaveBeenCalledWith('position', { ascending: false });
    expect(positionChain.limit).toHaveBeenCalledWith(1);

    // Verify insert
    expect((supabase.from as jest.Mock).mock.calls[1][0]).toBe('list_movies');
    expect(insertChain.insert).toHaveBeenCalledWith({
      list_id: 'list-1',
      tmdb_id: 550,
      title: 'Fight Club',
      poster_path: '/poster.jpg',
      position: 3,
      notes: 'Great film',
      media_type: 'movie',
    });
    expect(insertChain.select).toHaveBeenCalled();
    expect(insertChain.single).toHaveBeenCalled();

    expect(result).toEqual(insertedMovie);
  });

  it('throws ALREADY_IN_LIST on unique violation', async () => {
    const positionChain = mockSupabaseQuery({ data: [], error: null });
    const insertChain = mockSupabaseQuery({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(positionChain)
      .mockReturnValueOnce(insertChain);

    await expect(
      addMovieToList('list-1', 550, 'Fight Club', '/poster.jpg')
    ).rejects.toThrow('ALREADY_IN_LIST');
  });

  it('throws on other errors', async () => {
    const positionChain = mockSupabaseQuery({ data: [], error: null });
    const error = { code: 'PGRST000', message: 'something broke' };
    const insertChain = mockSupabaseQuery({ data: null, error });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(positionChain)
      .mockReturnValueOnce(insertChain);

    await expect(
      addMovieToList('list-1', 550, 'Fight Club', '/poster.jpg')
    ).rejects.toEqual(error);
  });
});

// ============================================================================
// removeMovieFromList
// ============================================================================

describe('removeMovieFromList', () => {
  it('removes movie from list', async () => {
    const deleteChain = mockSupabaseQuery({ data: null, error: null });
    const touchChain = mockSupabaseQuery({ data: null, error: null });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(deleteChain)
      .mockReturnValueOnce(touchChain);

    await removeMovieFromList('list-1', 550);

    expect((supabase.from as jest.Mock).mock.calls[0][0]).toBe('list_movies');
    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('list_id', 'list-1');
    expect(deleteChain.eq).toHaveBeenCalledWith('tmdb_id', 550);

    // Verify touchListUpdatedAt was called
    expect((supabase.from as jest.Mock).mock.calls[1][0]).toBe('user_lists');
  });

  it('throws on error', async () => {
    const error = { message: 'delete failed' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(removeMovieFromList('list-1', 550)).rejects.toEqual(error);
  });
});

// ============================================================================
// updateListItemNotes
// ============================================================================

describe('updateListItemNotes', () => {
  it('updates notes for a list item', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await updateListItemNotes('item-1', 'Updated notes');

    expect(supabase.from).toHaveBeenCalledWith('list_movies');
    expect(chain.update).toHaveBeenCalledWith({ notes: 'Updated notes' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('throws on error', async () => {
    const error = { message: 'update failed' };
    const chain = mockSupabaseQuery({ data: null, error });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(updateListItemNotes('item-1', 'notes')).rejects.toEqual(error);
  });
});

// ============================================================================
// reorderListMovies
// ============================================================================

describe('reorderListMovies', () => {
  it('updates positions for all movies', async () => {
    // One chain per tmdbId + one for touchListUpdatedAt
    const chains = [100, 200, 300].map(() =>
      mockSupabaseQuery({ data: null, error: null })
    );
    const touchChain = mockSupabaseQuery({ data: null, error: null });

    (supabase.from as jest.Mock)
      .mockReturnValueOnce(chains[0])
      .mockReturnValueOnce(chains[1])
      .mockReturnValueOnce(chains[2])
      .mockReturnValueOnce(touchChain);

    await reorderListMovies('list-1', [100, 200, 300]);

    // Verify each movie got its position updated
    expect(supabase.from).toHaveBeenCalledTimes(4); // 3 updates + 1 touch

    for (let i = 0; i < 3; i++) {
      expect((supabase.from as jest.Mock).mock.calls[i][0]).toBe('list_movies');
      expect(chains[i].update).toHaveBeenCalledWith({ position: i });
      expect(chains[i].eq).toHaveBeenCalledWith('list_id', 'list-1');
      expect(chains[i].eq).toHaveBeenCalledWith('tmdb_id', [100, 200, 300][i]);
    }

    // Verify touchListUpdatedAt
    expect((supabase.from as jest.Mock).mock.calls[3][0]).toBe('user_lists');
  });
});
