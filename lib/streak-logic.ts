/**
 * Pure streak-transition logic — a faithful TypeScript mirror of the
 * record_user_activity() plpgsql RPC (supabase/migrations/
 * 20260707150100_record_user_activity_rpc.sql). The database is the source of
 * truth at runtime; this module exists so the semantics are unit-testable in
 * jest and so the client can compute display liveness without a round-trip.
 *
 * ⚠️ If you change the streak rules here, change the RPC too (and vice versa) —
 * they must stay in lockstep. The edge cases in
 * __tests__/lib/streak-logic.test.ts encode the locked ADR semantics.
 *
 * All dates are 'YYYY-MM-DD' local calendar strings (the server derives them
 * from profiles.timezone; the client derives them from the device timezone via
 * localTodayISO()).
 */

export interface StreakSnapshot {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  rainChecks: number;
  rainChecksUsed: number;
  lastEarnDate: string | null;
}

export interface StreakTransition {
  next: StreakSnapshot;
  advanced: boolean;
  milestone: number | null;
  rainCheckConsumed: boolean;
  rainCheckEarned: boolean;
}

/** Core creation actions that earn a rain check (not likes/comments/watchlist). */
export const EARN_ACTIONS: readonly string[] = ['rate', 'log', 'first_take', 'review', 'scan'];

export const MILESTONES: readonly number[] = [3, 7, 30, 100];

export const RAIN_CHECK_CAP = 2;

/** Whole-day difference b - a for two 'YYYY-MM-DD' strings (UTC-anchored, DST-safe). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/** Today's local calendar date as 'YYYY-MM-DD' in the device timezone. */
export function localTodayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; using the device's local timezone.
  return now.toLocaleDateString('en-CA');
}

/**
 * Apply one qualifying action on `today` to the prior snapshot (or null for a
 * user's first-ever activity). Mirrors record_user_activity() exactly.
 */
export function applyActivity(
  prev: StreakSnapshot | null,
  action: string,
  today: string
): StreakTransition {
  let current: number;
  let longest: number;
  let rain: number;
  let used: number;
  let lastEarn: string | null;
  let advanced = false;
  let covered = 0;

  if (!prev) {
    current = 1;
    longest = 1;
    rain = 0;
    used = 0;
    lastEarn = null;
    advanced = true;
  } else {
    current = prev.currentStreak;
    longest = prev.longestStreak;
    rain = prev.rainChecks;
    used = prev.rainChecksUsed;
    lastEarn = prev.lastEarnDate;

    if (prev.lastActivityDate === null) {
      current = 1;
      advanced = true;
    } else if (prev.lastActivityDate === today) {
      advanced = false; // idempotent same-day
    } else if (prev.lastActivityDate > today) {
      advanced = false; // clock moved backward; don't rewind
    } else {
      const gap = daysBetween(prev.lastActivityDate, today); // >= 1
      const missed = gap - 1;
      covered = Math.min(missed, rain);
      rain -= covered;
      used += covered;
      current = covered >= missed ? current + 1 : 1;
      advanced = true;
    }
  }

  let earned = false;
  if (
    EARN_ACTIONS.includes(action) &&
    (lastEarn === null || lastEarn < today) &&
    rain < RAIN_CHECK_CAP
  ) {
    rain += 1;
    lastEarn = today;
    earned = true;
  }

  longest = Math.max(longest, current);

  const milestone = advanced && MILESTONES.includes(current) ? current : null;

  return {
    next: {
      currentStreak: current,
      longestStreak: longest,
      lastActivityDate: today,
      rainChecks: rain,
      rainChecksUsed: used,
      lastEarnDate: lastEarn,
    },
    advanced,
    milestone,
    rainCheckConsumed: covered > 0,
    rainCheckEarned: earned,
  };
}

/**
 * Is the stored streak still alive as of `today` (same criterion as the RPC's
 * reset branch and reconcile_user_streaks)? Used for honest card display before
 * the nightly reconciliation runs.
 */
export function isStreakAlive(s: StreakSnapshot, today: string): boolean {
  if (s.currentStreak <= 0 || s.lastActivityDate === null) return false;
  if (s.lastActivityDate >= today) return true; // acted today (or future clock)
  const missed = daysBetween(s.lastActivityDate, today) - 1;
  return missed <= s.rainChecks;
}

/** The streak count to show: the stored value if alive, else 0 (broken). */
export function effectiveStreak(s: StreakSnapshot, today: string): number {
  return isStreakAlive(s, today) ? s.currentStreak : 0;
}
