/**
 * Store review prompt — decides whether to show the one-time "enjoying
 * PocketStubs?" sheet at the TV Time import success moment (the done screen,
 * fresh completion only — never on a resume visit to an already-finished
 * import).
 *
 * `expo-store-review` is NOT a dependency here (it's a native module — adding
 * one can't ship via OTA and would need a binary release), so this is a
 * custom in-app sheet that deep-links to the store listing instead of a
 * native review dialog. Per Apple 5.6.4, copy must stay neutral — no
 * "rate us 5 stars" begging.
 *
 *   - NEVER shown when the import returned 0 items.
 *   - NEVER re-prompts once shown, whether the user tapped through or not —
 *     the "shown" flag persists in AsyncStorage regardless of outcome.
 *   - Native only (iOS/Android) — a web session has no store listing to send
 *     the user to.
 */

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from './analytics';

const REVIEW_PROMPT_SHOWN_STORAGE_KEY = 'review_prompt.shown';
const SOURCE = 'tvtime_import_done';

// Same store destinations as components/share/get-pocketstubs-cta.tsx (Apple
// app ID 6760832346 / Android package com.pocketstubs.app).
const APP_STORE_URL = 'https://apps.apple.com/app/id6760832346';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pocketstubs.app';

/**
 * Pure decision function — exported for unit testing without touching
 * AsyncStorage.
 */
export function shouldShowReviewPrompt(itemCount: number, alreadyShown: boolean): boolean {
  return itemCount > 0 && !alreadyShown;
}

export async function hasReviewPromptBeenShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REVIEW_PROMPT_SHOWN_STORAGE_KEY)) === 'true';
  } catch {
    // AsyncStorage unavailable — fail closed (treat as already shown) so we
    // never risk re-prompting on every import in a broken storage state.
    return true;
  }
}

async function markReviewPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEW_PROMPT_SHOWN_STORAGE_KEY, 'true');
  } catch {
    // Best-effort; worst case we re-evaluate (and may re-show) next import.
  }
}

/**
 * Call once the TV Time import done screen renders a fresh completion
 * (never on `resume`). Resolves to whether the sheet should be presented;
 * marks it shown (so it never re-appears) as a side effect of returning
 * `true`, before the user has responded.
 */
export async function checkImportDoneReviewPrompt(itemCount: number): Promise<{ show: boolean }> {
  if (Platform.OS === 'web') return { show: false };

  const alreadyShown = await hasReviewPromptBeenShown();
  if (!shouldShowReviewPrompt(itemCount, alreadyShown)) {
    return { show: false };
  }

  await markReviewPromptShown();
  analytics.track('review_prompt_requested', { source: SOURCE });
  return { show: true };
}

/** User tapped through to the store listing. */
export function acceptReviewPrompt(): void {
  analytics.track('review_prompt_accepted', { source: SOURCE });
  const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  Linking.openURL(url).catch(() => {
    // Swallow — a failed store hand-off shouldn't surface an error here.
  });
}

/** User dismissed the sheet without tapping through. */
export function declineReviewPrompt(): void {
  analytics.track('review_prompt_declined', { source: SOURCE });
}
