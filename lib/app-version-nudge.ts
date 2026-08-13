/**
 * Outdated-binary nudge (#726) — decides whether the running BINARY is behind
 * the store and, if so, at which tier.
 *
 * WHY THIS EXISTS: an OTA update only reaches binaries whose native
 * `runtimeVersion` matches the published update. The moment a release bumps
 * runtimeVersion, every older binary is frozen at its last bundle forever —
 * the store is the only way to move those users. This banner is the only
 * channel that reaches them, so it must run on pure JS + already-embedded
 * native modules (no new native dependency can ever reach a frozen cohort).
 *
 * VERSION SOURCE: `Updates.runtimeVersion` (expo-updates), read by the caller.
 * It is a native constant baked into the binary at build time and is NOT
 * rewritten by an OTA — unlike `Constants.expoConfig.version`, which comes
 * from the running update's manifest and therefore describes the JS bundle,
 * not the app the user installed. `expo-application` (`nativeAppVersion` /
 * `nativeBuildVersion`) would be the more precise source but is not a
 * dependency, and adding a native module here is self-defeating: it could
 * never ship to the frozen binaries this feature targets. On Android
 * `Constants.platform.android` is an empty map, so expo-constants offers no
 * native version at all there.
 *
 * Since the whole point is "OTA cannot reach you", runtimeVersion is also the
 * semantically correct key: a binary on the current runtime is reachable by
 * OTA and never needs this banner.
 *
 * REMOTE CONFIG: the PostHog flag `outdated_binary_nudge` plus its JSON
 * payload, mirroring `useTvTimeImportGate`'s `{ pinned }` payload. Zero new
 * infrastructure, and PostHog already initializes at cold start inside every
 * shipped binary. Payload shape (all fields optional):
 *
 *   {
 *     "recommended": "1.6.1",
 *     "minimum": "0.0.0",
 *     "snoozeDays": 7,
 *     "ios":     { "recommended": "1.6.1" },
 *     "android": { "recommended": "1.6.0" }
 *   }
 *
 * Per-platform blocks override the top-level values, which matters because
 * iOS and Android reach the stores on different days — a global
 * `recommended` would point Android users at a build Play has not published.
 */

import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureMessage } from './sentry';

export const VERSION_NUDGE_FLAG = 'outdated_binary_nudge';

/** Dev/QA override — read LITERALLY so Metro inlines it in a prod bundle. */
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_VERSION_NUDGE_OVERRIDE;

const SNOOZE_STORAGE_KEY = '@pocketstubs/version_nudge_snooze';

/** Snooze length when the payload doesn't specify one. */
export const DEFAULT_SNOOZE_DAYS = 7;

// Same store destinations as lib/review-prompt-service.ts, with the campaign
// tags from #800 so store-side reporting can separate update traffic from the
// web funnel's `web-organic`.
const APP_STORE_URL = 'https://apps.apple.com/app/id6760832346?ct=app-update-nudge';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.pocketstubs.app&referrer=utm_source%3Dapp-update-nudge';

export type NudgeTier = 'none' | 'recommended' | 'minimum';

export interface NudgeConfig {
  /** Below this → dismissible banner. */
  recommended: string | null;
  /** Below this → persistent (never blocking) banner. */
  minimum: string | null;
  snoozeDays: number;
}

export interface NudgeSnooze {
  /** The `recommended` version that was snoozed — a newer one resets it. */
  version: string;
  snoozedAt: number;
}

/**
 * Parses a dotted numeric version into comparable parts. Returns null for
 * anything that isn't strictly numeric segments, and for bare integers like
 * `"34"`: a build number is never a valid runtime version, and silently
 * accepting one would make every user look catastrophically outdated.
 */
