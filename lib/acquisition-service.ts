/**
 * Acquisition attribution — decides whether to show the one-time first-run
 * "what brought you here?" prompt and persists the answer.
 *
 * Rules this must satisfy (board attribution mandate, pre-PH launch):
 *   - NEVER blocking (caller shows a dismissible sheet on Home, not a gate).
 *   - Shows AT MOST ONCE, ever. Any non-null profiles.acquisition_source
 *     (including 'skipped') is the reinstall-surviving seen-flag; a local
 *     AsyncStorage flag is only a fast-path/offline guard on top of it.
 *   - NEVER shown to existing users: only profiles created on/after the OTA
 *     cutoff date qualify, and only after onboarding has completed.
 *
 * Analytics contract: docs/analytics-acquisition.md
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { analytics } from './analytics';
import { captureException } from './sentry';

export const ACQUISITION_SOURCES = [
  'producthunt',
  'alternativeto',
  'x',
  'friend',
  'search',
  'other',
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

/** Written to the profile when the user dismisses without answering — still a
 *  terminal state (the prompt never re-shows), just not attribution data. */
export const ACQUISITION_SKIPPED = 'skipped';

/**
 * Profiles created before this instant belong to existing users who signed up
 * before attribution shipped — they are never prompted. Set to the OTA publish
 * date of this feature (runtime 1.6.0).
 */
export const ATTRIBUTION_CUTOFF_ISO = '2026-08-04T00:00:00Z';

const PROMPT_SHOWN_STORAGE_KEY = 'acquisition.prompt_shown';

export type AcquisitionGateInput = {
  /** profiles.onboarding_completed — prompt only fires after onboarding. */
  onboardingCompleted: boolean;
  /** profiles.created_at ISO string. */
  profileCreatedAt: string | null;
  /** profiles.acquisition_source — non-null means already answered/skipped. */
  acquisitionSource: string | null;
  /**
   * profiles.account_tier — 'dev' (the 2-3 founder accounts) bypasses the
   * created_at cutoff ONLY, so founders whose profiles predate the OTA can
   * validate the flow on device. Every other gate still applies to them.
   */
  accountTier?: string | null;
};

/**
 * Why a launch did NOT get the prompt. Reported on `acquisition:gate_evaluated`
 * so a dark prompt can be diagnosed from one event instead of inferred from
 * `$feature_flag_called` volume.
 *
 * Decided by the caller (hooks/use-acquisition-prompt.ts):
 * - `flag_off` — PostHog answered and the flag is off for this user.
 * - `flag_unresolved` — PostHog never answered; the backstop gave up. NOT the
 *   same as off, and distinguishing the two is the point: the offline /
 *   init-failed first launch is exactly what this event exists to diagnose.
 * - `already_shown` — the local AsyncStorage latch is set. Paired with an empty
 *   `profiles.acquisition_source` this means an answer was lost in transit.
 * - `lost_focus` — Home lost focus before the sheet could fire.
 *
 * Decided by the pure gate below:
 * - `already_answered` — `profiles.acquisition_source` is non-null. The healthy
 *   terminal state; every returning user lands here.
 * - `not_onboarded`, `pre_cutoff` — see `evaluateAcquisitionPrompt`.
 */
export type AcquisitionGateReason =
  | 'flag_off'
  | 'flag_unresolved'
  | 'already_shown'
  | 'already_answered'
  | 'pre_cutoff'
  | 'not_onboarded'
  | 'lost_focus';

/**
 * Pure decision function over PROFILE state — exported for unit testing the
 * once-ever and existing-user-exclusion paths without touching storage or the
 * network. Returns the failing `reason` alongside the verdict; `reason` is null
 * when eligible.
 *
 * The local AsyncStorage latch is deliberately NOT an input: the caller checks
 * it first as a fast path that avoids the profile read entirely, and reports
 * `already_shown` itself. Accepting it here too would be a second, dead copy of
 * that decision.
 */
export function evaluateAcquisitionPrompt(input: AcquisitionGateInput): {
  eligible: boolean;
  reason: AcquisitionGateReason | null;
} {
  const { onboardingCompleted, profileCreatedAt, acquisitionSource } = input;

  if (acquisitionSource !== null) return { eligible: false, reason: 'already_answered' };
  if (!onboardingCompleted) return { eligible: false, reason: 'not_onboarded' };

  // Founder-test bypass: dev-tier accounts skip only the cutoff below (their
  // profiles predate the OTA); everything above still applies.
  if (input.accountTier === 'dev') return { eligible: true, reason: null };

  // Missing/unparseable created_at → fail closed (treat as existing user)
  // rather than risk prompting a long-time user.
  if (!profileCreatedAt) return { eligible: false, reason: 'pre_cutoff' };
  const createdMs = Date.parse(profileCreatedAt);
  if (Number.isNaN(createdMs)) return { eligible: false, reason: 'pre_cutoff' };

  if (createdMs < Date.parse(ATTRIBUTION_CUTOFF_ISO)) {
    return { eligible: false, reason: 'pre_cutoff' };
  }
  return { eligible: true, reason: null };
}

/** Verdict-only view of `evaluateAcquisitionPrompt`. */
export function shouldShowAcquisitionPrompt(input: AcquisitionGateInput): boolean {
  return evaluateAcquisitionPrompt(input).eligible;
}

export async function hasAcquisitionPromptBeenShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPT_SHOWN_STORAGE_KEY)) === 'true';
  } catch {
    // Storage unavailable — fail closed (treat as shown) so a broken-storage
    // state can never re-prompt on every launch.
    return true;
  }
}

export async function markAcquisitionPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_SHOWN_STORAGE_KEY, 'true');
  } catch {
    // Best-effort; the profile column is the durable guard.
  }
}

async function persistToProfile(userId: string, value: string): Promise<boolean> {
  try {
    const { error } = await (supabase
      .from('profiles') as ReturnType<typeof supabase.from>)
      .update({ acquisition_source: value } as Record<string, unknown>)
      .eq('id', userId);

    if (error) {
      captureException(new Error(error.message), { context: 'acquisition-source-persist' });
      return false;
    }
    return true;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'acquisition-source-persist',
    });
    return false;
  }
}

/**
 * User tapped a source chip. Fires the attribution event, mirrors the source
 * onto the PostHog person, and persists it to the profile (the durable
 * never-show-again flag).
 */
export async function submitAcquisitionSource(
  userId: string,
  source: AcquisitionSource
): Promise<void> {
  analytics.track('acquisition:source_selected', { source });
  analytics.setPersonProperties({ acquisition_source: source });
  await persistToProfile(userId, source);
}

/**
 * User dismissed the prompt without answering. Still terminal: 'skipped' is
 * written to the profile so the prompt never returns, even after reinstall.
 */
export async function dismissAcquisitionPrompt(userId: string): Promise<void> {
  analytics.track('acquisition:prompt_dismissed');
  await persistToProfile(userId, ACQUISITION_SKIPPED);
}
