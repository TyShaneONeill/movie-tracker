import { useMemo } from 'react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useAuth } from '@/lib/auth-context';

/**
 * Dark-launch gate for the Year-at-the-Movies entry point.
 * Hidden from production users until `year_recap_enabled` is flipped ON in PostHog.
 * Always visible to dev users (EXPO_PUBLIC_DEV_USER_IDS) and in __DEV__ builds so
 * the founder can QA without exposing it. The /recap/[year] route itself is NOT
 * gated by this — only the discoverable entry card is.
 */
export function useRecapVisible(): boolean {
  const { enabled: flagOn } = useFeatureFlag('year_recap_enabled');
  const { user } = useAuth();

  return useMemo(() => {
    if (__DEV__) return true;
    if (flagOn) return true;
    const devIds = (process.env.EXPO_PUBLIC_DEV_USER_IDS ?? '')
      .split(',').map((id) => id.trim()).filter(Boolean);
    return !!user?.id && devIds.includes(user.id);
  }, [flagOn, user?.id]);
}
