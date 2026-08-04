/**
 * Post-import PocketStubs+ upsell — decides whether to present the premium
 * upsell at the TV Time import SUCCESS moment. Triggered from the durable
 * pending-moment record written at completion (see PendingPostImportMoment
 * below), so an import that finishes while the app is backgrounded or the
 * user navigated away still gets its moment on the next screen visit (#776).
 * A visit with no pending record — e.g. a resume visit to an already-pitched
 * import — never triggers it.
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
const PENDING_MOMENT_STORAGE_KEY = 'post_import_upsell.pending';

/**
 * Durable record of an import that completed but whose post-import moments
 * (review ask, then this upsell) have not yet been offered. Written by the
 * import-run provider at completion time — which runs whether or not the
 * import screen is mounted or focused (#776: 6 of 11 real importers finished
 * while backgrounded/navigated-away, and the in-screen trigger chain never
 * fired for them). Consumed by the import screen on its next mount/visit and
 * cleared once the upsell decision resolves, so the sequence runs at most once
 * per completed import — the once-ever shown-flags above remain the real
 * one-shot gates.
 */
export interface PendingPostImportMoment {
  /** Stubs printed (episodes + movies inserted/updated) — the eligibility count. */
  stubs: number;
  /** Shows brought over — feeds the tailored upsell copy + shown analytics. */
  showCount: number;
  /** Movies brought over (watched + Pile) — feeds copy + shown analytics. */
  movieCount: number;
  /** Episodes inserted — feeds the episodes-only copy fallback. */
  episodeCount: number;
}

export async function savePendingPostImportMoment(moment: PendingPostImportMoment): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_MOMENT_STORAGE_KEY, JSON.stringify(moment));
  } catch {
    // Best-effort. Without the record the next visit simply won't pitch — the
    // same (broken-storage) state in which the once-ever gates fail closed too.
  }
}

export async function loadPendingPostImportMoment(): Promise<PendingPostImportMoment | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_MOMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as PendingPostImportMoment).stubs !== 'number' ||
      typeof (parsed as PendingPostImportMoment).showCount !== 'number' ||
      typeof (parsed as PendingPostImportMoment).movieCount !== 'number' ||
      typeof (parsed as PendingPostImportMoment).episodeCount !== 'number'
    ) {
      return null;
    }
    return parsed as PendingPostImportMoment;
  } catch {
    // Unreadable/corrupt record — fail closed (no prompt) rather than pitch
    // from garbage counts.
    return null;
  }
}

export async function clearPendingPostImportMoment(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_MOMENT_STORAGE_KEY);
  } catch {
    // Best-effort; the once-ever shown-flags still prevent any re-nag if a
    // stale record is consumed again.
  }
}

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
