import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const SLIDE_DURATION_MS = 250;
const SCREEN_WIDTH = Dimensions.get('window').width;

export type SlideDirection = 'next' | 'prev' | 'none';

interface MonthYear {
  year: number;
  month: number;
}

/**
 * Pure helper. Ordinal `year * 12 + month` comparison handles year
 * boundaries for free: (2026, 12) → (2027, 1) is +1 ordinal = 'next'.
 *
 * Returns 'none' on initial mount (prev === null) so we don't animate
 * the first render — the calendar appears in place from the SP2
 * AsyncStorage hydration path.
 */
export function inferDirection(
  prev: MonthYear | null,
  current: MonthYear
): SlideDirection {
  if (prev === null) return 'none';
  const prevOrdinal = prev.year * 12 + prev.month;
  const currOrdinal = current.year * 12 + current.month;
  if (currOrdinal > prevOrdinal) return 'next';
  if (currOrdinal < prevOrdinal) return 'prev';
  return 'none';
}

/**
 * Drives a horizontal slide on month change.
 *
 * On (year, month) prop change:
 *   - Infers direction from previous → current ordinal comparison
 *   - For 'next': new month enters from off-screen-right and slides to 0
 *   - For 'prev': new month enters from off-screen-left and slides to 0
 *   - For 'none' or reduce-motion: snaps in place
 *
 * Reanimated's withTiming auto-cancels on new assignment to the shared
 * value, so rapid month-flips interrupt cleanly and animate to the latest.
 */
export function useMonthSlideAnimation(year: number, month: number) {
  const prevRef = useRef<MonthYear | null>(null);
  const translateX = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const direction = inferDirection(prevRef.current, { year, month });
    prevRef.current = { year, month };

    if (direction === 'none' || reduceMotion) {
      translateX.value = 0;
      return;
    }

    const startX = direction === 'next' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    translateX.value = withSequence(
      withTiming(startX, { duration: 0 }),
      withTiming(0, {
        duration: SLIDE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [year, month, reduceMotion, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { animatedStyle };
}
