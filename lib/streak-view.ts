/**
 * Pure presentation logic for the PS-15 streak screen (docs/design/ps15-streak).
 *
 * Everything the streak screen and the Stats entry cell need to decide *what*
 * to draw lives here so it is unit-testable without rendering: the hero state,
 * the message-card copy, the month calendar grid, the run segmentation, and the
 * rain-check-covered-day derivation.
 *
 * Nothing in here talks to Supabase or React — lib/streak-service.ts fetches,
 * lib/streak-logic.ts owns the streak *rules* (and must stay in lockstep with
 * the RPC); this module only decides how the result is shown.
 */

import { MILESTONES, type StreakSnapshot } from './streak-logic';

/** The three camera/hero palettes. Day 0 renders `idle` with day-0 copy. */
export type StreakHeroState = 'idle' | 'active' | 'milestone';

export interface StreakMessage {
  /** Bold lead sentence. */
  lead: string;
  /** The rest of the line, including its leading space. */
  rest: string;
}

/** A single calendar cell: `null` is a leading/trailing blank in the grid. */
export interface StreakCalendarDay {
  /** Day of month, or null for a padding slot. */
  day: number | null;
  /** ISO local date, or null for a padding slot. */
  date: string | null;
  /** Logged activity on this day. */
  active: boolean;
  /** Inside the streak run but not logged — a rain check covered it. */
  covered: boolean;
  /** Part of a run pill (active or covered). */
  inRun: boolean;
  isToday: boolean;
  /** After today — dimmed. */
  future: boolean;
  /** A milestone threshold was crossed on this day. */
  milestone: boolean;
}

export interface StreakCalendarRun {
  /** 0-based column the pill starts at. */
  start: number;
  /** Column count the pill spans. */
  span: number;
}

