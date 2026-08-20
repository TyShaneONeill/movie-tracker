/**
 * PS-15 v2 — when the streak-extended takeover is allowed to play, and the
 * millisecond timeline it plays on.
 *
 * Two separate concerns, kept in one file because the component needs both and
 * neither is big enough to own a module:
 *
 *  1. TRIGGER. The takeover fires on the call that actually EXTENDED the streak
 *     — never on a same-day repeat, never on a reset, never on a failed RPC.
 *  2. TIMELINE. The "House Cut" preset from the streak-tick playground, derived
 *     here exactly as the playground derives it, so the marks are provably the
 *     signed-off spec rather than transcribed numbers that drift.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StreakRpcResult } from './streak-service';

/* ------------------------------------------------------------------ trigger */

/**
 * What we remember between calls so we can tell an extension from a repeat.
 * Persisted (AsyncStorage) rather than held in state: an in-memory baseline is
 * empty again after every cold start, and the first action of a day the user
 * had already acted on would read as an extension and celebrate a second time.
 */
export interface CelebrationMemory {
  /** current_streak as of the last recorded action, or null before we've seen one. */
  lastStreak: number | null;
  /** The user's local date on which we last played the takeover. */
  lastCelebratedDate: string | null;
}

export const EMPTY_CELEBRATION_MEMORY: CelebrationMemory = {
  lastStreak: null,
  lastCelebratedDate: null,
};

export interface CelebrationTrigger {
  /** The streak before this action — the odometer's start. */
  from: number;
  /** The streak after it — the odometer's end. */
  to: number;
  /** 3 / 7 / 30 / 100 when this extension landed on one, else null. */
  milestone: number | null;
}

/**
 * Decides whether `result` earned a takeover, and with which numbers.
 *
 * The RPC computes the answer internally (`v_advanced`) and, since the
 * `previous_streak` migration, returns it. Those fields are optional on the
 * result type because a client can outrun the migration — a binary shipped
 * before it deploys still talks to the old function, which returns neither. So:
 *
 *   * SERVER TRUTH when `advanced` is present. Exact, and it distinguishes the
 *     three cases the snapshot alone cannot: extend (12→13), same-day repeat
 *     (13→13), reset (12→1). Only the first celebrates.
 *   * REMEMBERED BASELINE otherwise. `to > lastStreak` is an extension. When
 *     there is no baseline yet we SEED and stay silent rather than guess: one
 *     missed celebration on a fresh install is cheaper than firing on a repeat,
 *     and the seed makes every later extension exact.
 *
 * The local-date guard applies on both paths — "first extension of that day" is
 * part of the contract, not just a consequence of how the RPC counts.
 */
export function deriveCelebration(
  result: StreakRpcResult,
  memory: CelebrationMemory
): CelebrationTrigger | null {
  if (memory.lastCelebratedDate === result.local_date) return null;

  const to = result.current_streak;
  const from =
    typeof result.advanced === 'boolean'
      ? result.advanced
        ? result.previous_streak ?? null
        : null
      : memory.lastStreak;

  // No baseline (server said "didn't advance", or we've never seen a result).
  if (from === null || from === undefined) return null;
  // A reset lands here too: it advanced the day, but 1 is not more than 12.
  if (to <= from) return null;

  return { from, to, milestone: result.milestone };
}

/* ------------------------------------------------------------ persistence */

/**
 * Namespaced by user id. Two accounts on one device have unrelated streaks, and
 * a shared key would hand the second one the first one's baseline and its
 * "already celebrated today" stamp — swallowing a real celebration or firing a
 * phantom one. Sign-out clears every namespace too (clearCelebrationMemory), so
 * the id is a partition rather than the only guard.
 */
const MEMORY_KEY_PREFIX = '@streak_celebration_memory';

function memoryKey(userId: string): string {
  return `${MEMORY_KEY_PREFIX}:${userId}`;
}

export async function readCelebrationMemory(userId: string): Promise<CelebrationMemory> {
  try {
    const raw = await AsyncStorage.getItem(memoryKey(userId));
    if (!raw) return EMPTY_CELEBRATION_MEMORY;
    const parsed = JSON.parse(raw) as Partial<CelebrationMemory>;
    return {
      lastStreak: typeof parsed.lastStreak === 'number' ? parsed.lastStreak : null,
      lastCelebratedDate:
        typeof parsed.lastCelebratedDate === 'string' ? parsed.lastCelebratedDate : null,
    };
  } catch {
    return EMPTY_CELEBRATION_MEMORY;
  }
}

export async function writeCelebrationMemory(
  userId: string,
  memory: CelebrationMemory
): Promise<void> {
  try {
    await AsyncStorage.setItem(memoryKey(userId), JSON.stringify(memory));
  } catch {
    // A failed write costs at most one duplicate celebration; never the action.
  }
}

/**
 * Drops every account's celebration memory. Called from both sign-out paths —
 * a baseline left behind is how the next account on the device inherits a stale
 * "already celebrated today" stamp.
 */
export async function clearCelebrationMemory(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(MEMORY_KEY_PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Never the reason a sign-out or an account deletion reports failure.
  }
}

/** The memory to persist after a result, whether or not it celebrated. */
export function nextCelebrationMemory(
  result: StreakRpcResult,
  memory: CelebrationMemory,
  triggered: boolean
): CelebrationMemory {
  return {
    lastStreak: result.current_streak,
    lastCelebratedDate: triggered ? result.local_date : memory.lastCelebratedDate,
  };
}

