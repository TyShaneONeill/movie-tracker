/**
 * Streak service (PS-15 PR 3) — the client's thin wrapper over the streak
 * spine. `recordUserActivity` calls the SECURITY DEFINER RPC on qualifying
 * actions; `getStreakCard` reads the user's own streak state + recent activity
 * days for the profile punch card. All day math the DB cares about is
 * server-side (profiles.timezone); the client only derives its own local date
 * for display liveness.
 *
 * Gating: `maybeRecordActivity` no-ops unless the streak_spine feature is on
 * (flag or env override), so nothing is written while the feature is dark —
 * mirroring lib/notification-priming-context.tsx.
 */

import { supabase } from './supabase';
import { captureException } from './sentry';
import { analytics } from './analytics';
import {
  type StreakSnapshot,
  effectiveStreak,
  isStreakAlive,
  localTodayISO,
} from './streak-logic';

/** Free-text action taxonomy — kept open (no DB enum) so PR 4's Marquee answer can join. */
export type StreakAction =
  | 'rate'
  | 'log'
  | 'first_take'
  | 'review'
  | 'comment'
  | 'like'
  | 'watchlist_add'
  | 'scan'
  | 'tv_status';

/** Shape of the jsonb record_user_activity() returns. */
export interface StreakRpcResult {
  current_streak: number;
  longest_streak: number;
  rain_checks: number;
  rain_checks_used: number;
  last_activity_date: string | null;
  local_date: string;
  first_action: string | null;
  milestone: number | null;
  rain_check_consumed: boolean;
  rain_check_earned: boolean;
}

export interface StreakActivityDay {
  local_date: string;
  first_action: string;
  action_count: number;
}

export interface StreakCard {
  snapshot: StreakSnapshot;
  activityDays: StreakActivityDay[];
  localDate: string;
  alive: boolean;
  effectiveStreak: number;
}

const ACTIVITY_DAYS_WINDOW = 14;

/**
 * Non-hook gate mirroring useStreakSpineEnabled (hooks/use-feature-flag.ts) so
 * service-layer callers (e.g. episode logging) can gate identically without a
 * React context.
 *
 * `streak_spine` is a SEPARATE flag from `daily_hooks` (which is @100% since
 * 2026-07-07 for the priming sheet): the punch card must be device-validated
 * Ty-only before anyone sees it — same rollout playbook as PR 1.
 */
export function streakSpineEnabledNow(): boolean {
  const envOverride = process.env.EXPO_PUBLIC_STREAK_SPINE_OVERRIDE;
  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  const value = analytics.getFeatureFlag('streak_spine');
  return value === true || (typeof value === 'string' && value !== 'false');
}

/** Calls the RPC unconditionally. Returns the new streak state, or null on error. */
export async function recordUserActivity(
  action: StreakAction
): Promise<StreakRpcResult | null> {
  try {
    const { data, error } = await supabase.rpc('record_user_activity', {
      p_action: action,
    });
    if (error) throw error;
    return data as unknown as StreakRpcResult;
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: 'record-user-activity',
      action,
    });
    return null;
  }
}

/** Gated variant for callers without React context; no-ops when streak_spine is off. */
export async function maybeRecordActivity(
  action: StreakAction
): Promise<StreakRpcResult | null> {
  if (!streakSpineEnabledNow()) return null;
  return recordUserActivity(action);
}

export async function getStreakCard(): Promise<StreakCard | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [streakRes, daysRes] = await Promise.all([
      supabase
        .from('user_streaks')
        .select(
          'current_streak, longest_streak, last_activity_date, rain_checks, rain_checks_used, last_earn_date'
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_activity_days')
        .select('local_date, first_action, action_count')
        .eq('user_id', user.id)
        .order('local_date', { ascending: false })
        .limit(ACTIVITY_DAYS_WINDOW),
    ]);

    if (streakRes.error) throw streakRes.error;
    if (daysRes.error) throw daysRes.error;

    const localDate = localTodayISO();
    const row = streakRes.data;
    const snapshot: StreakSnapshot = row
      ? {
          currentStreak: row.current_streak,
          longestStreak: row.longest_streak,
          lastActivityDate: row.last_activity_date,
          rainChecks: row.rain_checks,
          rainChecksUsed: row.rain_checks_used,
          lastEarnDate: row.last_earn_date,
        }
      : {
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          rainChecks: 0,
          rainChecksUsed: 0,
          lastEarnDate: null,
        };

    return {
      snapshot,
      activityDays: (daysRes.data ?? []) as StreakActivityDay[],
      localDate,
      alive: isStreakAlive(snapshot, localDate),
      effectiveStreak: effectiveStreak(snapshot, localDate),
    };
  } catch (err) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: 'get-streak-card',
    });
    return null;
  }
}