export interface StreakCalendarWeek {
  days: StreakCalendarDay[];
  runs: StreakCalendarRun[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Shift a 'YYYY-MM-DD' local date string by whole days (UTC-anchored, DST-safe). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' for the first of `date`'s month. */
export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Earliest local_date the screen needs: a rolling 35 days back.
 *
 * The calendar draws the whole displayed month, so the window has to reach at
 * least its 1st — the old trailing 14-ROW window blanked out early-month days
 * we did have rows for. 35 days clears that unconditionally: the longest month
 * is 31 days, so this always lands on or before the 1st (asserted in the tests)
 * and usually weeks earlier, which is what lets a run that began last month
 * still be drawn as one run.
 */
export function activityWindowStart(today: string): string {
  return shiftDate(today, -34); // 35 days inclusive of today
}

/** "August 2026" for the month `date` falls in. */
export function monthLabel(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/**
 * Which non-logged days a rain check bridged inside the live run.
 *
 * There is no per-day consumption record — `user_streaks.rain_checks_used` is a
 * lifetime counter — so this is a *derivation*, not a lookup: walk back from
 * the last activity day, and any unlogged day sandwiched between two logged
 * days of the live run is attributed to a check, up to the number of checks the
 * account has ever spent. Once that budget is exhausted the walk stops, which
 * is also where the run must have started. Days before the fetched window end
 * the walk too (we can't tell a gap from a hole in the data).
 */
export function deriveCoveredDays(
  snapshot: StreakSnapshot,
  activeDates: ReadonlySet<string>,
  windowStart: string
): Set<string> {
  const covered = new Set<string>();
  const anchor = snapshot.lastActivityDate;
  if (!anchor || snapshot.currentStreak <= 0) return covered;

  let budget = snapshot.rainChecksUsed;
  let seen = 0;
  let pending: string[] = [];

  for (let cursor = anchor; cursor >= windowStart; cursor = shiftDate(cursor, -1)) {
    if (activeDates.has(cursor)) {
      // The gap we just walked was bridged — bill it to the checks.
      for (const gapDay of pending) covered.add(gapDay);
      budget -= pending.length;
      pending = [];
      seen += 1;
      if (seen >= snapshot.currentStreak) break;
    } else {
      pending.push(cursor);
      if (pending.length > budget) break; // no check could have saved this gap
    }
  }

  return covered;
}

/**
 * The days a milestone threshold was crossed, as day-of-month numbers in the
 * displayed month. The count advances one per *logged* day, so we replay the
 * run forward from its first day and mark the days where the running total
 * lands on 3 / 7 / 30 / 100. Only days inside the loaded window can be marked.
 */
export function deriveMilestoneDays(
  snapshot: StreakSnapshot,
  activeDates: ReadonlySet<string>,
  covered: ReadonlySet<string>,
  windowStart: string
): Set<string> {
  const days = new Set<string>();
  const anchor = snapshot.lastActivityDate;
  if (!anchor || snapshot.currentStreak <= 0) return days;

  // Walk back to the run's first loaded day, then replay forward.
  const runDays: string[] = [];
  let seen = 0;
  for (let cursor = anchor; cursor >= windowStart; cursor = shiftDate(cursor, -1)) {
    const isActive = activeDates.has(cursor);
    if (!isActive && !covered.has(cursor)) break;
    runDays.unshift(cursor);
    if (isActive) {
      seen += 1;
      if (seen >= snapshot.currentStreak) break;
    }
  }

  // The run may extend before the window; count forward from wherever it does
  // start so the numbers stay true to `current_streak` at the anchor.
  let count = snapshot.currentStreak - seen;
  for (const date of runDays) {
    if (!activeDates.has(date)) continue;
    count += 1;
    if (MILESTONES.includes(count)) days.add(date);
  }
  return days;
}

/**
 * `idle` until today is logged; then `milestone` on a banked threshold day,
 * else `active`. The handoff derived milestone from `streak % 30`; the shipped
 * ADR thresholds are 3/7/30/100 (lib/streak-logic.ts MILESTONES) and the DB
 * celebrates exactly those, so the screen follows the DB.
 */
export function deriveHeroState(streak: number, extendedToday: boolean): StreakHeroState {
  if (!extendedToday) return 'idle';
  return MILESTONES.includes(streak) ? 'milestone' : 'active';
}

/** What a milestone run is a wrap on — day 30's phrasing is the handoff's. */
function milestoneSpan(streak: number): string {
  if (streak === 3) return 'three days straight';
  if (streak === 7) return 'a full week';
  if (streak === 100) return 'a hundred days';
  return 'a full month';
}

/** Message-card copy. The three handoff states are verbatim; day 0 is ours. */
export function streakMessage(streak: number, state: StreakHeroState): StreakMessage {
  if (streak <= 0) {
    return {
      lead: 'Thread the projector.',
      rest: ' Nothing on the reel yet — log anything today and the first frame prints.',
    };
  }
  if (state === 'milestone') {
    return {
      lead: `Day ${streak}, that’s a wrap on ${milestoneSpan(streak)}.`,
      rest: ' Saved to your reel.',
    };
  }
  if (state === 'active') {
    return { lead: `Day ${streak}, in the can.`, rest: ' The camera keeps rolling.' };
  }
  return { lead: 'No scene shot today.', rest: ' One take keeps the reel alive.' };
}

/**
 * The displayed month as weeks of cells, with each week's contiguous run of
 * in-streak days collapsed into pill spans (the calendar draws one capsule per
 * run, not one per day, and a run breaks at the week boundary).
 */
export function buildCalendar(params: {
  today: string;
  activeDates: ReadonlySet<string>;
  covered: ReadonlySet<string>;
  milestoneDays: ReadonlySet<string>;
}): StreakCalendarWeek[] {
  const { today, activeDates, covered, milestoneDays } = params;
  const [year, month] = today.split('-').map(Number);
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: StreakCalendarDay[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(blankDay());
  }
  for (let day = 1; day <= length; day++) {
    const date = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    const active = activeDates.has(date);
    const isCovered = !active && covered.has(date);
    cells.push({
      day,
      date,
      active,
      covered: isCovered,
      inRun: active || isCovered,
      isToday: date === today,
      future: date > today,
      milestone: milestoneDays.has(date),
    });
  }
  while (cells.length % 7 !== 0) cells.push(blankDay());

  const weeks: StreakCalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const days = cells.slice(i, i + 7);
    weeks.push({ days, runs: segmentRuns(days) });
  }
  return weeks;
}

function blankDay(): StreakCalendarDay {
  return {
    day: null,
    date: null,
    active: false,
    covered: false,
    inRun: false,
    isToday: false,
    future: false,
    milestone: false,
  };
}

/**
 * What a screen reader says for one calendar cell. The visual language here is
 * entirely colour and shape — a rose disc, a gold disc, a cloud, a ring — and
 * none of that survives into the accessibility tree on its own.
 */
export function calendarDayLabel(day: StreakCalendarDay, monthLabel: string): string {
  if (day.day === null) return '';
  const month = monthLabel.split(' ')[0];
  const date = `${month} ${day.day}`;
  if (day.milestone) return `${date}, milestone reached`;
  if (day.isToday && day.active) return `${date}, today, logged`;
  if (day.isToday) return `${date}, today, not yet logged`;
  if (day.covered) return `${date}, covered by a rain check`;
  if (day.active) return `${date}, active`;
  if (day.future) return date;
  return `${date}, nothing logged`;
}

/** Contiguous in-run cells in one week row, as pill spans. */
export function segmentRuns(days: readonly StreakCalendarDay[]): StreakCalendarRun[] {
  const runs: StreakCalendarRun[] = [];
  let col = 0;
  while (col < days.length) {
    if (!days[col].inRun) {
      col += 1;
      continue;
    }
    const start = col;
    while (col < days.length && days[col].inRun) col += 1;
    runs.push({ start, span: col - start });
  }
  return runs;
}
