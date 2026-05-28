/**
 * Privacy preferences
 *
 * Local-only AsyncStorage flags that let the user opt out of crash reporting
 * (Sentry) and product analytics (PostHog). Used to answer "Yes" to the Play
 * Console Data Safety form's "Can users opt out of data collection?" question
 * for the 1.4.0 submission.
 *
 * Both default to ON (current behavior — opt-out, not opt-in).
 *
 * Multi-device sync is intentionally out of scope for 1.4.0 — it will ship in
 * 1.5.0 via a Supabase-backed user preference. Keep this file local-only.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const CRASH_REPORTS_KEY = 'privacy.crash_reports_enabled';
export const ANALYTICS_KEY = 'privacy.analytics_enabled';

/** Read a boolean privacy flag. Defaults to `true` when unset or unreadable. */
async function readFlag(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    // If AsyncStorage is unavailable, fall back to the default (enabled).
    return true;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Swallow — the in-memory SDK state has already been updated by the caller,
    // so the user's choice still applies for the current session.
  }
}

export function getCrashReportsEnabled(): Promise<boolean> {
  return readFlag(CRASH_REPORTS_KEY);
}

export function setCrashReportsEnabled(value: boolean): Promise<void> {
  return writeFlag(CRASH_REPORTS_KEY, value);
}

export function getAnalyticsEnabled(): Promise<boolean> {
  return readFlag(ANALYTICS_KEY);
}

export function setAnalyticsEnabled(value: boolean): Promise<void> {
  return writeFlag(ANALYTICS_KEY, value);
}
