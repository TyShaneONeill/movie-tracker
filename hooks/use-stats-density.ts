import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';

export type StatsDensity = 'compact' | 'detailed';

export const STATS_DENSITY_STORAGE_KEY = '@cinetrak/stats_density';

/**
 * App-wide persisted density for the stats-v2 ranked detail lists
 * (design section 2 — compact 42px rows vs detailed 58px cards).
 *
 * Defaults to compact for everyone; the choice persists across the app via
 * AsyncStorage so every ranked detail screen opens in the last-used density.
 */
export function useStatsDensity() {
  const [density, setDensityState] = useState<StatsDensity>('compact');
  // A toggle made before the AsyncStorage read resolves must win over the
  // stored value — otherwise hydration would silently revert the user's tap.
  const userToggledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STATS_DENSITY_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && !userToggledRef.current && stored === 'detailed') {
          setDensityState('detailed');
        }
      })
      .catch((error) => {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'load-stats-density',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: StatsDensity) => {
    AsyncStorage.setItem(STATS_DENSITY_STORAGE_KEY, next).catch((error) => {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'save-stats-density',
      });
    });
  }, []);

  const toggleDensity = useCallback(() => {
    userToggledRef.current = true;
    setDensityState((prev) => {
      const next: StatsDensity = prev === 'compact' ? 'detailed' : 'compact';
      persist(next);
      return next;
    });
  }, [persist]);

  return { density, compact: density === 'compact', toggleDensity };
}
