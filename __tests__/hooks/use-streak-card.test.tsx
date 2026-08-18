/**
 * useStreakCard's two non-obvious behaviours: it ignores a fetch that resolves
 * out of order, and it refetches on foreground only when the local day has
 * actually rolled over.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useStreakCard } from '@/hooks/use-streak-card';
import { useStreakSpineGate } from '@/hooks/use-feature-flag';
import { getStreakCard } from '@/lib/streak-service';
import { localTodayISO } from '@/lib/streak-logic';
import type { StreakCard } from '@/lib/streak-service';

jest.mock('@/hooks/use-feature-flag', () => ({
  useStreakSpineGate: jest.fn(() => ({ enabled: true, resolved: true })),
}));

jest.mock('@/lib/streak-context', () => ({
  useStreak: () => ({ streakVersion: 0, recordActivity: jest.fn() }),
}));

jest.mock('@/lib/streak-service', () => ({
  getStreakCard: jest.fn(),
}));

jest.mock('@/lib/streak-logic', () => ({
  localTodayISO: jest.fn(),
}));

const mockGet = getStreakCard as jest.Mock;
const mockToday = localTodayISO as jest.Mock;
const mockGate = useStreakSpineGate as jest.Mock;

function card(localDate: string, streak: number): StreakCard {
  return {
    snapshot: {
      currentStreak: streak,
      longestStreak: streak,
      lastActivityDate: localDate,
      rainChecks: 0,
      rainChecksUsed: 0,
      lastEarnDate: null,
    },
    activityDays: [],
    localDate,
    windowStart: '2026-07-12',
    alive: true,
    effectiveStreak: streak,
  };
}

describe('useStreakCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToday.mockReturnValue('2026-08-15');
    mockGate.mockReturnValue({ enabled: true, resolved: true });
  });

  describe('the flag gate it reads', () => {
    it('reads the SUBSCRIBING gate, so a late-resolving flag still starts the fetch', () => {
      // The two-sample useStreakSpineEnabled latches at 1s. A flag that lands
      // between 1s and 5s left this hook false forever while the route stayed
      // open, and reload() could not rescue it — the effect early-returns on
      // !enabled. Reading the subscribing gate is what makes the late flip
      // reach the fetch.
      mockGate.mockReturnValue({ enabled: false, resolved: false });
      mockGet.mockResolvedValue(card('2026-08-15', 12));

      const { rerender, result } = renderHook(() => useStreakCard());
      expect(mockGet).not.toHaveBeenCalled();
      expect(result.current.loaded).toBe(false);

      // PostHog answers at t=2s.
      mockGate.mockReturnValue({ enabled: true, resolved: true });
      rerender({});

      expect(mockGet).toHaveBeenCalled();
    });

    it('fetches nothing at all while the flag is off', () => {
      mockGate.mockReturnValue({ enabled: false, resolved: true });
      renderHook(() => useStreakCard());
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  it('ignores a fetch that resolves after a newer one', async () => {
    // A recorded activity can bump streakVersion while a foreground refetch is
    // still in flight. Without the ticket the slower response wins and paints
    // a stale card over the fresh one.
    let resolveSlow: (v: StreakCard) => void = () => {};
    const slow = new Promise<StreakCard>((r) => {
      resolveSlow = r;
    });
    mockGet.mockReturnValueOnce(slow);

    const { result } = renderHook(() => useStreakCard());

    mockGet.mockResolvedValueOnce(card('2026-08-15', 12));
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.card?.effectiveStreak).toBe(12));

    // The first request finally lands — and must not overwrite the newer one.
    await act(async () => {
      resolveSlow(card('2026-08-15', 3));
      await slow;
    });
    expect(result.current.card?.effectiveStreak).toBe(12);
  });

  it('refetches on foreground when the local day has rolled over', async () => {
    let handler: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: never) => {
      handler = cb as unknown as (s: string) => void;
      return { remove: jest.fn() };
    }) as never);

    mockGet.mockResolvedValue(card('2026-08-15', 12));
    const { result } = renderHook(() => useStreakCard());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    mockGet.mockClear();
    mockToday.mockReturnValue('2026-08-16'); // midnight passed while backgrounded
    await act(async () => {
      handler?.('active');
    });
    expect(mockGet).toHaveBeenCalled();
  });

  it('does not refetch on an ordinary app switch inside the same day', async () => {
    let handler: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: never) => {
      handler = cb as unknown as (s: string) => void;
      return { remove: jest.fn() };
    }) as never);

    mockGet.mockResolvedValue(card('2026-08-15', 12));
    const { result } = renderHook(() => useStreakCard());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    mockGet.mockClear();
    await act(async () => {
      handler?.('active');
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
