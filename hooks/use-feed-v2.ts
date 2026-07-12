import { useState, useEffect } from 'react';
import { analytics } from '@/lib/analytics';

/** PostHog flag (id 757878) gating the Feed redesign (contract 01). */
export const FEED_V2_FLAG = 'feed_v2';

const RESOLVE_TIMEOUT_MS = 1200; // give PostHog a beat to load flags before falling back
const POLL_INTERVAL_MS = 250;

// Local/dev override that short-circuits PostHog entirely. Metro only inlines
// LITERAL `process.env.EXPO_PUBLIC_*` access, so this must be read literally at
// module load (a dynamic lookup would silently be undefined in a prod bundle).
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_FEED_V2_OVERRIDE;

/**
 * Resolves whether the Feed v2 redesign should render on the Feed tab.
 *
 * Resolution order:
 *   1. `EXPO_PUBLIC_FEED_V2_OVERRIDE` ('true' | 'false') — dev/QA override.
 *   2. The `feed_v2` PostHog flag (founder-only at launch).
 *
 * Fails CLOSED: while the flag is still loading (value `undefined`) `enabled`
 * is false, so an unresolved flag always renders the legacy feed. `resolving`
 * lets the caller hold a neutral frame instead of flashing legacy then snapping
 * to v2 for a tester. Mirrors `hooks/use-first-takes-v2.ts`.
 */
export function useFeedV2(): { enabled: boolean; resolving: boolean } {
  const initial = analytics.getFeatureFlag(FEED_V2_FLAG);
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
      const current = analytics.getFeatureFlag(FEED_V2_FLAG);
      if (current !== undefined) {
        if (!cancelled) {
          setValue(current);
          setResolving(false);
        }
        clearInterval(interval);
      } else if (Date.now() - startedAt > RESOLVE_TIMEOUT_MS) {
        if (!cancelled) setResolving(false); // fall back to legacy
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
