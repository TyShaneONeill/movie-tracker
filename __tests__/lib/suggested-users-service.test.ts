import '../setup';
import { fetchSuggestedUsers, type SuggestedUser } from '@/lib/suggested-users-service';
import { captureException } from '@/lib/sentry';

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

function makeSuggestedUser(overrides: Partial<SuggestedUser> = {}): SuggestedUser {
  return {
    id: 'user-1',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    followersCount: 10,
    reason: 'Followed by @alice',
    reasonType: 'mutual_followers',
    score: 5,
    ...overrides,
  };
}

const mockInvoke = supabase.functions.invoke as jest.Mock;

describe('fetchSuggestedUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns suggestions on success', async () => {
    const suggestions = [makeSuggestedUser(), makeSuggestedUser({ id: 'user-2', username: 'other' })];
    mockInvoke.mockResolvedValue({ data: { suggestions }, error: null });

    const result = await fetchSuggestedUsers();

    expect(mockInvoke).toHaveBeenCalledWith('get-suggested-users');
    expect(result).toEqual(suggestions);
  });

  it('returns empty array when no suggestions', async () => {
    mockInvoke.mockResolvedValue({ data: { suggestions: [] }, error: null });

    const result = await fetchSuggestedUsers();

    expect(result).toEqual([]);
  });

  it('throws and reports to Sentry on error with message', async () => {
    const error = { message: 'Server error' };
    mockInvoke.mockResolvedValue({ data: null, error });

    await expect(fetchSuggestedUsers()).rejects.toThrow('Server error');
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { context: 'fetch-suggested-users' }
    );
  });

  it('throws generic message on error without message', async () => {
    const error = {};
    mockInvoke.mockResolvedValue({ data: null, error });

    await expect(fetchSuggestedUsers()).rejects.toThrow('Failed to fetch suggested users');
  });

  it('throws on null data', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(fetchSuggestedUsers()).rejects.toThrow('No data returned from suggested users');
  });
});
