import { supabase } from './supabase';
import { captureException } from './sentry';
import type { Achievement, UserAchievement } from './database.types';

export interface AwardedAchievement {
  achievement: Achievement;
  unlocked_at: string;
}

export interface UserAchievementWithDetails {
  achievement: Achievement;
  unlocked_at: string;
}

/**
 * Fetch all achievement definitions ordered by sort_order.
 */
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

/**
 * Fetch a user's earned achievements with full achievement details.
 */
export async function fetchUserAchievements(
  userId: string
): Promise<UserAchievementWithDetails[]> {
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
      unlocked_at: row.unlocked_at,
    }));
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'fetch-user-achievements',
    });
    throw error;
  }
}

/**
 * Trigger achievement check via edge function.
 * Returns newly awarded achievements (if any).
 */
export async function checkAchievements(): Promise<AwardedAchievement[]> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      newly_awarded: AwardedAchievement[];
    }>('check-achievements');

    if (error) {
      throw new Error(error.message || 'Failed to check achievements');
    }

    if (!data) {
      return [];
    }

    return data.newly_awarded;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'check-achievements',
    });
    throw error;
  }
}
