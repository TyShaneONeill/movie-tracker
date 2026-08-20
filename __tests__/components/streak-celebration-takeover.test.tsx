/**
 * PS-15 v2 — the takeover's behaviour: what it costs when idle, what it
 * announces, and that a tap gets you out of it from any point in the sequence.
 *
 * The animation itself is not asserted here (Reanimated runs on the UI thread
 * and there is nothing to sample from jsdom) — the millisecond contract is
 * pinned in __tests__/lib/streak-celebration.test.ts. What IS asserted is the
 * part a user can get stuck in: skip must work from every phase, and the exit
 * must actually hand back so a queued milestone can follow it.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { StreakCelebrationTakeover } from '@/components/streak/streak-celebration-takeover';
import { analytics } from '@/lib/analytics';
import type { PendingCelebration } from '@/lib/streak-context';

jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn() },
}));

// The stage reaches theme-context for its palette, which drags in auth and
// expo-apple-authentication — untransformable here. Same treatment as the
// streak screen's own test.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  hapticSelection: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

const mockDismissCelebration = jest.fn();
let mockPending: PendingCelebration | null = null;

jest.mock('@/lib/streak-context', () => ({
  useStreak: () => ({
    recordActivity: jest.fn(),
    streakVersion: 0,
    pendingCelebration: mockPending,
    dismissCelebration: mockDismissCelebration,
  }),
}));

const track = analytics.track as jest.Mock;

function extension(over: Partial<PendingCelebration> = {}): PendingCelebration {
  return { id: 1, from: 12, to: 13, milestone: null, ...over };
}

/** Renders and lets the Reduce Motion probe resolve, which starts the sequence. */
async function mount(celebration: PendingCelebration | null) {
  mockPending = celebration;
  const utils = render(<StreakCelebrationTakeover />);
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('StreakCelebrationTakeover — idle', () => {
  it('renders nothing and announces nothing when no streak extended', async () => {
    const { toJSON } = await mount(null);
    expect(toJSON()).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});

describe('StreakCelebrationTakeover — the sequence', () => {
  it('announces the extension it is about to play', async () => {
    await mount(extension());
    expect(track).toHaveBeenCalledWith('streak:celebration_shown', {
      from: 12,
      to: 13,
      milestone: null,
    });
  });

  it('carries the milestone in the payload', async () => {
    await mount(extension({ from: 29, to: 30, milestone: 30 }));
    expect(track).toHaveBeenCalledWith('streak:celebration_shown', {
      from: 29,
      to: 30,
      milestone: 30,
    });
  });

  it('shows both the number it came from and the one it lands on', async () => {
    const { getByText, getAllByText } = await mount(extension());
    // 12 → 13: the shared leading 1 is static, the ones column stacks 2 over 3.
    expect(getAllByText('1').length).toBeGreaterThan(0);
    expect(getByText('2')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('day streak')).toBeTruthy();
    expect(getByText('Keep it rolling')).toBeTruthy();
  });
});

describe('StreakCelebrationTakeover — tap to skip', () => {
  // Every named beat of the House Cut, so no phase can trap a user mid-sequence.
  it.each([
    ['dim', 0],
    ['camera', 200],
    ['spinUp', 500],
    ['flicker', 900],
    ['hold', 1400],
    ['roll', 1600],
    ['number', 2000],
    ['button', 2300],
  ])('skips from %s and reports where it landed', async (phase, at) => {
    const { getByLabelText } = await mount(extension());
    act(() => {
      jest.advanceTimersByTime(at as number);
    });

    fireEvent.press(getByLabelText('Skip the streak celebration'));

    const skipped = track.mock.calls.find((c) => c[0] === 'streak:celebration_skipped');
    expect(skipped).toBeDefined();
    expect(skipped![1].phase).toBe(phase);
    expect(skipped![1].at_ms).toBeGreaterThanOrEqual(at as number);
    // A skip lands you AT the end state; it does not dismiss.
    expect(mockDismissCelebration).not.toHaveBeenCalled();
  });

  it('dismisses on a second tap, once it is at rest', async () => {
    const { getByLabelText } = await mount(extension());
    const backdrop = getByLabelText('Skip the streak celebration');

    fireEvent.press(backdrop);
    fireEvent.press(backdrop);
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockDismissCelebration).toHaveBeenCalledTimes(1);
  });

  it('skips only once — a second tap does not re-report a skip', async () => {
    const { getByLabelText } = await mount(extension());
    const backdrop = getByLabelText('Skip the streak celebration');

    fireEvent.press(backdrop);
    fireEvent.press(backdrop);

    expect(
      track.mock.calls.filter((c) => c[0] === 'streak:celebration_skipped')
    ).toHaveLength(1);
  });
});

/**
 * The takeover is a sibling of the navigator, not a Modal, so nothing swallows
 * the Android back gesture on its behalf. Left unhandled, back pops the route
 * UNDERNEATH a takeover that stays on screen.
 */
describe('StreakCelebrationTakeover — Android back', () => {
  /** The handler the takeover registered, or null if it registered none. */
  function backHandler(): (() => boolean) | null {
    const add = BackHandler.addEventListener as unknown as jest.Mock;
    const call = add.mock.calls.find((c) => c[0] === 'hardwareBackPress');
    return call ? call[1] : null;
  }

  beforeEach(() => {
    jest.spyOn(BackHandler, 'addEventListener');
  });

  it('registers a hardwareBackPress handler while it is up', async () => {
    await mount(extension());
    expect(backHandler()).not.toBeNull();
  });

  it('registers nothing when idle — back must behave normally', async () => {
    await mount(null);
    expect(backHandler()).toBeNull();
  });

  it('swallows the event so back cannot pop the route underneath', async () => {
    await mount(extension());
    expect(backHandler()!()).toBe(true);
  });

  it('skips mid-sequence, exactly like a tap anywhere', async () => {
    await mount(extension());
    act(() => {
      jest.advanceTimersByTime(900);
    });

    act(() => {
      backHandler()!();
    });

    const skipped = track.mock.calls.find((c) => c[0] === 'streak:celebration_skipped');
    expect(skipped).toBeDefined();
    expect(skipped![1].phase).toBe('flicker');
    expect(mockDismissCelebration).not.toHaveBeenCalled();
  });

  it('dismisses once at rest, exactly like a tap anywhere', async () => {
    await mount(extension());

    act(() => {
      backHandler()!(); // skips to the end state
    });
    act(() => {
      backHandler()!(); // now dismisses
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockDismissCelebration).toHaveBeenCalledTimes(1);
  });

  it('unregisters when it unmounts', async () => {
    const remove = jest.fn();
    (BackHandler.addEventListener as unknown as jest.Mock).mockReturnValue({ remove });

    const { unmount } = await mount(extension());
    unmount();

    expect(remove).toHaveBeenCalled();
  });
});

describe('StreakCelebrationTakeover — the button', () => {
  it('reports the tap and hands back only after the exit has run', async () => {
    const { getByLabelText } = await mount(extension());

    fireEvent.press(getByLabelText('Keep it rolling'));
    // Carries which extension it closed and how long the user gave it —
    // "sat through it" and "skipped to the button" read very differently.
    const tap = track.mock.calls.find((c) => c[0] === 'streak:celebration_cta_tap');
    expect(tap).toBeDefined();
    expect(tap![1]).toMatchObject({ from: 12, to: 13, milestone: null });
    expect(typeof tap![1].at_ms).toBe('number');
    // Handing back at t=0 would let a milestone modal land on the exit.
    expect(mockDismissCelebration).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(mockDismissCelebration).toHaveBeenCalledTimes(1);
  });

  it('cannot be double-dismissed', async () => {
    const { getByLabelText } = await mount(extension());
    const cta = getByLabelText('Keep it rolling');

    fireEvent.press(cta);
    fireEvent.press(cta);
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockDismissCelebration).toHaveBeenCalledTimes(1);
  });
});

describe('StreakCelebrationTakeover — Reduce Motion', () => {
  it('goes straight to the lit end state with the button already in', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { getByText } = await mount(extension());

    expect(getByText('Keep it rolling')).toBeTruthy();
    expect(getByText('day streak')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('streak:celebration_shown', {
      from: 12,
      to: 13,
      milestone: null,
    });
  });

  it('still dismisses on the button', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { getByLabelText } = await mount(extension());

    fireEvent.press(getByLabelText('Keep it rolling'));
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockDismissCelebration).toHaveBeenCalledTimes(1);
  });
});
