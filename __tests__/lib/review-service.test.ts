import { createReview, getReviewByTmdbId, updateReview, deleteReview } from '@/lib/review-service';

const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelect = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockUpdate = jest.fn(() => ({ eq: jest.fn(() => ({ select: jest.fn(() => ({ single: mockSingle })) })) }));
const mockDeleteEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));
const mockEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: mockMaybeSingle,
            })),
          })),
        })),
      })),
    })),
  },
}));

const makeReviewData = (overrides?: Record<string, unknown>) => ({
  tmdbId: 550,
  movieTitle: 'Fight Club',
  posterPath: '/poster.jpg',
  title: 'A masterpiece of cinema',
  reviewText: 'This movie changed how I think about consumer culture.',
  rating: 9,
  isSpoiler: false,
  isRewatch: false,
  visibility: 'public' as const,
  ...overrides,
});

describe('createReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a review successfully', async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'rev-1',
        user_id: 'user-1',
        tmdb_id: 550,
        movie_title: 'Fight Club',
        title: 'A masterpiece of cinema',
        review_text: 'This movie changed how I think about consumer culture.',
        rating: 9,
        is_spoiler: false,
        is_rewatch: false,
        visibility: 'public',
      },
      error: null,
    });

    const result = await createReview('user-1', makeReviewData());
    expect(result).toBeDefined();
    expect(result.id).toBe('rev-1');
  });

  it('trims title and review text before inserting', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'rev-1', title: 'trimmed', review_text: 'trimmed' },
      error: null,
    });

    await createReview('user-1', makeReviewData({
      title: '  A masterpiece  ',
      reviewText: '  Great movie!  ',
    }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'A masterpiece',
        review_text: 'Great movie!',
      })
    );
  });

  it('throws DUPLICATE_REVIEW on unique constraint violation', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });

    await expect(createReview('user-1', makeReviewData())).rejects.toThrow('DUPLICATE_REVIEW');
  });

  it('throws on other errors', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '42000', message: 'Something went wrong' },
    });

    await expect(createReview('user-1', makeReviewData())).rejects.toThrow('Something went wrong');
  });
});

describe('getReviewByTmdbId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a review when found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: 'rev-1', tmdb_id: 550 },
      error: null,
    });

    const result = await getReviewByTmdbId('user-1', 550);
    expect(result).toBeDefined();
    expect(result?.id).toBe('rev-1');
  });

  it('returns null when no review found', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await getReviewByTmdbId('user-1', 999);
    expect(result).toBeNull();
  });
});

describe('deleteReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes successfully', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: null });

    await expect(deleteReview('rev-1')).resolves.toBeUndefined();
  });

  it('throws on error', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: { message: 'Not found' } });

    await expect(deleteReview('rev-1')).rejects.toThrow('Not found');
  });
});
