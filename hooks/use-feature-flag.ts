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

/** The `EXPO_PUBLIC_*` dev override, or null when unset. Metro inlines the
 *  literal member access, so this must stay a direct `process.env.X` read. */
function streakSpineOverride(): boolean | null {
  const envOverride = process.env.EXPO_PUBLIC_STREAK_SPINE_OVERRIDE;
  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return null;
}

/**
 * The `streak_spine` gate (PS-15) — activity recording, the Stats entry cell,
 * the streak screen, and the settings toggle. It reports whether PostHog has
 * actually ANSWERED yet as well as the value — modelled on
 * `useAcquisitionPromptGate`.
 *
 * SEPARATE flag from `daily_hooks` (@100% since 2026-07-07 for the priming
 * sheet): the streak spine ships dark for Ty-only device validation first, then
 * widens. Env override EXPO_PUBLIC_STREAK_SPINE_OVERRIDE = "true" | "false" for
 * dev. Fails closed while the flag is loading.
 *
 * This is the ONLY hook-shaped gate for this flag. A two-sample variant
 * (`useStreakSpineEnabled`) used to live here and latched its answer a second
 * after mount; every consumer that mounted before PostHog's identify call
 * delivered person-targeted flags was stuck on false for the whole session.
 * That silently dropped every streak write (#834) and intermittently hid the
 * settings toggle. It was deleted rather than fixed so it cannot be reused.
 * WRITES should not use this hook at all — they call `streakSpineEnabledNow()`
 * (lib/streak-service.ts) when the user acts, which also covers the first
 * seconds after launch, before any subscription has resolved.
 *
 * Surfaces that merely render (the Stats cell) can use the boolean alone: an
 * unresolved flag reads false and the cell shows its pre-streak fallback for a
 * beat. The streak ROUTE cannot, because its fail-closed branch navigates: a
 * cold deep link into `/streak` arrives before flags land, and a plain boolean
 * would bounce the user home permanently for a flag that was about to say yes.
 * `resolved` lets the route wait instead. The backstop guarantees it eventually
 * flips even if PostHog never answers, in which case `enabled` fails closed to
 * whatever is cached — so a redirect still happens, just not prematurely.
 */
export function useStreakSpineGate(backstopMs = 5000): {
  enabled: boolean;
  resolved: boolean;
} {
  const override = streakSpineOverride();

  const [state, setState] = useState<{ enabled: boolean; pending: boolean }>(() => {
    if (override !== null) return { enabled: override, pending: false };
    const value = analytics.getFeatureFlag('streak_spine');
    return {
      enabled: value === true || (typeof value === 'string' && value !== 'false'),
      pending: value === undefined,
    };
  });

  const { pending } = state;

  useEffect(() => {
    if (!pending) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const value = analytics.getFeatureFlag('streak_spine');
      setState({
        enabled: value === true || (typeof value === 'string' && value !== 'false'),
        pending: false,
      });
    };

    const unsubscribe = analytics.onFeatureFlags(finish);
    // Guard the race where flags landed between render and subscribe.
    if (analytics.getFeatureFlag('streak_spine') !== undefined) finish();
    const backstop = setTimeout(finish, backstopMs);

    return () => {
      unsubscribe();
      clearTimeout(backstop);
    };
  }, [pending, backstopMs]);

  return { enabled: state.enabled, resolved: !pending };
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

const ACQUISITION_PROMPT_FLAG = 'acquisition_prompt';

/** The `EXPO_PUBLIC_*` dev override, or null when unset. Metro inlines the
 *  literal member access, so this must stay a direct `process.env.X` read. */
function acquisitionPromptOverride(): boolean | null {
  const envOverride = process.env.EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE;
  if (envOverride === 'true') return true;
  if (envOverride === 'false') return false;
  return null;
}

function acquisitionPromptFlagEnabled(value: string | boolean | undefined): boolean {
  return value === true || (typeof value === 'string' && value !== 'false');
}

