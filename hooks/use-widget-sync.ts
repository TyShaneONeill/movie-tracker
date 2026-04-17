import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncWidgetCache } from '@/lib/widget-cache';

/**
 * Mounts once at the app root. Keeps the iOS home-screen widget's App Groups
 * cache fresh by firing syncWidgetCache on mount and every foreground event.
 * Skips triggers while a sync is already in flight - no-op on other platforms.
 */
export function useWidgetSync(): void {
  const inFlight = useRef(false);

  useEffect(() => {
    const runSync = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await syncWidgetCache();
      } finally {
        inFlight.current = false;
      }
    };

    void runSync();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void runSync();
    });

    return () => sub.remove();
  }, []);
}
