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
  /** Local AsyncStorage fast-path flag. */
  alreadyShownLocally: boolean;
};

/**
 * Pure decision function — exported for unit testing the once-ever and
 * existing-user-exclusion paths without touching storage or the network.
 */
export function shouldShowAcquisitionPrompt(input: AcquisitionGateInput): boolean {
  const { onboardingCompleted, profileCreatedAt, acquisitionSource, alreadyShownLocally } = input;

  if (alreadyShownLocally) return false;
  if (acquisitionSource !== null) return false;
  if (!onboardingCompleted) return false;

  // Missing/unparseable created_at → fail closed (treat as existing user)
  // rather than risk prompting a long-time user.
  if (!profileCreatedAt) return false;
  const createdMs = Date.parse(profileCreatedAt);
  if (Number.isNaN(createdMs)) return false;

  return createdMs >= Date.parse(ATTRIBUTION_CUTOFF_ISO);
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
