import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from './analytics';
import { captureException } from './sentry';

/**
 * AsyncStorage key whose PRESENCE marks that the app has been opened at least
 * once on this install. The stored value is the first-open ISO timestamp (handy
 * for local diagnostics), but only presence/absence is load-bearing.
 *
 * IMPORTANT: AsyncStorage is wiped on uninstall, so this detects "first launch
 * of this install on this device" — NOT "this person has never had an account".
 * A returning user who reinstalls (or moves to a new device) reads as a first
 * launch. That is an acceptable default for screen selection (the sign-up screen
 * still links to sign-in); recognising a returning user across reinstalls needs
 * the platform credential APIs documented in
 * `Projects/PocketStubs/Bugs & Fixes/2026-06-16 First-launch routes to Sign In ...`.
 */
export const FIRST_LAUNCH_KEY = 'pocketstubs_has_launched';

export type FirstLaunchResult = {
  /** True only on the first launch of a fresh install on this device. */
  isFirstLaunch: boolean;
};

// Resolved once per app process. Every caller awaits the same promise, so
// storage is read (and the flag written) exactly once no matter how many
// components consume the hook during a launch.
let cached: Promise<FirstLaunchResult> | null = null;

async function resolveFirstLaunch(): Promise<FirstLaunchResult> {
  let isFirstLaunch = false;

  try {
    const existing = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
    isFirstLaunch = existing == null;
    if (isFirstLaunch) {
      // Mark the install as launched. Its presence is what flips every later
      // launch to "returning".
      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, new Date().toISOString());
    }
  } catch (error) {
    // Storage unavailable → treat as a returning user so a real user is never
    // trapped in a first-run experience on every cold start.
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'first-launch:resolve',
    });
    return { isFirstLaunch: false };
  }

  // Analytics is best-effort and must never influence the detection result:
  // it no-ops if PostHog has not finished initialising at launch time. Fires
  // once because resolveFirstLaunch() runs once (memoised by getFirstLaunch).
  if (isFirstLaunch) {
    try {
      analytics.track('app:first_open');
    } catch {
      // Never let an analytics failure break navigation.
    }
  }

  return { isFirstLaunch };
}

/**
 * Resolve first-launch state for this device/install, reading and writing
 * storage exactly once per app process.
 *
 * Boundary: this is a read-only signal. It performs no navigation and renders
 * no UI — the caller (root layout / auth entry) decides which screen to show.
 */
export function getFirstLaunch(): Promise<FirstLaunchResult> {
  if (!cached) {
    cached = resolveFirstLaunch();
  }
  return cached;
}

/** Test-only: clear the in-process memo so each test starts from a cold cache. */
export function __resetFirstLaunchCache(): void {
  cached = null;
}
