import { createFirstTake } from '@/lib/first-take-service';

// Mock supabase before importing the module
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() =>
            Promise.resolve({
              data: {
                id: 'ft-1',
                user_id: 'user-1',
                tmdb_id: 123,
                movie_title: 'Test Movie',
                poster_path: '/poster.jpg',
                reaction_emoji: '🎬',
                quote_text: 'Great movie!',
                is_spoiler: false,
                rating: 8,
                visibility: 'public',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              },
              error: null,
            })
          ),
        })),
      })),
    })),
  },
}));

const makeCreateData = (overrides?: Record<string, unknown>) => ({
  tmdbId: 123,
  movieTitle: 'Test Movie',
  posterPath: '/poster.jpg',
  reactionEmoji: '🎬',
  quoteText: 'Great movie!',
  isSpoiler: false,
  rating: 8,
  ...overrides,
});

describe('createFirstTake', () => {
  it('rejects empty quote text', async () => {
    await expect(createFirstTake('user-1', makeCreateData({ quoteText: '' }))).rejects.toThrow(
      'Quote text cannot be empty'
    );
  });

  it('rejects whitespace-only quote text', async () => {
    await expect(createFirstTake('user-1', makeCreateData({ quoteText: '   ' }))).rejects.toThrow(
      'Quote text cannot be empty'
    );
  });

  it('trims quote text before inserting', async () => {
    const { supabase } = require('@/lib/supabase');
    const mockInsert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() =>
          Promise.resolve({
            data: { id: 'ft-1', quote_text: 'Great movie!' },
            error: null,
          })
        ),
      })),
    }));
    (supabase.from as jest.Mock).mockReturnValue({ insert: mockInsert });

    await createFirstTake('user-1', makeCreateData({ quoteText: '  Great movie!  ' }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ quote_text: 'Great movie!' })
    );
  });

  it('accepts valid quote text', async () => {
    const result = await createFirstTake('user-1', makeCreateData());
    expect(result).toBeDefined();
  });
});