/* ----------------------------------------------------------------- timeline */

/**
 * The House Cut preset, verbatim from the playground's PRESETS.house. Every
 * mark below is derived from these; none is typed in twice.
 */
export const HOUSE_CUT = {
  dimDur: 260,
  camDur: 300,
  spinDur: 420,
  shakePx: 2,
  flickCount: 2,
  flickRhythm: 110,
  lightIntensity: 0.78,
  lockDelay: 130,
  rollDur: 440,
  overshoot: 0.16,
  holdBtn: 300,
  btnDur: 320,
  digitStagger: 22,
} as const;

/** How long one stutter stays lit. */
export const FLASH_MS = 70;
/** The final ramp from the last stutter to a locked beam. */
export const LOCK_MS = 170;
/** A milestone holds on the bare number longer before the button comes in. */
export const MILESTONE_HOLD_MULTIPLIER = 1.6;
/** The numeral sits here until the beam finds it — the flicker is the reveal. */
export const NUMERAL_DIM_OPACITY = 0.19;
/** Guard rail: the button must be reachable inside this. */
export const PRE_BUTTON_GUARD_MS = 2500;

export interface TakeoverTimeline {
  dimEnd: number;
  camStart: number;
  camEnd: number;
  spinStart: number;
  spinEnd: number;
  flickStart: number;
  flickEnd: number;
  flipAt: number;
  flipEnd: number;
  holdBtn: number;
  btnAt: number;
  btnEnd: number;
  /** Everything has landed; the takeover is at rest and a tap dismisses. */
  total: number;
}

/** Stutters plus the ramp that locks the beam. */
export function flickerSpan(): number {
  return HOUSE_CUT.flickCount * (HOUSE_CUT.flickRhythm + FLASH_MS) + LOCK_MS;
}

/**
 * Absolute marks, in ms from the first frame of the dim. Mirrors the
 * playground's times() step for step.
 */
export function takeoverTimeline(milestone: boolean): TakeoverTimeline {
  const camStart = Math.round(HOUSE_CUT.dimDur * 0.55);
  const camEnd = camStart + HOUSE_CUT.camDur;
  // The spools catch as the entrance settles, not after it.
  const spinStart = Math.max(camStart, camEnd - 40);
  const spinEnd = spinStart + HOUSE_CUT.spinDur;
  const flickEnd = spinEnd + flickerSpan();
  const flipAt = flickEnd + HOUSE_CUT.lockDelay;
  const flipEnd = flipAt + HOUSE_CUT.rollDur;
  const holdBtn = Math.round(
    HOUSE_CUT.holdBtn * (milestone ? MILESTONE_HOLD_MULTIPLIER : 1)
  );
  const btnAt = flipEnd + holdBtn;
  const btnEnd = btnAt + HOUSE_CUT.btnDur;

  return {
    dimEnd: HOUSE_CUT.dimDur,
    camStart,
    camEnd,
    spinStart,
    spinEnd,
    flickStart: spinEnd,
    flickEnd,
    flipAt,
    flipEnd,
    holdBtn,
    btnAt,
    btnEnd,
    total: btnEnd,
  };
}

/**
 * When each stutter lights, relative to flickStart. Haptic marks hang off
 * these — the buzz is the light catching, so it cannot be a separate clock.
 */
export function flickerOnsets(): number[] {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < HOUSE_CUT.flickCount; i++) {
    const on = t + HOUSE_CUT.flickRhythm;
    out.push(on);
    t = on + FLASH_MS;
  }
  return out;
}

/** One odometer column. Only the digits that change move. */
export interface DigitColumn {
  /** The digit rolling out. Empty when the number grew a place (9 → 10). */
  previous: string;
  /** The digit rolling in. */
  next: string;
  rolls: boolean;
}

/**
 * Splits from→to into columns, right-aligned to the wider of the two, so
 * 12→13 rolls one column and 29→30 rolls both.
 */
export function digitColumns(from: number, to: number): DigitColumn[] {
  const width = Math.max(String(from).length, String(to).length);
  const before = String(from).padStart(width, ' ');
  const after = String(to).padStart(width, ' ');

  return after.split('').map((next, i) => ({
    previous: before[i] === ' ' ? '' : before[i],
    next,
    rolls: before[i] !== next,
  }));
}

/**
 * The phase a given elapsed time falls in. The component drives itself off
 * Reanimated, not this — it exists so the sequence is assertable without
 * rendering, and so skip-from-phase has a name in the analytics payload.
 */
export type TakeoverPhase =
  | 'dim'
  | 'camera'
  | 'spinUp'
  | 'flicker'
  | 'hold'
  | 'roll'
  | 'number'
  | 'button'
  | 'rest';

export function phaseAt(ms: number, timeline: TakeoverTimeline): TakeoverPhase {
  if (ms < timeline.camStart) return 'dim';
  if (ms < timeline.spinStart) return 'camera';
  if (ms < timeline.flickStart) return 'spinUp';
  if (ms < timeline.flickEnd) return 'flicker';
  if (ms < timeline.flipAt) return 'hold';
  if (ms < timeline.flipEnd) return 'roll';
  if (ms < timeline.btnAt) return 'number';
  if (ms < timeline.btnEnd) return 'button';
  return 'rest';
}
