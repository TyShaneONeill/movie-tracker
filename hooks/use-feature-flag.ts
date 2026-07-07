import { useState, useEffect, useCallback } from 'react';
import { Platform, AccessibilityInfo } from 'react-native';
import { analytics } from '@/lib/analytics';

/**
 * Hook to check a PostHog feature flag.
 * Returns the flag value and a reload function.
 * Polls on mount; call reload() to refresh manually.
 */
export function useFeatureFlag(flagName: string): {
  enabled: boolean;
  value: string | boolean | undefined;
  reload: () => void;
} {
  const [value, setValue] = useState<string | boolean | undefined>(() =>
    analytics.getFeatureFlag(flagName)
  );

  useEffect(() => {
    // Re-check after a short delay to let PostHog load flags
    const timer = setTimeout(() => {
      setValue(analytics.getFeatureFlag(flagName));
    }, 1000);
    return () => clearTimeout(timer);
  }, [flagName]);

  const reload = useCallback(() => {
    analytics.reloadFeatureFlags();
    // Re-check after reload
    setTimeout(() => {
      setValue(analytics.getFeatureFlag(flagName));
    }, 500);
  }, [flagName]);

  return {
    enabled: value === true || (typeof value === 'string' && value !== 'false'),
    value,
    reload,
  };
}

/**
 * Returns true when the motion-driven popcorn physics engine should be active.
 * Combines: iOS-only, PostHog flag `popcorn_motion_physics`, Reduce Motion off,
 * and an env-var dev override (EXPO_PUBLIC_POPCORN_MOTION_OVERRIDE = "true" | "false").
 *
 * Reduce Motion is re-checked live via the `reduceMotionChanged` accessibility
 * event so toggling it in Settings flips the gate without an app restart.
 */
export function usePopcornMotionEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('popcorn_motion_physics');
  const envOverride = process.env.EXPO_PUBLIC_POPCORN_MOTION_OVERRIDE;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!cancelled) setReduceMotion(rm);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (rm) => {
      setReduceMotion(rm);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  if (envOverride === 'true') return Platform.OS === 'ios' && !reduceMotion;
  if (envOverride === 'false') return false;
  return Platform.OS === 'ios' && flagOn && !reduceMotion;
}

/**
 * Returns true when the daily_hooks retention surfaces (PS-15) should be
 * active — currently just the notification priming sheet. Combines the
 * PostHog flag `daily_hooks` and an env-var dev override
 * (EXPO_PUBLIC_DAILY_HOOKS_OVERRIDE = "true" | "false"), mirroring
 * usePopcornMotionEnabled above.
 *
 * Fails closed: `useFeatureFlag`'s `enabled` is false while the flag is still
 * loading (value undefined), so an unresolved flag never lets the gate open.
 */
export function useDailyHooksEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('daily_hooks');
  const envOverride = process.env.EXPO_PUBLIC_DAILY_HOOKS_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}
