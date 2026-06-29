import { useState, useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export const TICKET_SCAN_V2_FLAG = 'ticket_scan_v2';

const RESOLVE_TIMEOUT_MS = 1200; // give PostHog a beat to load flags before falling back
const POLL_INTERVAL_MS = 250;

export type TicketScanVariant = 'v1' | 'v2';

// Local/dev override that short-circuits PostHog entirely. Metro only inlines
// LITERAL `process.env.EXPO_PUBLIC_*` access, so this must be read literally at
// module load (a dynamic lookup would silently be undefined in a prod bundle).
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_TICKET_SCAN_V2_OVERRIDE;

/**
 * Resolves which Ticket Scan flow a user should see.
 *
 * Resolution order:
 *   1. `EXPO_PUBLIC_TICKET_SCAN_V2_OVERRIDE` ('true' | 'false') — dev/QA override.
 *   2. The `ticket_scan_v2` PostHog flag.
 *
 * PostHog loads feature flags asynchronously, so on first mount the flag value
 * is often `undefined` (not yet loaded). We briefly poll until the flag
 * resolves, then fall back to v1 (the production default) after a short
 * timeout. `resolving` lets the gate hold a neutral screen instead of flashing
 * v1 and snapping to v2 for a tester.
 *
 * Mirrors `hooks/use-onboarding-variant.ts`.
 */
export function useTicketScanV2(): { variant: TicketScanVariant; resolving: boolean } {
  const initial = analytics.getFeatureFlag(TICKET_SCAN_V2_FLAG);
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
      const current = analytics.getFeatureFlag(TICKET_SCAN_V2_FLAG);
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

  if (ENV_OVERRIDE === 'true') return { variant: 'v2', resolving: false };
  if (ENV_OVERRIDE === 'false') return { variant: 'v1', resolving: false };

  const enabled = value === true || (typeof value === 'string' && value !== 'false');
  return { variant: enabled ? 'v2' : 'v1', resolving };
}
