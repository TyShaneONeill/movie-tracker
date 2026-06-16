import { useState, useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export const ONBOARDING_V2_FLAG = 'onboarding_v2';

const RESOLVE_TIMEOUT_MS = 1200; // give PostHog a beat to load flags before falling back
const POLL_INTERVAL_MS = 250;

export type OnboardingVariant = 'v1' | 'v2';

/**
 * Resolves which onboarding flow a user should see.
 *
 * PostHog loads feature flags asynchronously, so on first mount the flag value
 * is often `undefined` (not yet loaded). We briefly poll until the flag
 * resolves, then fall back to v1 (the production default) after a short
 * timeout. `resolving` lets the gate hold a neutral screen instead of
 * flashing v1 and snapping to v2 for a tester.
 */
export function useOnboardingVariant(): { variant: OnboardingVariant; resolving: boolean } {
  const initial = analytics.getFeatureFlag(ONBOARDING_V2_FLAG);
  const [value, setValue] = useState<string | boolean | undefined>(initial);
  const [resolving, setResolving] = useState<boolean>(initial === undefined);

  useEffect(() => {
    if (!resolving) return;

    let cancelled = false;
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const current = analytics.getFeatureFlag(ONBOARDING_V2_FLAG);
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

  const enabled = value === true || (typeof value === 'string' && value !== 'false');
  return { variant: enabled ? 'v2' : 'v1', resolving };
}