function parseVersion(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('.');
  if (parts.length < 2) return null;
  const nums = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/**
 * Compares two dotted numeric versions: -1 / 0 / 1, or null when either side
 * is unparseable. Missing trailing segments count as 0, so `1.6` === `1.6.0`.
 */
export function compareVersions(a: string | null, b: string | null): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

// One Sentry message per session, not per render — a malformed payload would
// otherwise fire on every home mount for every user on the flag.
let malformedPayloadReported = false;

/** Test seam: resets the once-per-session Sentry guard. */
export function resetMalformedPayloadReport(): void {
  malformedPayloadReported = false;
}

/**
 * Reads the flag payload into a config, resolving the per-platform block over
 * the top-level values. Returns null (→ no banner) on web, on a missing or
 * unusable payload, and whenever neither tier carries a valid version.
 */
export function parseNudgeConfig(payload: unknown, platform: string = Platform.OS): NudgeConfig | null {
  // Web has no store listing to send anyone to.
  if (platform !== 'ios' && platform !== 'android') return null;
  if (!payload || typeof payload !== 'object') return null;

  const root = payload as Record<string, unknown>;
  const platformBlock =
    root[platform] && typeof root[platform] === 'object'
      ? (root[platform] as Record<string, unknown>)
      : {};

  const pick = (key: string): unknown =>
    key in platformBlock ? platformBlock[key] : root[key];

  const recommendedRaw = pick('recommended');
  const minimumRaw = pick('minimum');
  const recommended = parseVersion(recommendedRaw) ? (recommendedRaw as string) : null;
  const minimum = parseVersion(minimumRaw) ? (minimumRaw as string) : null;

  if (!recommended && !minimum) {
    // A payload that exists but carries nothing usable is a config mistake
    // (typo'd key, build number pasted in). Report once, then stay quiet.
    if (!malformedPayloadReported) {
      malformedPayloadReported = true;
      captureMessage('version-nudge: flag payload has no usable version', {
        context: 'version-nudge-config',
        platform,
      });
    }
    return null;
  }

  const snoozeRaw = pick('snoozeDays');
  const snoozeDays =
    typeof snoozeRaw === 'number' && Number.isFinite(snoozeRaw) && snoozeRaw > 0
      ? snoozeRaw
      : DEFAULT_SNOOZE_DAYS;

  return { recommended, minimum, snoozeDays };
}

/**
 * Pure tier decision. An unknown current version (null runtimeVersion, dev
 * client, unparseable) yields 'none' — we never nudge a user we can't place.
 */
export function resolveNudgeTier(current: string | null, config: NudgeConfig | null): NudgeTier {
  if (!config) return 'none';
  if (compareVersions(current, config.minimum) === -1) return 'minimum';
  if (compareVersions(current, config.recommended) === -1) return 'recommended';
  return 'none';
}

/**
 * Pure snooze policy for the dismissible tier. Unlike the TV Time banner
 * (#687), there is no permanent dismissal cap: this banner is the ONLY way to
 * move a frozen binary, so it returns after each snooze window until the user
 * actually updates — at which point the tier resolves to 'none' and it stops
 * on its own. A snooze recorded against an older `recommended` no longer
 * applies, so a new release resurfaces the banner immediately.
 *
 * `undefined` means the stored value hasn't loaded yet and fails closed.
 */
export function isNudgeSnoozed(
  snooze: NudgeSnooze | null | undefined,
  recommendedVersion: string | null,
  snoozeDays: number,
  nowMs: number = Date.now()
): boolean {
  if (snooze === undefined) return true;
  if (snooze === null) return false;
  if (snooze.version !== recommendedVersion) return false;
  return nowMs - snooze.snoozedAt < snoozeDays * 24 * 60 * 60 * 1000;
}

export async function getNudgeSnooze(): Promise<NudgeSnooze | null> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NudgeSnooze>;
    if (typeof parsed.version !== 'string' || typeof parsed.snoozedAt !== 'number') return null;
    return { version: parsed.version, snoozedAt: parsed.snoozedAt };
  } catch {
    // Unreadable storage — "never dismissed" is the honest answer when there
    // is no record, and a broken read must not permanently suppress the only
    // channel that reaches a frozen binary.
    return null;
  }
}

export async function recordNudgeSnooze(version: string): Promise<NudgeSnooze> {
  const snooze: NudgeSnooze = { version, snoozedAt: Date.now() };
  try {
    await AsyncStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(snooze));
  } catch {
    // Best-effort: the in-memory state already hid the banner for this session.
  }
  return snooze;
}

export function storeUrl(platform: string = Platform.OS): string | null {
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return PLAY_STORE_URL;
  return null;
}

/** Hands off to the store listing. A failed hand-off is swallowed. */
export function openStoreListing(): void {
  const url = storeUrl();
  if (!url) return;
  Linking.openURL(url).catch(() => {
    // Nothing useful to show the user if the store won't open.
  });
}

/** Dev/QA escape hatch: 'recommended' | 'minimum' | 'off' forces the tier. */
export function envOverrideTier(): NudgeTier | null {
  if (ENV_OVERRIDE === 'recommended') return 'recommended';
  if (ENV_OVERRIDE === 'minimum') return 'minimum';
  if (ENV_OVERRIDE === 'off') return 'none';
  return null;
}
