import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { ThemePreference } from '@/lib/database.types';

const THEME_STORAGE_KEY = 'cinetrak_theme_preference';

type EffectiveTheme = 'light' | 'dark';

interface ThemeContextType {
  /** User's stored preference: 'light', 'dark', or 'system' */
  themePreference: ThemePreference;
  /** The actual theme to use (resolves 'system' to device setting) */
  effectiveTheme: EffectiveTheme;
  /** Update the theme preference (persists to Supabase + AsyncStorage) */
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  /** Whether theme is currently being loaded */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const systemColorScheme = useSystemColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Calculate effective theme based on preference and system setting
  const effectiveTheme = useMemo<EffectiveTheme>(() => {
    if (themePreference === 'system') {
      return systemColorScheme === 'light' ? 'light' : 'dark';
    }
    return themePreference;
  }, [themePreference, systemColorScheme]);

  // Load theme from AsyncStorage on mount (instant)
  useEffect(() => {
    const loadCachedTheme = async () => {
      try {
        const cached = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (cached && ['light', 'dark', 'system'].includes(cached)) {
          setThemePreferenceState(cached as ThemePreference);
        }
      } catch (error) {
        console.error('[ThemeContext] Error loading cached theme:', error);
      }
      setIsLoading(false);
    };
    loadCachedTheme();
  }, []);

  // Sync with Supabase when user logs in
  useEffect(() => {
    if (!user) return;

    const syncWithSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('theme_preference')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('[ThemeContext] Error fetching theme from Supabase:', error);
          return;
        }

        if (data?.theme_preference) {
          const serverPref = data.theme_preference as ThemePreference;
          setThemePreferenceState(serverPref);
          // Update local cache to match server
          await AsyncStorage.setItem(THEME_STORAGE_KEY, serverPref);
        }
      } catch (error) {
        console.error('[ThemeContext] Error syncing theme:', error);
      }
    };

    syncWithSupabase();
  }, [user]);

  // Update theme preference (persists to both Supabase and AsyncStorage)
  const setThemePreference = useCallback(async (preference: ThemePreference) => {
    // Optimistically update local state
    setThemePreferenceState(preference);

    // Cache locally for instant load next time
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch (error) {
      console.error('[ThemeContext] Error caching theme:', error);
    }

    // Persist to Supabase if user is logged in
    if (user) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            theme_preference: preference,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) {
          console.error('[ThemeContext] Error saving theme to Supabase:', error);
        }
      } catch (error) {
        console.error('[ThemeContext] Error saving theme:', error);
      }
    }
  }, [user]);

  const value = useMemo(() => ({
    themePreference,
    effectiveTheme,
    setThemePreference,
    isLoading,
  }), [themePreference, effectiveTheme, setThemePreference, isLoading]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook that returns the effective color scheme ('light' or 'dark')
 * This is a drop-in replacement for the existing useColorScheme hook
 * but respects user preference stored in the ThemeContext
 */
export function useEffectiveColorScheme(): EffectiveTheme {
  const { effectiveTheme } = useTheme();
  return effectiveTheme;
}
