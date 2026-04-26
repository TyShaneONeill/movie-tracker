import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

interface Options {
  onShake: () => void;
  enabled: boolean;
}

// Earth's gravity reads ~1.0g at rest; a "deliberate shake" is conventionally
// at least 1.8g and usually requires multiple sustained crossings. The original
// 1.2g single-crossing trigger fired on routine phone handling (picking it up,
// putting it in a pocket, walking with it).
const SHAKE_THRESHOLD_G = 1.8;
const SHAKE_COUNT_REQUIRED = 3;
const SHAKE_WINDOW_MS = 800;
const COOLDOWN_MS = 10000;

export function useShakeGesture({ onShake, enabled }: Options): void {
  const crossings = useRef<number[]>([]);
  const lastTrigger = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (magnitude < SHAKE_THRESHOLD_G) return;

      // Record this crossing and prune any older than the rolling window.
      crossings.current.push(now);
      crossings.current = crossings.current.filter(
        (t) => now - t < SHAKE_WINDOW_MS,
      );

      if (
        crossings.current.length >= SHAKE_COUNT_REQUIRED &&
        now - lastTrigger.current > COOLDOWN_MS
      ) {
        lastTrigger.current = now;
        crossings.current = [];
        onShake();
      }
    });

    return () => sub.remove();
  }, [onShake, enabled]);
}
