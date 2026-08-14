import { renderHook, act } from '@testing-library/react-native';
import { easeProgressStep, useEasedProgress } from '@/lib/tvtime-import/import-progress-easing';
import type { ImportProgress } from '@/lib/tvtime-import/import-client';

describe('easeProgressStep', () => {
  it('never returns a value past the target', () => {
    let displayed = 0;
    const target = 40;
    for (let i = 0; i < 200; i++) {
      displayed = easeProgressStep(displayed, target);
      expect(displayed).toBeLessThanOrEqual(target);
    }
    // Converges to (snaps at) the target eventually rather than crawling forever.
    expect(displayed).toBe(target);
  });

  it('snaps immediately when the target is behind or equal to displayed (never animates backwards)', () => {
    expect(easeProgressStep(40, 0)).toBe(0); // a fresh run resetting progress to 0
    expect(easeProgressStep(40, 40)).toBe(40);
    expect(easeProgressStep(40, 20)).toBe(20);
  });

  it('moves toward the target without overshooting on a single step', () => {
    const next = easeProgressStep(0, 40);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(40);
  });
});

describe('useEasedProgress', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at the initial processed value and total passes through unchanged', () => {
    const { result } = renderHook(() => useEasedProgress({ processed: 0, total: 40 }));
    expect(result.current).toEqual({ processed: 0, total: 40 });
  });

  it('eases toward a new real value over time without ever exceeding it', () => {
    const { result, rerender } = renderHook(({ progress }: { progress: ImportProgress }) => useEasedProgress(progress), {
      initialProps: { progress: { processed: 0, total: 40 } },
    });

    rerender({ progress: { processed: 8, total: 40 } });

    // Mid-flight: has moved but hasn't jumped straight to the confirmed value.
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current.processed).toBeGreaterThan(0);
    expect(result.current.processed).toBeLessThanOrEqual(8);

    // Given enough ticks it converges to (never past) the latest confirmed value.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.processed).toBe(8);
  });

  it('holds at the last known point instead of running away when the next update stalls', () => {
    const { result, rerender } = renderHook(({ progress }: { progress: ImportProgress }) => useEasedProgress(progress), {
      initialProps: { progress: { processed: 0, total: 40 } },
    });

    rerender({ progress: { processed: 8, total: 40 } });
    act(() => {
      jest.advanceTimersByTime(5000); // converges to 8 and stops ticking
    });
    expect(result.current.processed).toBe(8);

    // No new real data yet (chunk stalled) — displayed value stays put, it
    // never extrapolates toward a guessed future value.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.processed).toBe(8);
  });

  it('snaps down immediately when a fresh run resets progress to 0', () => {
    const { result, rerender } = renderHook(({ progress }: { progress: ImportProgress }) => useEasedProgress(progress), {
      initialProps: { progress: { processed: 40, total: 40 } },
    });

    rerender({ progress: { processed: 0, total: 0 } });
    expect(result.current.processed).toBe(0);
  });
});
