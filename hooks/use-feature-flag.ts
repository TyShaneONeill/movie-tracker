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

/**
 * Returns true when the punch-card streak spine (PS-15 PR 3) should be active —
 * activity recording, the profile punch card, and the streak settings toggle.
 *
 * SEPARATE flag from `daily_hooks` (@100% since 2026-07-07 for the priming
 * sheet): the streak spine ships dark for Ty-only device validation first,
 * then widens — same rollout playbook as the priming sheet. Env override
 * EXPO_PUBLIC_STREAK_SPINE_OVERRIDE = "true" | "false" for dev. Fails closed
 * while the flag is loading, like useDailyHooksEnabled.
 */
export function useStreakSpineEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('streak_spine');
  const envOverride = process.env.EXPO_PUBLIC_STREAK_SPINE_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}

/**
 * Returns true when the modal keyboard guard is active: in the First Take /
 * Review / Multi First Take sheets, a backdrop press while the keyboard is up
 * dismisses the keyboard instead of closing the sheet (a swipe that starts on
 * the strip above the keyboard registers as a backdrop press and was silently
 * closing the sheet, losing the typed draft), and an accidental close keeps
 * the in-memory draft for the next open of the same title/episode.
 *
 * ROLLOUT: fully widened — flag 772478 has been at 100% for all users since
 * 2026-07-21. The guard is the shipped behavior, not an experiment; #741 tracks
 * stripping the flag and its branches. (This block previously said it ships
 * dark for founder-only validation, which sent a QA run at the wrong default.)
 *
 * Env override EXPO_PUBLIC_MODAL_KEYBOARD_GUARD_OVERRIDE = "true" | "false" for
 * dev. Fails closed (legacy dismiss behavior) while the flag is loading.
 */
export function useModalKeyboardGuardEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('modal_keyboard_guard');
  const envOverride = process.env.EXPO_PUBLIC_MODAL_KEYBOARD_GUARD_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}

/**
 * Returns true when the post-import PocketStubs+ upsell should be active — the
 * premium moment shown at the TV Time import success screen (the board's
 * first-dollar lever). Combines the PostHog flag `post_import_upsell` and an
 * env-var dev override (EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE = "true" |
 * "false"), mirroring useModalKeyboardGuardEnabled above.
 *
 * Ships founder-first: the flag is created dark and enabled only for the
 * founder for on-device validation, then widens. Fails closed (no upsell)
 * while the flag is still loading, since `useFeatureFlag`'s `enabled` is false
 * for an undefined value.
 */
export function usePostImportUpsellEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('post_import_upsell');
  const envOverride = process.env.EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}

/**
 * Returns true when the first-run acquisition-source prompt (board attribution
 * mandate) should be active. Combines the PostHog flag `acquisition_prompt`
 * and an env-var dev override (EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE =
 * "true" | "false"), mirroring usePostImportUpsellEnabled above.
 *
 * Ships founder-first: the flag is created dark and enabled only for founder
 * accounts for on-device validation, then widens to 100% before the Product
 * Hunt launch. Fails closed (no prompt, and no profile query at all — the
 * eligibility hook checks this flag before touching the network) while the
 * flag is still loading, since `useFeatureFlag`'s `enabled` is false for an
 * undefined value.
 */
export function useAcquisitionPromptEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('acquisition_prompt');
  const envOverride = process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}

/**
 * Returns true when marking a movie/show watched should offer a "First Take
 * or Review?" chooser instead of auto-opening the (public) First Take
 * composer (N3). Combines the PostHog flag `watched_composer_chooser` and an
 * env-var dev override (EXPO_PUBLIC_WATCHED_COMPOSER_CHOOSER_OVERRIDE =
 * "true" | "false"), mirroring usePostImportUpsellEnabled above.
 *
 * Fails closed: while the flag is loading (or off), the legacy auto-open-
 * First-Take behavior is byte-identical to pre-chooser code.
 */
export function useWatchedComposerChooserEnabled(): boolean {
  const { enabled: flagOn } = useFeatureFlag('watched_composer_chooser');
  const envOverride = process.env.EXPO_PUBLIC_WATCHED_COMPOSER_CHOOSER_OVERRIDE;

  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return flagOn;
}
