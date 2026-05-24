import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useTour } from '@/lib/onboarding/tour-context';

interface TourTargetProps {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const MAX_MEASURE_ATTEMPTS = 20;
const MEASURE_RETRY_DELAY_MS = 100;
// How many consecutive identical measurements to require before treating
// the layout as settled and stopping the poll. Two is enough to catch
// most transient mid-layout positions without dragging the poll out.
const STABLE_MEASUREMENT_THRESHOLD = 2;

/**
 * Registers its child's on-screen rect with the tour context so the overlay
 * can spotlight it. `collapsable={false}` is required on Android — without
 * it RN may optimize the View away and measureInWindow returns garbage.
 *
 * Polls measureInWindow until two consecutive calls return the same rect,
 * registering each non-zero result along the way. Stopping at the first
 * non-zero rect was unreliable: the home header re-lays-out after the
 * initial frame (safe-area inset arrival on Android, font metrics
 * finalizing, scroll-content sizing), and the early measurement landed
 * the spotlight on a position the icon had already moved away from.
 */
export function TourTarget({ id, children, style }: TourTargetProps) {
  const { registerTarget, unregisterTarget, currentStep, isActive } = useTour();
  const ref = useRef<View>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  const startMeasurePoll = useCallback(() => {
    cancelPollRef.current?.();

    let cancelled = false;
    let attempts = 0;
    let lastRect: { x: number; y: number; width: number; height: number } | null = null;
    let stableMatches = 0;

    const tick = () => {
      if (cancelled) return;
      attempts++;
      const node = ref.current;
      if (!node) {
        if (attempts < MAX_MEASURE_ATTEMPTS) {
          setTimeout(tick, MEASURE_RETRY_DELAY_MS);
        }
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        if (width === 0 || height === 0) {
          if (attempts < MAX_MEASURE_ATTEMPTS) {
            setTimeout(tick, MEASURE_RETRY_DELAY_MS);
          }
          return;
        }
        const rect = { x, y, width, height };
        registerTarget(id, rect);

        if (
          lastRect &&
          lastRect.x === x &&
          lastRect.y === y &&
          lastRect.width === width &&
          lastRect.height === height
        ) {
          stableMatches++;
        } else {
          stableMatches = 1;
        }
        lastRect = rect;

        if (stableMatches < STABLE_MEASUREMENT_THRESHOLD && attempts < MAX_MEASURE_ATTEMPTS) {
          setTimeout(tick, MEASURE_RETRY_DELAY_MS);
        }
      });
    };

    requestAnimationFrame(tick);

    const cancel = () => {
      cancelled = true;
    };
    cancelPollRef.current = cancel;
    return cancel;
  }, [id, registerTarget]);

  useEffect(() => {
    startMeasurePoll();
    // Cleanup always cancels whichever poll is currently active in the ref,
    // not just the one this effect kicked off — handleLayout / tour-activation
    // may have superseded it with a fresher poll.
    return () => {
      cancelPollRef.current?.();
      cancelPollRef.current = null;
    };
  }, [startMeasurePoll]);

  const handleLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      // A layout change is the strongest signal the rect may have moved; restart
      // the poll so we re-converge on the new settled position.
      startMeasurePoll();
    },
    [startMeasurePoll]
  );

  // Re-measure when the tour focuses this target. The icon may have moved
  // since the initial registration (parent re-layout, scroll, transition).
  useEffect(() => {
    if (isActive && currentStep?.targetId === id) {
      startMeasurePoll();
    }
  }, [isActive, currentStep, id, startMeasurePoll]);

  useEffect(() => {
    return () => unregisterTarget(id);
  }, [id, unregisterTarget]);

  return (
    <View ref={ref} onLayout={handleLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}
