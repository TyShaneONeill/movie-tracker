import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

interface Options {
  onShake: () => void;
  enabled: boolean;
}

const THRESHOLD_G = 1.2;
const WINDOW_MS = 100;
const COOLDOWN_MS = 10000;

export function useShakeGesture({ onShake, enabled }: Options): void {
  const lastTrigger = useRef(0);
  const windowStart = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (magnitude > THRESHOLD_G) {
        if (windowStart.current === null) windowStart.current = now;
        if (now - lastTrigger.current > COOLDOWN_MS) {
          lastTrigger.current = now;
          windowStart.current = null;
          onShake();
        }
      } else if (windowStart.current && now - windowStart.current > WINDOW_MS) {
        windowStart.current = null;
      }
    });

    return () => sub.remove();
  }, [onShake, enabled]);
}