/**
 * How the gate arrived at its answer.
 *
 * - `pending` — still waiting on PostHog; `enabled` means nothing yet.
 * - `flag` — PostHog answered. An undefined flag here is a real answer: the
 *   flag is not assigned to this user, i.e. off.
 * - `override` — an `EXPO_PUBLIC_*` dev override decided it.
 * - `backstop` — PostHog NEVER answered and the timeout gave up. `enabled` is
 *   whatever was cached (usually false), so a disabled result here means
 *   UNKNOWN, not off. Callers that report why a surface stayed dark must not
 *   collapse this into "flag off".
 */
export type AcquisitionFlagResolution = 'pending' | 'flag' | 'override' | 'backstop';

/**
 * Gate for the first-run acquisition-source prompt (board attribution mandate).
 * Reports whether the `acquisition_prompt` flag is on, whether it is RESOLVED,
 * and HOW it resolved. Dev override
 * `EXPO_PUBLIC_ACQUISITION_PROMPT_OVERRIDE = "true" | "false"`.
 *
 * Modelled on `useEpisodeRoomsGate` rather than the shared `useFeatureFlag`,
 * for a reason specific to this surface: the prompt targets a user's FIRST
 * session, which is exactly the session where PostHog has not answered yet.
 * The shared hook samples on mount and once more a second later, and an
 * unresolved flag reads as a hard `false` — so the caller cannot tell "off"
 * from "not loaded" and would spend its one eligibility run on a flag that had
 * not arrived. `resolved` lets the caller wait instead. A backstop timeout
 * guarantees `resolved` eventually flips even if PostHog never answers
 * (offline / init failure), in which case `enabled` fails closed to whatever is
 * cached — typically false, so no prompt and no profile query. `resolution`
 * distinguishes that giving-up case from a real answer.
 */
export function useAcquisitionPromptGate(backstopMs = 5000): {
  enabled: boolean;
  resolved: boolean;
  resolution: AcquisitionFlagResolution;
} {
  const override = acquisitionPromptOverride();

  // `enabled` and `resolution` are derived from a SINGLE getFeatureFlag read,
  // so the two can never disagree about what PostHog said.
  const [state, setState] = useState<{
    enabled: boolean;
    resolution: AcquisitionFlagResolution;
  }>(() => {
    if (override !== null) return { enabled: override, resolution: 'override' };
    const value = analytics.getFeatureFlag(ACQUISITION_PROMPT_FLAG);
    return {
      enabled: acquisitionPromptFlagEnabled(value),
      resolution: value === undefined ? 'pending' : 'flag',
    };
  });

  const pending = state.resolution === 'pending';

  useEffect(() => {
    if (!pending) return;

    let done = false;
    const finish = (resolution: AcquisitionFlagResolution) => {
      if (done) return;
      done = true;
      const value = analytics.getFeatureFlag(ACQUISITION_PROMPT_FLAG);
      setState({ enabled: acquisitionPromptFlagEnabled(value), resolution });
    };

    // Fires when PostHog resolves flags (and on later refreshes).
    const unsubscribe = analytics.onFeatureFlags(() => finish('flag'));
    // Guard the race where flags landed between render and subscribe.
    if (analytics.getFeatureFlag(ACQUISITION_PROMPT_FLAG) !== undefined) finish('flag');
    // Never wait forever if PostHog never answers (offline / init failure). If
    // a value did land without the callback firing, that still counts as a real
    // answer — only a genuinely absent one is 'backstop'.
    const backstop = setTimeout(() => {
      finish(
        analytics.getFeatureFlag(ACQUISITION_PROMPT_FLAG) === undefined ? 'backstop' : 'flag'
      );
    }, backstopMs);

    return () => {
      unsubscribe();
      clearTimeout(backstop);
    };
  }, [pending, backstopMs]);

  return { ...state, resolved: !pending };
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
