import { useState, useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export const SEARCH_V2_FLAG = 'search_v2';

const RESOLVE_TIMEOUT_MS = 1200; // give PostHog a beat to load flags before falling back
const POLL_INTERVAL_MS = 250;

// Local/dev override that short-circuits PostHog entirely. Metro only inlines
// LITERAL `process.env.EXPO_PUBLIC_*` access, so this must be read literally at
// module load (a dynamic lookup would silently be undefined in a prod bundle).
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_SEARCH_V2_OVERRIDE;

/**
 * Resolves whether the unified Search v2 experience should render.
 *
 * Resolution order:
 *   1. `EXPO_PUBLIC_SEARCH_V2_OVERRIDE` ('true' | 'false') — dev/QA override.
 *   2. The `search_v2` PostHog flag (founder-only at launch).
 *
 * PostHog loads feature flags asynchronously, so on first mount the flag value
 * is often `undefined` (not yet loaded). We briefly poll until the flag
 * resolves, then fall back to v1 (the production default) after a short
 * timeout. `resolving` lets the gate hold a neutral screen instead of flashing
 * v1 and snapping to v2 for a tester.
 *
 * Follows the flag-gate hook pattern (formerly mirrored by the since-stripped release-calendar-v2/stats-v2 hooks).
 */
export function useSearchV2(): { enabled: boolean; resolving: boolean } {
  const initial = analytics.getFeatureFlag(SEARCH_V2_FLAG);
  const [value, setValue] = useState<string | boolean | undefined>(initial);
  // When an override is set we never poll PostHog, so we're never "resolving".
  const [resolving, setResolving] = useState<boolean>(
    ENV_OVERRIDE === undefined && initial === undefined
  );

  useEffect(() => {
    if (ENV_OVERRIDE !== undefined) return; // override wins; skip PostHog polling
    if (!resolving) return;

    let cancelled = false;
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const current = analytics.getFeatureFlag(SEARCH_V2_FLAG);
      if (current !== undefined) {
        if (!cancelled) {
          setValue(current);
          setResolving(false);
        }
        clearInterval(interval);
      } else if (Date.now() - startedAt > RESOLVE_TIMEOUT_MS) {
        if (!cancelled) setResolving(false); // fall back to v1
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [resolving]);

  if (ENV_OVERRIDE === 'true') return { enabled: true, resolving: false };
  if (ENV_OVERRIDE === 'false') return { enabled: false, resolving: false };

  const enabled = value === true || (typeof value === 'string' && value !== 'false');
  return { enabled, resolving };
}
