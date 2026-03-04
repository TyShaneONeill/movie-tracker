import '../setup';
import { makeRatingsResponse } from '../fixtures';
import { fetchExternalRatings } from '@/lib/ratings-service';

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

// Import after mock
import { supabase } from '@/lib/supabase';

const mockInvoke = supabase.functions.invoke as jest.Mock;

describe('fetchExternalRatings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ratings when edge function succeeds', async () => {
    const response = makeRatingsResponse();
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await fetchExternalRatings(550);

    expect(mockInvoke).toHaveBeenCalledWith('get-movie-ratings', {
      body: { tmdb_id: 550 },
    });
    expect(result).toEqual(response);
    expect(result.ratings?.imdb?.rating).toBe(8.8);
    expect(result.ratings?.rottenTomatoes?.score).toBe(94);
    expect(result.ratings?.metacritic?.score).toBe(84);
    expect(result.source).toBe('omdb');
  });

  it('returns cached ratings when source is cache', async () => {
    const response = makeRatingsResponse({ source: 'cache' });
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await fetchExternalRatings(27205);

    expect(result.source).toBe('cache');
    expect(result.ratings).toBeDefined();
  });

  it('returns unavailable response with null ratings', async () => {
    const response = makeRatingsResponse({ ratings: null, source: 'unavailable' });
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await fetchExternalRatings(999);

    expect(result.ratings).toBeNull();
    expect(result.source).toBe('unavailable');
  });

  it('throws when edge function returns error with message', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'TMDB ID not found' },
    });

    await expect(fetchExternalRatings(0)).rejects.toThrow('TMDB ID not found');
  });

  it('throws generic message when edge function returns error without message', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {},
    });

    await expect(fetchExternalRatings(0)).rejects.toThrow(
      'Failed to fetch external ratings'
    );
  });

  it('throws when edge function returns no data', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(fetchExternalRatings(550)).rejects.toThrow(
      'No data returned from external ratings'
    );
  });
});
