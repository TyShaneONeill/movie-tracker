import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncWidgetCache } from '@/lib/widget-cache';

const DEBOUNCE_MS = 3000;

/**
 * Mounts once at the app root. Keeps the iOS home-screen widget's App Groups
 * cache fresh by firing syncWidgetCache on mount and every foreground event.
 * Foreground triggers are coalesced via a 3s trailing-edge debounce.
 * Skips concurrent in-flight syncs. No-op on other platforms.
 */
export function useWidgetSync(): void {
  const inFlight = useRef(false);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const scheduleSync = () => {
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      trailingTimer.current = setTimeout(() => {
        trailingTimer.current = null;
        void runSync();
      }, DEBOUNCE_MS);
    };

    // Mount fires immediately (cold start should be snappy — no debounce)
    void runSync();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') scheduleSync();
    });

    return () => {
      sub.remove();
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
    };
  }, []);
}
