import {
  applyActivity,
  daysBetween,
  isStreakAlive,
  effectiveStreak,
  type StreakSnapshot,
} from '../../lib/streak-logic';

// These tests encode the LOCKED streak semantics (ADR 2026-07-06) and must stay
// in lockstep with record_user_activity() in
// supabase/migrations/20260707150100_record_user_activity_rpc.sql.

function snap(overrides: Partial<StreakSnapshot> = {}): StreakSnapshot {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    rainChecks: 0,
    rainChecksUsed: 0,
    lastEarnDate: null,
    ...overrides,
  };
}

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-07-01', '2026-07-08')).toBe(7);
    expect(daysBetween('2026-07-07', '2026-07-07')).toBe(0);
  });

  it('is DST-agnostic and crosses month/year boundaries', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 not a leap year
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    // A US DST spring-forward day is still exactly one calendar day.
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
  });
});

describe('applyActivity — first activity ever', () => {
  it('starts a streak at 1 (non-earn action earns no rain check)', () => {
    const t = applyActivity(null, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(1);
    expect(t.next.longestStreak).toBe(1);
    expect(t.next.rainChecks).toBe(0);
    expect(t.advanced).toBe(true);
    expect(t.rainCheckEarned).toBe(false);
  });

  it('earns a rain check on a core creation action', () => {
    const t = applyActivity(null, 'scan', '2026-07-07');
    expect(t.next.rainChecks).toBe(1);
    expect(t.next.lastEarnDate).toBe('2026-07-07');
    expect(t.rainCheckEarned).toBe(true);
  });
});

describe('applyActivity — consecutive day', () => {
  it('advances +1 with no rain-check consumption', () => {
    const prev = snap({ currentStreak: 4, longestStreak: 4, lastActivityDate: '2026-07-06', rainChecks: 1 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(5);
    expect(t.next.rainChecks).toBe(1);
    expect(t.next.rainChecksUsed).toBe(0);
    expect(t.rainCheckConsumed).toBe(false);
  });
});

describe('applyActivity — gap coverage combinations', () => {
  it('1 missed day with 1 banked → covered, streak advances', () => {
    // last activity 2 calendar days before today = 1 fully-missed day.
    const prev = snap({ currentStreak: 5, longestStreak: 5, lastActivityDate: '2026-07-05', rainChecks: 1 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(6);
    expect(t.next.rainChecks).toBe(0);
    expect(t.next.rainChecksUsed).toBe(1);
    expect(t.rainCheckConsumed).toBe(true);
  });

  it('2 missed days with 1 banked → 1 uncovered, streak resets to 1', () => {
    const prev = snap({ currentStreak: 5, longestStreak: 9, lastActivityDate: '2026-07-04', rainChecks: 1 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(1);
    expect(t.next.rainChecks).toBe(0);
    expect(t.next.rainChecksUsed).toBe(1);
    expect(t.next.longestStreak).toBe(9); // monotonic — unchanged by reset
  });

  it('3 missed days with 2 banked → 1 uncovered, streak resets to 1', () => {
    const prev = snap({ currentStreak: 12, longestStreak: 12, lastActivityDate: '2026-07-03', rainChecks: 2 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(1);
    expect(t.next.rainChecks).toBe(0);
    expect(t.next.rainChecksUsed).toBe(2);
  });

  it('2 missed days with 2 banked → fully covered, advances', () => {
    const prev = snap({ currentStreak: 3, longestStreak: 3, lastActivityDate: '2026-07-04', rainChecks: 2 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.next.currentStreak).toBe(4);
    expect(t.next.rainChecks).toBe(0);
    expect(t.next.rainChecksUsed).toBe(2);
  });
});

describe('applyActivity — same-day idempotency', () => {
  it('a repeat call the same day does not re-advance the streak', () => {
    const prev = snap({ currentStreak: 5, longestStreak: 5, lastActivityDate: '2026-07-07', rainChecks: 1 });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.advanced).toBe(false);
    expect(t.next.currentStreak).toBe(5);
    expect(t.milestone).toBeNull();
  });

  it('earns at most one rain check per day, even across earn-actions', () => {
    // First earn-action of the day earns.
    const first = applyActivity(
      snap({ currentStreak: 2, longestStreak: 2, lastActivityDate: '2026-07-06', rainChecks: 0 }),
      'first_take',
      '2026-07-07'
    );
    expect(first.next.rainChecks).toBe(1);
    expect(first.next.lastEarnDate).toBe('2026-07-07');
    // A second earn-action the same day does NOT earn again.
    const second = applyActivity(first.next, 'review', '2026-07-07');
    expect(second.next.rainChecks).toBe(1);
    expect(second.rainCheckEarned).toBe(false);
  });
});

describe('applyActivity — rain-check cap', () => {
  it('never banks more than 2', () => {
    const prev = snap({ currentStreak: 3, longestStreak: 3, lastActivityDate: '2026-07-06', rainChecks: 2, lastEarnDate: '2026-07-06' });
    const t = applyActivity(prev, 'scan', '2026-07-07');
    expect(t.next.rainChecks).toBe(2);
    expect(t.rainCheckEarned).toBe(false);
  });
});

describe('applyActivity — milestones', () => {
  it('flags a milestone only on the advancing call that lands on the threshold', () => {
    const toThree = applyActivity(
      snap({ currentStreak: 2, longestStreak: 2, lastActivityDate: '2026-07-06' }),
      'comment',
      '2026-07-07'
    );
    expect(toThree.next.currentStreak).toBe(3);
    expect(toThree.milestone).toBe(3);

    const toFour = applyActivity(toThree.next, 'comment', '2026-07-08');
    expect(toFour.milestone).toBeNull();
  });
});

describe('applyActivity — clock moved backward', () => {
  it('does not rewind the streak when today < last activity date', () => {
    const prev = snap({ currentStreak: 5, longestStreak: 5, lastActivityDate: '2026-07-08' });
    const t = applyActivity(prev, 'comment', '2026-07-07');
    expect(t.advanced).toBe(false);
    expect(t.next.currentStreak).toBe(5);
  });
});

describe('timezone independence', () => {
  it('depends only on the local date string, so UTC+13 and UTC-11 users at one instant get independent, correct results', () => {
    // Same wall-clock instant, but the UTC+13 user is already on the 8th while
    // the UTC-11 user is still on the 7th. The transition is purely date-driven.
    const base = snap({ currentStreak: 3, longestStreak: 3, lastActivityDate: '2026-07-07', rainChecks: 0 });
    const plus13 = applyActivity(base, 'comment', '2026-07-08'); // consecutive → advance
    const minus11 = applyActivity(base, 'comment', '2026-07-07'); // same day → idempotent
    expect(plus13.next.currentStreak).toBe(4);
    expect(plus13.advanced).toBe(true);
    expect(minus11.next.currentStreak).toBe(3);
    expect(minus11.advanced).toBe(false);
  });
});

describe('isStreakAlive / effectiveStreak', () => {
  it('is alive when acted today or yesterday', () => {
    expect(isStreakAlive(snap({ currentStreak: 5, lastActivityDate: '2026-07-07' }), '2026-07-07')).toBe(true);
    expect(isStreakAlive(snap({ currentStreak: 5, lastActivityDate: '2026-07-06' }), '2026-07-07')).toBe(true);
  });

  it('is dead when the gap exceeds banked rain checks', () => {
    expect(isStreakAlive(snap({ currentStreak: 5, lastActivityDate: '2026-07-04', rainChecks: 0 }), '2026-07-07')).toBe(false);
    expect(effectiveStreak(snap({ currentStreak: 5, lastActivityDate: '2026-07-04', rainChecks: 0 }), '2026-07-07')).toBe(0);
  });

  it('is alive when banked rain checks cover the missed days', () => {
    // last activity 2 days before today = 1 missed day, 1 rain check covers it.
    expect(isStreakAlive(snap({ currentStreak: 5, lastActivityDate: '2026-07-05', rainChecks: 1 }), '2026-07-07')).toBe(true);
    expect(effectiveStreak(snap({ currentStreak: 5, lastActivityDate: '2026-07-05', rainChecks: 1 }), '2026-07-07')).toBe(5);
  });

  it('treats a zeroed (reconciled) streak as dead', () => {
    expect(isStreakAlive(snap({ currentStreak: 0, lastActivityDate: '2026-07-05' }), '2026-07-07')).toBe(false);
  });
});
