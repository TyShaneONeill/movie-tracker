/**
 * PS-15 v2 — the takeover's trigger rule and its timing contract.
 *
 * The trigger tests exist because the RPC's returned snapshot cannot, on its
 * own, tell an extension from a same-day repeat or from a reset — all three
 * end with a current_streak and today's date. Celebrating a repeat is the
 * failure users would notice fastest.
 *
 * The timeline tests pin the marks to the playground's signed-off "House Cut"
 * export. They are deliberately literal: if someone retunes a preset value, the
 * derived marks move and these fail loudly rather than the animation quietly
 * drifting off the spec.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_CELEBRATION_MEMORY,
  HOUSE_CUT,
  PRE_BUTTON_GUARD_MS,
  clearCelebrationMemory,
  deriveCelebration,
  digitColumns,
  flickerOnsets,
  flickerSpan,
  nextCelebrationMemory,
  phaseAt,
  readCelebrationMemory,
  takeoverTimeline,
  writeCelebrationMemory,
  type CelebrationMemory,
} from '@/lib/streak-celebration';
import type { StreakRpcResult } from '@/lib/streak-service';

function result(over: Partial<StreakRpcResult> = {}): StreakRpcResult {
  return {
    current_streak: 13,
    longest_streak: 13,
    rain_checks: 0,
    rain_checks_used: 0,
    last_activity_date: '2026-08-20',
    local_date: '2026-08-20',
    first_action: 'log',
    milestone: null,
    rain_check_consumed: false,
    rain_check_earned: false,
    ...over,
  };
}

const seen = (lastStreak: number | null, lastCelebratedDate: string | null = null):
  CelebrationMemory => ({ lastStreak, lastCelebratedDate });

describe('deriveCelebration — server truth (previous_streak + advanced)', () => {
  it('fires on the call that extended the streak', () => {
    const trigger = deriveCelebration(
      result({ previous_streak: 12, current_streak: 13, advanced: true }),
      EMPTY_CELEBRATION_MEMORY
    );
    expect(trigger).toEqual({ from: 12, to: 13, milestone: null });
  });

  it('stays silent on a same-day repeat — the RPC is idempotent, the UI must be too', () => {
    expect(
      deriveCelebration(
        result({ previous_streak: 13, current_streak: 13, advanced: false }),
        EMPTY_CELEBRATION_MEMORY
      )
    ).toBeNull();
  });

  it('stays silent on a reset — 12 → 1 advanced the day, but the streak BROKE', () => {
    expect(
      deriveCelebration(
        result({ previous_streak: 12, current_streak: 1, advanced: true }),
        EMPTY_CELEBRATION_MEMORY
      )
    ).toBeNull();
  });

  it('fires for a brand-new user going 0 → 1', () => {
    expect(
      deriveCelebration(
        result({ previous_streak: 0, current_streak: 1, advanced: true }),
        EMPTY_CELEBRATION_MEMORY
      )
    ).toEqual({ from: 0, to: 1, milestone: null });
  });

  it('carries the milestone through so the takeover can hand off afterwards', () => {
    expect(
      deriveCelebration(
        result({ previous_streak: 29, current_streak: 30, advanced: true, milestone: 30 }),
        EMPTY_CELEBRATION_MEMORY
      )
    ).toEqual({ from: 29, to: 30, milestone: 30 });
  });

  it('fires once per local day even if the server would say advanced twice', () => {
    expect(
      deriveCelebration(
        result({ previous_streak: 12, current_streak: 13, advanced: true }),
        seen(13, '2026-08-20')
      )
    ).toBeNull();
  });
});

describe('deriveCelebration — fallback for a binary older than the migration', () => {
  it('reads an extension off the remembered baseline', () => {
    expect(deriveCelebration(result({ current_streak: 13 }), seen(12))).toEqual({
      from: 12,
      to: 13,
      milestone: null,
    });
  });

  it('stays silent on a same-day repeat: the streak did not move', () => {
    expect(deriveCelebration(result({ current_streak: 13 }), seen(13))).toBeNull();
  });

  it('stays silent on a reset', () => {
    expect(deriveCelebration(result({ current_streak: 1 }), seen(12))).toBeNull();
  });

  it('seeds rather than guesses when there is no baseline yet', () => {
    // One missed celebration on a fresh install beats firing on a repeat.
    expect(deriveCelebration(result({ current_streak: 13 }), EMPTY_CELEBRATION_MEMORY))
      .toBeNull();
  });
});

describe('nextCelebrationMemory', () => {
  it('records the new streak whether or not it celebrated', () => {
    expect(nextCelebrationMemory(result({ current_streak: 13 }), seen(12), false))
      .toEqual({ lastStreak: 13, lastCelebratedDate: null });
  });

  it('stamps the local date only when it celebrated', () => {
    expect(nextCelebrationMemory(result({ current_streak: 13 }), seen(12), true))
      .toEqual({ lastStreak: 13, lastCelebratedDate: '2026-08-20' });
  });

  it('keeps an earlier celebration date when this call did not celebrate', () => {
    expect(
      nextCelebrationMemory(result({ current_streak: 13 }), seen(13, '2026-08-20'), false)
    ).toEqual({ lastStreak: 13, lastCelebratedDate: '2026-08-20' });
  });

  it('seeding a fresh install leaves a usable baseline for the next action', () => {
    const seeded = nextCelebrationMemory(
      result({ current_streak: 12 }),
      EMPTY_CELEBRATION_MEMORY,
      false
    );
    expect(deriveCelebration(result({ current_streak: 13 }), seeded)).toEqual({
      from: 12,
      to: 13,
      milestone: null,
    });
  });
});

describe('celebration memory — per account, and gone on sign-out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
  });

  it('reads and writes under a key scoped to the user', async () => {
    await writeCelebrationMemory('user-a', {
      lastStreak: 12,
      lastCelebratedDate: '2026-08-20',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@streak_celebration_memory:user-a',
      JSON.stringify({ lastStreak: 12, lastCelebratedDate: '2026-08-20' })
    );

    await readCelebrationMemory('user-b');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      '@streak_celebration_memory:user-b'
    );
  });

  it('reads an empty memory rather than throwing on corrupt JSON', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{not json');
    await expect(readCelebrationMemory('user-a')).resolves.toEqual(
      EMPTY_CELEBRATION_MEMORY
    );
  });

  it('drops every account on sign-out, leaving unrelated keys alone', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      '@streak_celebration_memory:user-a',
      '@streak_celebration_memory:user-b',
      '@some_other_feature',
    ]);

    await clearCelebrationMemory();

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      '@streak_celebration_memory:user-a',
      '@streak_celebration_memory:user-b',
    ]);
  });

  it('does not call multiRemove when there is nothing of ours to clear', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(['@unrelated']);
    await clearCelebrationMemory();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });

  it('never throws out of a sign-out, whatever storage does', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(new Error('disk'));
    await expect(clearCelebrationMemory()).resolves.toBeUndefined();
  });
});

describe('takeoverTimeline — the House Cut contract', () => {
  const t = takeoverTimeline(false);

  it('lands every mark on the signed-off millisecond', () => {
    expect(t).toEqual({
      dimEnd: 260,
      camStart: 143,
      camEnd: 443,
      spinStart: 403,
      spinEnd: 823,
      flickStart: 823,
      flickEnd: 1353,
      flipAt: 1483,
      flipEnd: 1923,
      holdBtn: 300,
      btnAt: 2223,
      btnEnd: 2543,
      total: 2543,
    });
  });

  it('holds the number alone for 300ms before the button interrupts it', () => {
    expect(t.btnAt - t.flipEnd).toBe(300);
  });

  it('gates the roll on the beam being locked, with a 130ms beat of anticipation', () => {
    expect(t.flipAt - t.flickEnd).toBe(HOUSE_CUT.lockDelay);
  });

  it('reaches the button inside the guard rail', () => {
    expect(t.btnAt).toBeLessThanOrEqual(PRE_BUTTON_GUARD_MS);
  });

  it('holds longer at a milestone — same surface, more room', () => {
    const m = takeoverTimeline(true);
    expect(m.holdBtn).toBe(480);
    expect(m.btnAt).toBe(2403);
    // Everything up to the roll is identical; only the hold stretches.
    expect(m.flipEnd).toBe(t.flipEnd);
  });
});

describe('flicker', () => {
  it('spans two stutters plus the lock ramp', () => {
    expect(flickerSpan()).toBe(530);
  });

  it('lights on the 110ms rhythm, 70ms lit each', () => {
    expect(flickerOnsets()).toEqual([110, 290]);
  });

  it('locks the beam exactly at the end of its span', () => {
    const t = takeoverTimeline(false);
    expect(t.flickStart + flickerSpan()).toBe(t.flickEnd);
  });
});

describe('digitColumns — only the digits that change move', () => {
  it('rolls one column for 12 → 13', () => {
    expect(digitColumns(12, 13)).toEqual([
      { previous: '1', next: '1', rolls: false },
      { previous: '2', next: '3', rolls: true },
    ]);
  });

  it('rolls both for 29 → 30', () => {
    expect(digitColumns(29, 30).map((c) => c.rolls)).toEqual([true, true]);
  });

  it('right-aligns when the number grows a place: 9 → 10', () => {
    expect(digitColumns(9, 10)).toEqual([
      { previous: '', next: '1', rolls: true },
      { previous: '9', next: '0', rolls: true },
    ]);
  });

  it('handles a first-ever streak, 0 → 1', () => {
    expect(digitColumns(0, 1)).toEqual([{ previous: '0', next: '1', rolls: true }]);
  });
});

describe('phaseAt — where a skip landed', () => {
  const t = takeoverTimeline(false);

  it.each([
    [0, 'dim'],
    [200, 'camera'],
    [500, 'spinUp'],
    [900, 'flicker'],
    [1400, 'hold'],
    [1600, 'roll'],
    [2000, 'number'],
    [2300, 'button'],
    [2600, 'rest'],
  ])('reports %ims as %s', (ms, phase) => {
    expect(phaseAt(ms as number, t)).toBe(phase);
  });
});
