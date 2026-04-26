import { useEffect } from 'react';

interface Options {
  onShake: () => void;
  enabled: boolean;
}

export function useShakeGesture(_opts: Options): void {
  useEffect(() => {
    /* intentionally empty — Metro resolves useShakeGesture.ios.ts on iOS */
  }, []);
}
