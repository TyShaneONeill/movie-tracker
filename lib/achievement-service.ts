import { supabase } from './supabase';
import { captureException } from './sentry';
import type { Achievement, AchievementLevel, UserAchievement } from './database.types';

export interface AwardedAchievementLevel {
  achievement: Achievement;
  level: number;
  level_description: string;
  unlocked_at: string;
}

export interface RevokedAchievementLevel {
  achievement_id: string;
  level: number;
}

export interface CheckAchievementsResult {
  newlyAwarded: AwardedAchievementLevel[];
  revoked: RevokedAchievementLevel[];
}

export interface UserAchievementWithLevel {
  achievement: Achievement;
  level: number;
  unlocked_at: string;
}

export interface AchievementProgress {
  achievement: Achievement;
  levels: AchievementLevel[];
  earnedLevels: number[];
  currentLevel: number;
  maxLevel: number;
  latestUnlockedAt: string | null;
}

export async function fetchAchievements(): Promise<Achievement[]> {
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('sort_order');

    if (error) {
      throw error;
    }

    return data ?? [];
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'fetch-achievements',
    });
    throw error;
  }
}

export async function fetchAchievementLevels(): Promise<AchievementLevel[]> {
  try {
    const { data, error } = await supabase
      .from('achievement_levels')
      .select('*')
      .order('achievement_id')
      .order('level');

    if (error) {
      throw error;
    }

    return data ?? [];
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'fetch-achievement-levels',
    });
    throw error;
  }
}

export async function fetchUserAchievements(
  userId: string
): Promise<UserAchievementWithLevel[]> {
  try {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('*, achievement:achievement_id(*)')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!data) {
      return [];
    }

    return data.map((row: any) => ({
      achievement: row.achievement as Achievement,
      level: row.level as number,
      unlocked_at: row.unlocked_at,
    }));
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'fetch-user-achievements',
    });
    throw error;
  }
}

export async function checkAchievements(): Promise<CheckAchievementsResult> {
  try {
    // `revoked` is optional on the wire: the client ships via OTA and can
    // reach an edge function still on the old (award-only) deploy, which
    // won't send the field at all. Default it to [] rather than assuming
    // its absence means "nothing to revoke" was computed — see the ?? below.
    const { data, error } = await supabase.functions.invoke<{
      newly_awarded: AwardedAchievementLevel[];
      revoked?: RevokedAchievementLevel[];
    }>('check-achievements');

    if (error) {
      throw new Error(error.message || 'Failed to check achievements');
    }

    if (!data) {
      return { newlyAwarded: [], revoked: [] };
    }

    return {
      newlyAwarded: data.newly_awarded ?? [],
      revoked: data.revoked ?? [],
    };
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'check-achievements',
    });
    throw error;
  }
}

export function computeAchievementProgress(
  achievements: Achievement[],
  levels: AchievementLevel[],
  userAchievements: UserAchievementWithLevel[]
): AchievementProgress[] {
  return achievements.map(achievement => {
    const achievementLevels = levels
      .filter(l => l.achievement_id === achievement.id)
      .sort((a, b) => a.level - b.level);

    const earned = userAchievements
      .filter(ua => ua.achievement.id === achievement.id);

    const earnedLevels = earned.map(e => e.level).sort((a, b) => a - b);
    const currentLevel = earnedLevels.length > 0 ? Math.max(...earnedLevels) : 0;
    const latestUnlockedAt = earned.length > 0
      ? earned.sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))[0].unlocked_at
      : null;

    return {
      achievement,
      levels: achievementLevels,
      earnedLevels,
      currentLevel,
      maxLevel: achievementLevels.length,
      latestUnlockedAt,
    };
  });
}
