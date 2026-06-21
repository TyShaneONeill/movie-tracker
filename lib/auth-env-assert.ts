/**
 * Startup auth-env assertion
 *
 * Loudly reports — to console.error and Sentry — when critical OAuth / Supabase
 * env vars are missing for the current platform. This exists because the
 * Android signup funnel silently broke for weeks: Google Sign-In was gated on
 * `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (which Android doesn't need), so the
 * button silently disabled without any signal in logs.
 *
 * Call from app init (`app/_layout.tsx`) so missing envs scream in CI logs and
 * Sentry as soon as a build boots.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { captureMessage } from './sentry';

type EnvKey =
  | 'EXPO_PUBLIC_SUPABASE_URL'
  | 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
  | 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
  | 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';

const EXTRA_KEY_BY_ENV: Partial<Record<EnvKey, string>> = {
  EXPO_PUBLIC_SUPABASE_URL: 'supabaseUrl',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'supabaseAnonKey',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'googleIosClientId',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'googleWebClientId',
};

// Metro only inlines literal `process.env.EXPO_PUBLIC_X` member-access at bundle
// time — `process.env[variable]` (dynamic) is NOT inlined and returns undefined
// at runtime, which would produce false-positive "missing env var" reports. So
// we hoist each value with literal access once, then index this object instead.
const ENV_VALUES: Record<EnvKey, string | undefined> = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

function readEnv(key: EnvKey): string | undefined {
  const fromProcess = ENV_VALUES[key];
  if (fromProcess) return fromProcess;
  const extraKey = EXTRA_KEY_BY_ENV[key];
  if (extraKey) {
    const fromExtra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[
      extraKey
    ];
    if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  }
  return undefined;
}

// --- Secret-leak guard -----------------------------------------------------
// EXPO_PUBLIC_* values are inlined into the shipped client bundle. A Supabase
// service-role / secret key in any of them bypasses ALL RLS for anyone who
// extracts it — a critical leak. (Caught a staging mix-up where the anon var
// held the service_role key.) Detect and scream.

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const g = globalThis as { atob?: (s: string) => string };
  let json: string | null = null;
  try {
    if (typeof g.atob === 'function') json = g.atob(b64);
  } catch {
    return null;
  }
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { role?: unknown };
    return typeof obj.role === 'string' ? obj.role : null;
  } catch {
    return null;
  }
}

/** True if a value is a Supabase service-role / secret key (never safe in EXPO_PUBLIC_). */
export function isServiceRoleKey(value?: string | null): boolean {
  if (!value) return false;
  if (value.startsWith('sb_secret_')) return true; // new-style secret key
  if (value.startsWith('eyJ')) return jwtRole(value) === 'service_role'; // legacy JWT
  return false;
}

/**
 * Refuse to silently ship a service-role/secret key in a client-public env var.
 * Reports to console + Sentry always; throws in __DEV__ so it's caught before
 * a build is ever cut.
 */
export function assertNoSecretInPublicEnv(): EnvKey[] {
  const offenders = (Object.keys(ENV_VALUES) as EnvKey[]).filter((k) =>
    isServiceRoleKey(ENV_VALUES[k]),
  );
  if (offenders.length === 0) return offenders;

  const banner = `[auth-env] SERVICE-ROLE/SECRET key found in client-public env var(s): ${offenders.join(', ')}. EXPO_PUBLIC_* ships in the client bundle and bypasses RLS — rotate the key and store the secret under a non-EXPO_PUBLIC_ name.`;
  // eslint-disable-next-line no-console
  console.error('\n========================================\n' + banner + '\n========================================\n');
  try {
    captureMessage(banner, { offenders, severity: 'critical' });
  } catch {
    // Sentry may not be initialized yet — the console banner is loud enough.
  }
  if (__DEV__) {
    throw new Error(banner);
  }
  return offenders;
}

function requiredEnvForPlatform(): EnvKey[] {
  if (Platform.OS === 'ios') {
    return [
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ];
  }
  if (Platform.OS === 'android') {
    return [
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ];
  }
  // web (and any other platform)
  return ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
}

/**
 * Check that all required auth env vars are present for the current platform.
 * On missing values, logs a banner to console.error and reports to Sentry.
 * Returns the list of missing keys (empty if all present).
 */
export function assertAuthEnv(): EnvKey[] {
  // Guard against a service-role/secret key leaking into a client-public var.
  assertNoSecretInPublicEnv();

  const required = requiredEnvForPlatform();
  const missing = required.filter((k) => !readEnv(k));
  if (missing.length === 0) return missing;

  const banner = `[auth-env] missing required OAuth env vars on ${Platform.OS}: ${missing.join(', ')}`;
  // eslint-disable-next-line no-console
  console.error(
    '\n========================================\n' +
      banner +
      '\nThis will silently break sign-in flows. Check Doppler / EAS env config.' +
      '\n========================================\n'
  );
  try {
    captureMessage(banner, { platform: Platform.OS, missing });
  } catch {
    // Sentry may not be initialized yet — the console banner is still loud enough.
  }
  return missing;
}
