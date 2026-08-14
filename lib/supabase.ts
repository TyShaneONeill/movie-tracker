import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type { Database } from './database.types';
import { SecureStorageAdapter } from './secure-storage';

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your .env.local file.'
  );
}

// Check if we're in a browser environment (not SSR/Node.js)
const isBrowser = typeof window !== 'undefined';

// Native: Use SecureStore (OS-level encryption) with automatic chunking for large tokens.
// Web: Use localStorage (no SecureStore equivalent).
// SSR: No-op (no storage available).
const ExpoStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    if (Platform.OS !== 'web') {
      return SecureStorageAdapter.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    if (Platform.OS !== 'web') {
      await SecureStorageAdapter.setItem(key, value);
      return;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
    if (Platform.OS !== 'web') {
      await SecureStorageAdapter.removeItem(key);
      return;
    }
  },
};

// supabase-js derives its default storage key as
// `sb-${hostname.split('.')[0]}-auth-token`. Mirrored here so we can clear the
// persisted session ourselves: signOut() returns early WITHOUT removing it when
// the sign-out call fails with anything other than a 401/403/404, which would
// leave a live token behind for an account that no longer exists.
export function getAuthStorageKey(): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

/** Last-resort session wipe. Safe to call when nothing is stored. */
export async function clearPersistedAuthSession(): Promise<void> {
  const key = getAuthStorageKey();
  await ExpoStorageAdapter.removeItem(key);
  await ExpoStorageAdapter.removeItem(`${key}-code-verifier`);
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // On web, detectSessionInUrl must be true so Supabase can pick up the
    // session from the URL hash after an OAuth redirect (e.g. Google sign-in).
    // On native, it must be false to avoid interfering with deep links.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
