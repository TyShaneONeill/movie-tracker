import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type { Database } from './database.types';

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

// Use AsyncStorage for native platforms (no size limit, unlike SecureStore's 2048 byte limit)
// This fixes the "Value being stored in SecureStore is larger than 2048 bytes" issue
const ExpoStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    // Web browser: use localStorage
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    // Native (iOS/Android): use AsyncStorage
    if (Platform.OS !== 'web') {
      return await AsyncStorage.getItem(key);
    }
    // SSR/Node.js context: return null (no storage available)
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    if (Platform.OS !== 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    // SSR/Node.js context: no-op
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web' && isBrowser && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
    if (Platform.OS !== 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    // SSR/Node.js context: no-op
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
