/**
 * PS-15 streak screen presentation logic. These lock the decisions the pixel
 * gate can't see: which state the hero is in, which sentence the message card
 * shows, which unlogged days a rain check is credited with, and how the month
 * fetch window is sized.
 */

import {
  activityWindowStart,
  buildCalendar,
  calendarDayLabel,
  deriveCoveredDays,
  deriveHeroState,
  deriveMilestoneDays,
  firstOfMonth,
  monthLabel,
  segmentRuns,
  shiftDate,
  streakMessage,
  type StreakCalendarDay,
} from '@/lib/streak-view';
import type { StreakSnapshot } from '@/lib/streak-logic';

function snapshot(over: Partial<StreakSnapshot> = {}): StreakSnapshot {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    rainChecks: 0,
    rainChecksUsed: 0,
    lastEarnDate: null,
    ...over,
  };
}

/** The `n` days ending at `end`, inclusive. */
function run(end: string, n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < n; i++) out.add(shiftDate(end, -i));
  return out;
}

describe('date helpers', () => {
  it('shifts across a month boundary', () => {
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('labels the month the way the mock does', () => {
    expect(monthLabel('2026-08-15')).toBe('August 2026');
    expect(firstOfMonth('2026-08-15')).toBe('2026-08-01');
  });
});

describe('activityWindowStart', () => {
  it('is a rolling 35 days back, inclusive of today', () => {
    expect(activityWindowStart('2026-08-28')).toBe('2026-07-25');
    expect(activityWindowStart('2026-08-03')).toBe('2026-06-30');
  });

  it('always reaches the 1st of the displayed month, every day of the year', () => {
    // This is the invariant the calendar depends on, and the reason 35 is the
    // number: no month is longer than 31 days, so the rolling floor can never
    // land after the 1st and leave early-month cells blank.
    for (let month = 1; month <= 12; month++) {
      const length = new Date(Date.UTC(2026, month, 0)).getUTCDate();
      for (let day = 1; day <= length; day++) {
        const today = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        expect(activityWindowStart(today) <= firstOfMonth(today)).toBe(true);
      }
    }
  });
});

describe('deriveHeroState', () => {
  it('is idle until today is logged, whatever the count', () => {
    expect(deriveHeroState(0, false)).toBe('idle');
    expect(deriveHeroState(12, false)).toBe('idle');
    expect(deriveHeroState(30, false)).toBe('idle');
  });

  it('is active on an ordinary extended day', () => {
    expect(deriveHeroState(12, true)).toBe('active');
  });

  it('is milestone on the banked ADR thresholds — not the handoff’s % 30', () => {
    for (const n of [3, 7, 30, 100]) expect(deriveHeroState(n, true)).toBe('milestone');
    // 60 and 90 are multiples of 30 but are NOT banked milestones; the DB
    // celebrates 3/7/30/100 and the screen follows the DB.
    for (const n of [60, 90]) expect(deriveHeroState(n, true)).toBe('active');
  });
});

describe('streakMessage', () => {
  it('uses the day-0 copy before anything is on the reel', () => {
    expect(streakMessage(0, 'idle')).toEqual({
      lead: 'Thread the projector.',
      rest: ' Nothing on the reel yet — log anything today and the first frame prints.',
    });
  });

  it('uses the handoff copy verbatim for idle and active', () => {
    expect(streakMessage(12, 'idle')).toEqual({
      lead: 'No scene shot today.',
      rest: ' One take keeps the reel alive.',
    });
    expect(streakMessage(12, 'active')).toEqual({
      lead: 'Day 12, in the can.',
      rest: ' The camera keeps rolling.',
    });
  });

  it('renders day 30 exactly as the handoff wrote it', () => {
    expect(streakMessage(30, 'milestone')).toEqual({
      lead: 'Day 30, that’s a wrap on a full month.',
      rest: ' Saved to your reel.',
    });
  });

  it('keeps the other thresholds honest instead of claiming a full month', () => {
    expect(streakMessage(3, 'milestone').lead).toBe('Day 3, that’s a wrap on three days straight.');
    expect(streakMessage(7, 'milestone').lead).toBe('Day 7, that’s a wrap on a full week.');
    expect(streakMessage(100, 'milestone').lead).toBe('Day 100, that’s a wrap on a hundred days.');
  });
});

describe('deriveCoveredDays', () => {
  const windowStart = '2026-08-01';

  it('is empty with no run', () => {
    const covered = deriveCoveredDays(snapshot(), new Set(), windowStart);
    expect(covered.size).toBe(0);
  });

  it('is empty when the run has no gaps', () => {
    const active = run('2026-08-15', 5);
    const covered = deriveCoveredDays(
      snapshot({ currentStreak: 5, lastActivityDate: '2026-08-15', rainChecksUsed: 2 }),
      active,
      windowStart
    );
    expect(covered.size).toBe(0);
  });

  it('credits a bridged day to a spent rain check', () => {
    // Logged 11,12,14,15 — the 13th is the hole the check covered.
    const active = new Set(['2026-08-11', '2026-08-12', '2026-08-14', '2026-08-15']);
    const covered = deriveCoveredDays(
      snapshot({ currentStreak: 4, lastActivityDate: '2026-08-15', rainChecksUsed: 1 }),
      active,
      windowStart
    );
    expect([...covered]).toEqual(['2026-08-13']);
  });

  it('will not credit more days than the account has ever spent', () => {
    // Two separate holes but only one check ever used: the walk stops at the
    // second, which is where the run must actually have begun.
    const active = new Set(['2026-08-11', '2026-08-13', '2026-08-15']);
    const covered = deriveCoveredDays(
      snapshot({ currentStreak: 3, lastActivityDate: '2026-08-15', rainChecksUsed: 1 }),
      active,
      windowStart
    );
    expect([...covered]).toEqual(['2026-08-14']);
  });

  it('stops at the fetch window rather than guessing at days it cannot see', () => {
    const active = new Set(['2026-08-01', '2026-08-02']);
    const covered = deriveCoveredDays(
      snapshot({ currentStreak: 40, lastActivityDate: '2026-08-02', rainChecksUsed: 2 }),
      active,
      windowStart
    );
    expect(covered.size).toBe(0);
  });
});

describe('deriveMilestoneDays', () => {
  it('marks the day the count crossed a threshold', () => {
    // A 7-day run ending the 15th: day 3 of the run is the 11th, day 7 the 15th.
    const active = run('2026-08-15', 7);
    const days = deriveMilestoneDays(
      snapshot({ currentStreak: 7, lastActivityDate: '2026-08-15' }),
      active,
      new Set(),
      '2026-08-01'
    );
    expect([...days].sort()).toEqual(['2026-08-11', '2026-08-15']);
  });

  it('counts a rain-checked day as part of the span but not as a logged day', () => {
    // Logged 12,13,14,15 with the 11th bridged. The count advances per LOGGED
    // day, so day 3 of the run lands on the 14th — not the 13th, which is where
    // it would land if the bridged day were counted.
    const active = new Set(['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']);
    const covered = new Set(['2026-08-11']);
    const days = deriveMilestoneDays(
      snapshot({ currentStreak: 4, lastActivityDate: '2026-08-15', rainChecksUsed: 1 }),
      active,
      covered,
      '2026-08-01'
    );
    expect([...days]).toEqual(['2026-08-14']);
    expect(days.has('2026-08-11')).toBe(false);
  });

  it('is empty when the run predates the window and no threshold falls inside it', () => {
    const active = run('2026-08-15', 3);
    const days = deriveMilestoneDays(
      snapshot({ currentStreak: 50, lastActivityDate: '2026-08-15' }),
      active,
      new Set(),
      '2026-08-13'
    );
    expect(days.size).toBe(0);
  });
});

describe('calendarDayLabel', () => {
  const cell = (over: Partial<StreakCalendarDay>): StreakCalendarDay => ({
    day: 12,
    date: '2026-08-12',
    active: false,
    covered: false,
    inRun: false,
    isToday: false,
    future: false,
    milestone: false,
    ...over,
  });

  it('says nothing for a padding slot', () => {
    expect(calendarDayLabel(cell({ day: null }), 'August 2026')).toBe('');
  });

  it('names what each visual treatment means, since colour and shape do not carry', () => {
    expect(calendarDayLabel(cell({ active: true }), 'August 2026')).toBe('August 12, active');
    expect(calendarDayLabel(cell({}), 'August 2026')).toBe('August 12, nothing logged');
    expect(calendarDayLabel(cell({ covered: true }), 'August 2026')).toBe(
      'August 12, covered by a rain check'
    );
    expect(calendarDayLabel(cell({ isToday: true }), 'August 2026')).toBe(
      'August 12, today, not yet logged'
    );
    expect(calendarDayLabel(cell({ isToday: true, active: true }), 'August 2026')).toBe(
      'August 12, today, logged'
    );
  });

  it('lets the milestone win when it lands on today', () => {
    expect(
      calendarDayLabel(cell({ milestone: true, isToday: true, active: true }), 'August 2026')
    ).toBe('August 12, milestone reached');
  });

  it('leaves a future day as a bare date — there is nothing to report yet', () => {
    expect(calendarDayLabel(cell({ future: true }), 'August 2026')).toBe('August 12');
  });
});

describe('segmentRuns', () => {
  const cell = (inRun: boolean): StreakCalendarDay => ({
    day: 1,
    date: '2026-08-01',
    active: inRun,
    covered: false,
    inRun,
    isToday: false,
    future: false,
    milestone: false,
  });

  it('collapses consecutive in-run cells into one pill', () => {
    const week = [false, true, true, true, false, true, false].map(cell);
    expect(segmentRuns(week)).toEqual([
      { start: 1, span: 3 },
      { start: 5, span: 1 },
    ]);
  });

  it('returns nothing for a blank week', () => {
    expect(segmentRuns([false, false].map(cell))).toEqual([]);
  });

  it('spans the whole row when every day is in the run', () => {
    expect(segmentRuns(Array(7).fill(true).map(cell))).toEqual([{ start: 0, span: 7 }]);
  });
});

describe('buildCalendar', () => {
  const base = {
    today: '2026-08-15',
    covered: new Set<string>(),
    milestoneDays: new Set<string>(),
  };

  it('lays August 2026 out from its real first weekday', () => {
    const weeks = buildCalendar({ ...base, activeDates: new Set() });
    // Aug 1 2026 is a Saturday: six blanks, then the 1st in the last column.
    expect(weeks[0].days.slice(0, 6).every((d) => d.day === null)).toBe(true);
    expect(weeks[0].days[6].day).toBe(1);
    // 31 days + 6 leading blanks = 37 → 6 rows, padded to 42 cells.
    expect(weeks).toHaveLength(6);
    expect(weeks.flatMap((w) => w.days)).toHaveLength(42);
  });

  it('flags today and future days', () => {
    const weeks = buildCalendar({ ...base, activeDates: new Set() });
    const days = weeks.flatMap((w) => w.days).filter((d) => d.day !== null);
    expect(days.find((d) => d.day === 15)?.isToday).toBe(true);
    expect(days.find((d) => d.day === 16)?.future).toBe(true);
    expect(days.find((d) => d.day === 14)?.future).toBe(false);
  });

  it('puts covered days in the run pill but not in the active set', () => {
    const weeks = buildCalendar({
      ...base,
      activeDates: new Set(['2026-08-12', '2026-08-14', '2026-08-15']),
      covered: new Set(['2026-08-13']),
    });
    const days = weeks.flatMap((w) => w.days);
    const thirteenth = days.find((d) => d.day === 13)!;
    expect(thirteenth.active).toBe(false);
    expect(thirteenth.covered).toBe(true);
    expect(thirteenth.inRun).toBe(true);
    // 12–15 is one unbroken pill across the bridged day.
    const week = weeks.find((w) => w.days.some((d) => d.day === 13))!;
    expect(week.runs).toEqual([{ start: 3, span: 4 }]);
  });
});
