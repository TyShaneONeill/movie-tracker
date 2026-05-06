import { useCallback } from 'react';
import { useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

const MAX_AMPLITUDE = 4;
const SPRING_CONFIG = { damping: 8, stiffness: 220, mass: 0.4 };

/**
 * Canvas-level bag jiggle hook. Owns Skia-friendly offset SharedValues that
 * apply a small damped wobble (~3–4px max, ~200ms decay) when an impact
 * event fires. Pure visual polish — no physics knowledge, no sensors.
 */
export function useBagJiggle() {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const triggerJiggle = useCallback(
    (velocity: number) => {
      // Amplitude proportional to impact velocity, capped.
      const amp = Math.min(velocity * 0.5, MAX_AMPLITUDE);
      // Random direction (-amp..amp) on both axes so successive impacts feel varied.
      const dx = (Math.random() - 0.5) * 2 * amp;
      const dy = (Math.random() - 0.5) * 2 * amp;
      offsetX.value = withSequence(
        withSpring(dx, SPRING_CONFIG),
        withSpring(0, SPRING_CONFIG),
      );
      offsetY.value = withSequence(
        withSpring(dy, SPRING_CONFIG),
        withSpring(0, SPRING_CONFIG),
      );
    },
    [offsetX, offsetY],
  );

  return { offsetX, offsetY, triggerJiggle };
}
