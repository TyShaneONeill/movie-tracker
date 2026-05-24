import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useTour } from '@/lib/onboarding/tour-context';

interface TourTargetProps {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Registers its child's on-screen rect with the tour context so the overlay
 * can spotlight it. `collapsable={false}` is required on Android — without
 * it RN may optimize the View away and measureInWindow returns garbage.
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

  const handleLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      // Defer one frame so absolute coords reflect any parent transforms / blur layers.
      requestAnimationFrame(measureAndRegister);
    },
    [measureAndRegister]
  );

  // Re-measure when the tour focuses this target (the element may have moved
  // since onLayout last fired, e.g., after a parent re-layout).
  useEffect(() => {
    if (isActive && currentStep?.targetId === id) {
      measureAndRegister();
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
