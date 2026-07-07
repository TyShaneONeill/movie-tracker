/**
 * Notification priming — decides whether to show the one-time "turn on
 * notifications?" sheet at the first-win moment (first `movie:watchlist_add`
 * OR first `scan:success` in a session, whichever fires first).
 *
 * App Store 5.1.2(i) + brand-taste rules this must satisfy:
 *   - NEVER at launch (only called from a first-win event handler).
 *   - NEVER blocking (caller shows a dismissible sheet, not a gate).
 *   - NEVER re-prompts once shown, whether the user accepted or declined —
 *     the "shown" flag persists in AsyncStorage regardless of outcome.
 *   - NEVER shown once the OS permission is already resolved (granted/denied) —
 *     only 'undetermined' is primeable.
 *
 * PS-15 PR 1.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPermissionStatus,
  registerForPushNotifications,
  type PushPermissionStatus,
} from './push-notification-service';
import { analytics } from './analytics';

const PRIMING_SHOWN_STORAGE_KEY = 'push.priming_shown';

/**
 * Pure decision function for the priming state machine — exported for unit
 * testing the undetermined/denied/granted paths without touching AsyncStorage
 * or native permission APIs.
 */
export function shouldShowPriming(
  status: PushPermissionStatus,
  alreadyShown: boolean
): boolean {
  return status === 'undetermined' && !alreadyShown;
}

export async function hasPrimingBeenShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRIMING_SHOWN_STORAGE_KEY)) === 'true';
  } catch {
    // AsyncStorage unavailable — fail closed (treat as already shown) so we
    // never risk re-prompting on every first-win event in a broken storage state.
    return true;
  }
}

async function markPrimingShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(PRIMING_SHOWN_STORAGE_KEY, 'true');
  } catch {
    // Best-effort; worst case we re-evaluate (and may re-show) next first-win event.
  }
}

/**
 * Call from a first-win event handler. Resolves to whether the priming sheet
 * should be presented; marks it shown (so it never re-appears) as a side
 * effect of returning `true`, before the user has responded.
 */
export async function checkFirstWinPriming(): Promise<{ show: boolean }> {
  const [alreadyShown, status] = await Promise.all([
    hasPrimingBeenShown(),
    getPermissionStatus(),
  ]);

  if (!shouldShowPriming(status, alreadyShown)) {
    return { show: false };
  }

  await markPrimingShown();
  analytics.track('push:priming_shown');
  return { show: true };
}

/** User tapped "accept" on the priming sheet. */
export async function acceptPriming(): Promise<void> {
  analytics.track('push:priming_accepted');
  await registerForPushNotifications();
}

/** User tapped "not now" / dismissed the priming sheet. */
export function declinePriming(): void {
  analytics.track('push:priming_declined');
}
