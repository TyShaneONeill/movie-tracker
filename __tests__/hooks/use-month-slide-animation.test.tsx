import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import {
  inferDirection,
  useMonthSlideAnimation,
} from '@/hooks/use-month-slide-animation';

describe('inferDirection', () => {
  it('returns "none" when prev is null (initial mount)', () => {
    expect(inferDirection(null, { year: 2026, month: 4 })).toBe('none');
  });

  it('returns "next" for forward navigation in same year', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 5 })
    ).toBe('next');
  });

  it('returns "prev" for backward navigation in same year', () => {
    expect(
      inferDirection({ year: 2026, month: 5 }, { year: 2026, month: 4 })
    ).toBe('prev');
  });

  it('returns "next" across December to January year boundary', () => {
    expect(
      inferDirection({ year: 2026, month: 12 }, { year: 2027, month: 1 })
    ).toBe('next');
  });

  it('returns "prev" across January to December year boundary', () => {
    expect(
      inferDirection({ year: 2026, month: 1 }, { year: 2025, month: 12 })
    ).toBe('prev');
  });

  it('returns "next" for multi-month forward jumps', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 7 })
    ).toBe('next');
  });

  it('returns "none" when same month re-rendered', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 4 })
    ).toBe('none');
  });
});

describe('useMonthSlideAnimation', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an animatedStyle on initial render', () => {
    const { result } = renderHook(() =>
      useMonthSlideAnimation(2026, 4)
    );
    expect(result.current.animatedStyle).toBeDefined();
  });

  it('returns a stable animatedStyle reference shape across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ year, month }: { year: number; month: number }) =>
        useMonthSlideAnimation(year, month),
      { initialProps: { year: 2026, month: 4 } }
    );

    const initial = result.current.animatedStyle;
    rerender({ year: 2026, month: 5 });
    const afterChange = result.current.animatedStyle;

    expect(initial).toBeDefined();
    expect(afterChange).toBeDefined();
  });

  it('subscribes to reduceMotionChanged on mount', () => {
    renderHook(() => useMonthSlideAnimation(2026, 4));
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function)
    );
  });

  it('unsubscribes from reduceMotionChanged on unmount', () => {
    const removeMock = jest.fn();
    (AccessibilityInfo.addEventListener as jest.Mock).mockReturnValue({
      remove: removeMock,
    });

    const { unmount } = renderHook(() =>
      useMonthSlideAnimation(2026, 4)
    );
    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
