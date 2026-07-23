/**
 * Post-import PocketStubs+ upsell — decides whether to present the premium
 * upsell at the TV Time import SUCCESS moment (the done screen, fresh
 * completion only — never on a resume visit to an already-finished import).
 *
 * This is the highest-intent premium moment we have: someone who just brought
 * their whole library over is exactly who benefits from taste insights across
 * that history. It is the board's first-dollar lever, so it must convert
 * without ever nagging.
 *
 *   - NEVER shown to premium users (they already have the feature). The caller
 *     re-checks `isPremium` at present time; this gate re-checks it too.
 *   - NEVER shown when the import printed 0 stubs (nothing to celebrate).
 *   - NEVER re-prompts once shown, whether the user tapped through or not —
 *     the "shown" flag persists in AsyncStorage regardless of outcome, so a
 *     re-import never re-triggers it. Mirrors the one-shot pattern in
 *     lib/notification-priming-service.ts / lib/review-prompt-service.ts.
 *
 * The flag/env gate (`post_import_upsell` + EXPO_PUBLIC_POST_IMPORT_UPSELL_OVERRIDE)
 * lives in hooks/use-feature-flag.ts (usePostImportUpsellEnabled) — the caller
 * checks it before invoking this service.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from './analytics';

const UPSELL_SHOWN_STORAGE_KEY = 'post_import_upsell.shown';

/**
 * Pure decision function — exported for unit testing without touching
 * AsyncStorage. Non-premium + something imported + never shown before.
 */
export function shouldShowPostImportUpsell(args: {
  isPremium: boolean;
  itemCount: number;
  alreadyShown: boolean;
}): boolean {
  return !args.isPremium && args.itemCount > 0 && !args.alreadyShown;
}

export async function hasPostImportUpsellBeenShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(UPSELL_SHOWN_STORAGE_KEY)) === 'true';
  } catch {
    // AsyncStorage unavailable — fail closed (treat as already shown) so we
    // never risk re-prompting on every import in a broken storage state.
    return true;
  }
}

/**
 * Read-only gate check for the done screen. Resolves to whether the upsell
 * SHOULD be presented, but does not persist the shown-flag or fire analytics —
 * the caller must call `markPostImportUpsellShown()` only once the sheet
 * actually becomes visible, so a user who navigates away during the async gap
 * never burns the flag for a prompt they never saw.
 */
export async function checkPostImportUpsell(args: {
  isPremium: boolean;
  itemCount: number;
}): Promise<{ show: boolean }> {
  // Cheap negative checks first — skip AsyncStorage entirely when ineligible.
  if (args.isPremium || args.itemCount <= 0) return { show: false };

  const alreadyShown = await hasPostImportUpsellBeenShown();
  return { show: shouldShowPostImportUpsell({ ...args, alreadyShown }) };
}

/**
 * Persist the once-ever shown-flag and fire `premium:post_import_prompt_shown`.
 * Call at the moment the sheet actually becomes visible — not earlier — so an
 * unmounted/navigated-away screen never burns the flag for a prompt the user
 * never saw. The tap-through is measured separately via the existing
 * `premium:upgrade_view` event with source=`post-import`.
 */
export async function markPostImportUpsellShown(counts: {
  showCount: number;
  movieCount: number;
}): Promise<void> {
  try {
    await AsyncStorage.setItem(UPSELL_SHOWN_STORAGE_KEY, 'true');
  } catch {
    // Best-effort; worst case we re-evaluate (and may re-show) next import.
  }
  analytics.track('premium:post_import_prompt_shown', {
    showCount: counts.showCount,
    movieCount: counts.movieCount,
  });
}
