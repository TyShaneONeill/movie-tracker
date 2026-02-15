import { mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));

import {
  fetchAchievements,
  fetchUserAchievements,
  checkAchievements,
} from '@/lib/achievement-service';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import type { Achievement } from '@/lib/database.types';

// Get references to the mock functions from the mocked module
const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

const USER_ID = 'user-abc-123';

const makeAchievement = (overrides?: Partial<Achievement>): Achievement => ({
  id: 'ach-1',
  name: 'First Take',
  description: 'Post your first review',
  icon: '🎬',
  criteria_type: 'first_take_count',
  criteria_value: 1,
  sort_order: 1,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeUserAchievementRow = (overrides?: Record<string, unknown>) => ({
  user_id: USER_ID,
  achievement_id: 'ach-1',
  unlocked_at: '2024-06-15T12:00:00Z',
  achievement: makeAchievement(),
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// ----------------------------------------------------------------------------
// fetchAchievements
// ----------------------------------------------------------------------------

describe('fetchAchievements', () => {
  it('returns achievements ordered by sort_order', async () => {
    const achievements = [
      makeAchievement(),
      makeAchievement({ id: 'ach-2', name: 'Cinephile', sort_order: 2 }),
    ];
    const chain = mockSupabaseQuery({ data: achievements, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchAchievements();

    expect(mockFrom).toHaveBeenCalledWith('achievements');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.order).toHaveBeenCalledWith('sort_order');
    expect(result).toEqual(achievements);
  });

  it('returns empty array when data is null', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchAchievements();

    expect(result).toEqual([]);
  });

  it('throws and captures exception on error', async () => {
    const dbError = { message: 'DB error' };
    const chain = mockSupabaseQuery({
      data: null,
      error: dbError,
    });
    mockFrom.mockReturnValue(chain);

    await expect(fetchAchievements()).rejects.toBe(dbError);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'fetch-achievements' })
    );
  });
});

// ----------------------------------------------------------------------------
// fetchUserAchievements
// ----------------------------------------------------------------------------

describe('fetchUserAchievements', () => {
  it('returns user achievements with joined achievement details', async () => {
    const rows = [
      makeUserAchievementRow(),
      makeUserAchievementRow({
        achievement_id: 'ach-2',
        unlocked_at: '2024-07-01T12:00:00Z',
        achievement: makeAchievement({ id: 'ach-2', name: 'Cinephile', sort_order: 2 }),
      }),
    ];
    const chain = mockSupabaseQuery({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchUserAchievements(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_achievements');
    expect(chain.select).toHaveBeenCalledWith('*, achievement:achievement_id(*)');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.order).toHaveBeenCalledWith('unlocked_at', { ascending: false });
    expect(result).toEqual([
      {
        achievement: rows[0].achievement,
        unlocked_at: rows[0].unlocked_at,
      },
      {
        achievement: rows[1].achievement,
        unlocked_at: rows[1].unlocked_at,
      },
    ]);
  });

  it('returns empty array when data is null', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchUserAchievements(USER_ID);

    expect(result).toEqual([]);
  });

  it('throws and captures exception on error', async () => {
    const dbError = { message: 'DB error' };
    const chain = mockSupabaseQuery({
      data: null,
      error: dbError,
    });
    mockFrom.mockReturnValue(chain);

    await expect(fetchUserAchievements(USER_ID)).rejects.toBe(dbError);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'fetch-user-achievements' })
    );
  });
});

// ----------------------------------------------------------------------------
// checkAchievements
// ----------------------------------------------------------------------------

describe('checkAchievements', () => {
  it('returns newly awarded achievements from edge function', async () => {
    const newlyAwarded = [
      {
        achievement: makeAchievement(),
        unlocked_at: '2024-06-15T12:00:00Z',
      },
    ];
    mockInvoke.mockResolvedValue({
      data: { newly_awarded: newlyAwarded },
      error: null,
    });

    const result = await checkAchievements();

    expect(mockInvoke).toHaveBeenCalledWith('check-achievements');
    expect(result).toEqual(newlyAwarded);
  });

  it('returns empty array when no new achievements', async () => {
    mockInvoke.mockResolvedValue({
      data: { newly_awarded: [] },
      error: null,
    });

    const result = await checkAchievements();

    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await checkAchievements();

    expect(result).toEqual([]);
  });

  it('throws on edge function error with message', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Function failed' },
    });

    await expect(checkAchievements()).rejects.toThrow('Function failed');
  });

  it('throws fallback message when error has no message', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {},
    });

    await expect(checkAchievements()).rejects.toThrow('Failed to check achievements');
  });

  it('captures exception on error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Function failed' },
    });

    await expect(checkAchievements()).rejects.toThrow();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'check-achievements' })
    );
  });
});
