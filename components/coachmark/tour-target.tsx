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

/**
 * Registers its child's on-screen rect with the tour context so the overlay
 * can spotlight it. `collapsable={false}` is required on Android — without
 * it RN may optimize the View away and measureInWindow returns garbage.
 *
 * The component polls measureInWindow on mount until it returns non-zero
 * dimensions (or the attempt budget is exhausted). This is more reliable
 * than waiting for onLayout, which doesn't always fire predictably when a
 * wrapper around a tightly-sized child renders during a navigation
 * transition.
 */
export function TourTarget({ id, children, style }: TourTargetProps) {
  const { registerTarget, unregisterTarget, currentStep, isActive } = useTour();
  const ref = useRef<View>(null);

  const measureAndRegister = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      if (width === 0 || height === 0) return;
      registerTarget(id, { x, y, width, height });
    });
  }, [id, registerTarget]);

  // Mount-time poll: keep trying until we get a non-zero rect or exhaust the budget.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

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
        registerTarget(id, { x, y, width, height });
      });
    };

    // Defer one frame so the initial layout has a chance to settle.
    requestAnimationFrame(tick);

    return () => {
      cancelled = true;
    };
  }, [id, registerTarget]);

  const handleLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      requestAnimationFrame(measureAndRegister);
    },
    [measureAndRegister]
  );

  // Re-measure when the tour focuses this target (the element may have moved
  // since the initial registration, e.g., after a parent re-layout).
  useEffect(() => {
    if (isActive && currentStep?.targetId === id) {
      requestAnimationFrame(measureAndRegister);
    }
  }, [isActive, currentStep, id, measureAndRegister]);

  useEffect(() => {
    return () => unregisterTarget(id);
  }, [id, unregisterTarget]);

  return (
    <View ref={ref} onLayout={handleLayout} collapsable={false} style={style}>
      {children}
    </View>
  );
}
