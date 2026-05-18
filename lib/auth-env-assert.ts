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

function readEnv(key: EnvKey): string | undefined {
  // process.env.EXPO_PUBLIC_* is inlined at build time by Expo's Metro config.
  // For values surfaced through app.config.js `extra`, also fall back to Constants.
  const fromProcess = process.env[key];
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
