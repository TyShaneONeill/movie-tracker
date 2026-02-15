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
  fetchAchievementLevels,
  fetchUserAchievements,
  checkAchievements,
  computeAchievementProgress,
} from '@/lib/achievement-service';
import type { UserAchievementWithLevel } from '@/lib/achievement-service';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import type { Achievement, AchievementLevel } from '@/lib/database.types';

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

const makeAchievementLevel = (
  overrides?: Partial<AchievementLevel>
): AchievementLevel => ({
  id: 'lvl-1',
  achievement_id: 'ach-1',
  level: 1,
  criteria_value: 1,
  description: 'Post your first review',
  image_url: null,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

const makeUserAchievementRow = (overrides?: Record<string, unknown>) => ({
  user_id: USER_ID,
  achievement_id: 'ach-1',
  level: 1,
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
// fetchAchievementLevels
// ----------------------------------------------------------------------------

describe('fetchAchievementLevels', () => {
  it('returns achievement levels ordered by achievement_id then level', async () => {
    const levels = [
      makeAchievementLevel(),
      makeAchievementLevel({ id: 'lvl-2', level: 2, criteria_value: 5, description: 'Post 5 reviews' }),
      makeAchievementLevel({ id: 'lvl-3', achievement_id: 'ach-2', level: 1, criteria_value: 10 }),
    ];
    const chain = mockSupabaseQuery({ data: levels, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchAchievementLevels();

    expect(mockFrom).toHaveBeenCalledWith('achievement_levels');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.order).toHaveBeenCalledWith('achievement_id');
    expect(chain.order).toHaveBeenCalledWith('level');
    expect(result).toEqual(levels);
  });

  it('returns empty array when data is null', async () => {
    const chain = mockSupabaseQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await fetchAchievementLevels();

    expect(result).toEqual([]);
  });

  it('throws and captures exception on error', async () => {
    const dbError = { message: 'DB error' };
    const chain = mockSupabaseQuery({
      data: null,
      error: dbError,
    });
    mockFrom.mockReturnValue(chain);

    await expect(fetchAchievementLevels()).rejects.toBe(dbError);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'fetch-achievement-levels' })
    );
  });
});

// ----------------------------------------------------------------------------
// fetchUserAchievements
// ----------------------------------------------------------------------------

describe('fetchUserAchievements', () => {
  it('returns user achievements with joined achievement details and level', async () => {
    const rows = [
      makeUserAchievementRow(),
      makeUserAchievementRow({
        achievement_id: 'ach-2',
        level: 2,
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
        level: 1,
        unlocked_at: rows[0].unlocked_at,
      },
      {
        achievement: rows[1].achievement,
        level: 2,
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
  it('returns newly awarded achievements with level info from edge function', async () => {
    const newlyAwarded = [
      {
        achievement: makeAchievement(),
        level: 1,
        level_description: 'Post your first review',
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

// ----------------------------------------------------------------------------
// computeAchievementProgress
// ----------------------------------------------------------------------------

describe('computeAchievementProgress', () => {
  it('returns all progress items with currentLevel 0 when no achievements earned', () => {
    const achievements = [
      makeAchievement(),
      makeAchievement({ id: 'ach-2', name: 'Cinephile', sort_order: 2 }),
    ];
    const levels = [
      makeAchievementLevel({ id: 'lvl-1', achievement_id: 'ach-1', level: 1, criteria_value: 1 }),
      makeAchievementLevel({ id: 'lvl-2', achievement_id: 'ach-1', level: 2, criteria_value: 5 }),
      makeAchievementLevel({ id: 'lvl-3', achievement_id: 'ach-2', level: 1, criteria_value: 10 }),
    ];
    const userAchievements: UserAchievementWithLevel[] = [];

    const result = computeAchievementProgress(achievements, levels, userAchievements);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      achievement: achievements[0],
      levels: [levels[0], levels[1]],
      earnedLevels: [],
      currentLevel: 0,
      maxLevel: 2,
      latestUnlockedAt: null,
    });
    expect(result[1]).toEqual({
      achievement: achievements[1],
      levels: [levels[2]],
      earnedLevels: [],
      currentLevel: 0,
      maxLevel: 1,
      latestUnlockedAt: null,
    });
  });

  it('returns correct progress for partially earned achievements', () => {
    const achievement = makeAchievement();
    const levels = [
      makeAchievementLevel({ id: 'lvl-1', level: 1, criteria_value: 1 }),
      makeAchievementLevel({ id: 'lvl-2', level: 2, criteria_value: 5 }),
      makeAchievementLevel({ id: 'lvl-3', level: 3, criteria_value: 10 }),
    ];
    const userAchievements: UserAchievementWithLevel[] = [
      {
        achievement,
        level: 1,
        unlocked_at: '2024-06-15T12:00:00Z',
      },
    ];

    const result = computeAchievementProgress([achievement], levels, userAchievements);

    expect(result).toHaveLength(1);
    expect(result[0].earnedLevels).toEqual([1]);
    expect(result[0].currentLevel).toBe(1);
    expect(result[0].maxLevel).toBe(3);
    expect(result[0].latestUnlockedAt).toBe('2024-06-15T12:00:00Z');
  });

  it('returns currentLevel equal to maxLevel when fully earned', () => {
    const achievement = makeAchievement();
    const levels = [
      makeAchievementLevel({ id: 'lvl-1', level: 1, criteria_value: 1 }),
      makeAchievementLevel({ id: 'lvl-2', level: 2, criteria_value: 5 }),
    ];
    const userAchievements: UserAchievementWithLevel[] = [
      {
        achievement,
        level: 1,
        unlocked_at: '2024-06-15T12:00:00Z',
      },
      {
        achievement,
        level: 2,
        unlocked_at: '2024-07-01T12:00:00Z',
      },
    ];

    const result = computeAchievementProgress([achievement], levels, userAchievements);

    expect(result[0].earnedLevels).toEqual([1, 2]);
    expect(result[0].currentLevel).toBe(2);
    expect(result[0].maxLevel).toBe(2);
    expect(result[0].currentLevel).toBe(result[0].maxLevel);
  });

  it('handles multiple achievements with different earn states', () => {
    const ach1 = makeAchievement({ id: 'ach-1', name: 'First Take' });
    const ach2 = makeAchievement({ id: 'ach-2', name: 'Cinephile' });
    const ach3 = makeAchievement({ id: 'ach-3', name: 'Marathon Runner' });

    const levels = [
      makeAchievementLevel({ id: 'lvl-1a', achievement_id: 'ach-1', level: 1, criteria_value: 1 }),
      makeAchievementLevel({ id: 'lvl-1b', achievement_id: 'ach-1', level: 2, criteria_value: 5 }),
      makeAchievementLevel({ id: 'lvl-2a', achievement_id: 'ach-2', level: 1, criteria_value: 10 }),
      makeAchievementLevel({ id: 'lvl-2b', achievement_id: 'ach-2', level: 2, criteria_value: 25 }),
      makeAchievementLevel({ id: 'lvl-2c', achievement_id: 'ach-2', level: 3, criteria_value: 50 }),
      makeAchievementLevel({ id: 'lvl-3a', achievement_id: 'ach-3', level: 1, criteria_value: 3 }),
    ];

    const userAchievements: UserAchievementWithLevel[] = [
      // ach-1: fully earned (both levels)
      { achievement: ach1, level: 1, unlocked_at: '2024-06-15T12:00:00Z' },
      { achievement: ach1, level: 2, unlocked_at: '2024-08-01T12:00:00Z' },
      // ach-2: partially earned (1 of 3 levels)
      { achievement: ach2, level: 1, unlocked_at: '2024-07-01T12:00:00Z' },
      // ach-3: not earned at all
    ];

    const result = computeAchievementProgress([ach1, ach2, ach3], levels, userAchievements);

    expect(result).toHaveLength(3);

    // ach-1: fully earned
    expect(result[0].currentLevel).toBe(2);
    expect(result[0].maxLevel).toBe(2);
    expect(result[0].earnedLevels).toEqual([1, 2]);

    // ach-2: partially earned
    expect(result[1].currentLevel).toBe(1);
    expect(result[1].maxLevel).toBe(3);
    expect(result[1].earnedLevels).toEqual([1]);

    // ach-3: not earned
    expect(result[2].currentLevel).toBe(0);
    expect(result[2].maxLevel).toBe(1);
    expect(result[2].earnedLevels).toEqual([]);
    expect(result[2].latestUnlockedAt).toBeNull();
  });

  it('returns the most recent unlocked_at as latestUnlockedAt', () => {
    const achievement = makeAchievement();
    const levels = [
      makeAchievementLevel({ id: 'lvl-1', level: 1 }),
      makeAchievementLevel({ id: 'lvl-2', level: 2 }),
      makeAchievementLevel({ id: 'lvl-3', level: 3 }),
    ];
    const userAchievements: UserAchievementWithLevel[] = [
      { achievement, level: 1, unlocked_at: '2024-06-15T12:00:00Z' },
      { achievement, level: 3, unlocked_at: '2024-09-20T18:00:00Z' },
      { achievement, level: 2, unlocked_at: '2024-08-01T12:00:00Z' },
    ];

    const result = computeAchievementProgress([achievement], levels, userAchievements);

    expect(result[0].latestUnlockedAt).toBe('2024-09-20T18:00:00Z');
  });

  it('sorts levels by level number regardless of input order', () => {
    const achievement = makeAchievement();
    const levels = [
      makeAchievementLevel({ id: 'lvl-3', level: 3, criteria_value: 10 }),
      makeAchievementLevel({ id: 'lvl-1', level: 1, criteria_value: 1 }),
      makeAchievementLevel({ id: 'lvl-2', level: 2, criteria_value: 5 }),
    ];

    const result = computeAchievementProgress([achievement], levels, []);

    expect(result[0].levels[0].level).toBe(1);
    expect(result[0].levels[1].level).toBe(2);
    expect(result[0].levels[2].level).toBe(3);
  });

  it('returns empty array when given no achievements', () => {
    const result = computeAchievementProgress([], [], []);

    expect(result).toEqual([]);
  });
});
