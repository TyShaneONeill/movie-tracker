import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const GUEST_MODE_KEY = 'cinetrak_is_guest';

interface GuestContextType {
  /** Currently in guest mode (browsing without account) */
  isGuest: boolean;
  /** Loading state while reading from AsyncStorage */
  isLoading: boolean;
  /** Enter guest mode to browse without signing in */
  enterGuestMode: () => Promise<void>;
  /** Exit guest mode (called automatically when user signs in) */
  exitGuestMode: () => Promise<void>;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load guest state from AsyncStorage on mount
  useEffect(() => {
    const loadGuestState = async () => {
      try {
        const guestValue = await AsyncStorage.getItem(GUEST_MODE_KEY);
        setIsGuest(guestValue === 'true');
      } catch (error) {
        setIsGuest(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadGuestState();
  }, []);

  // Listen for auth state changes - exit guest mode when user logs in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && isGuest) {
        // User logged in while in guest mode, exit guest mode
        await exitGuestMode();
      }
    });

    return () => subscription.unsubscribe();
  }, [isGuest]);

  const enterGuestMode = useCallback(async () => {
    try {
      // Clear any stale auth session before entering guest mode
      // This prevents "Invalid Refresh Token" errors from leftover sessions
      await supabase.auth.signOut();

      await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
      setIsGuest(true);
    } catch (error) {
      // Log error but continue - state will be in memory only
      console.error('Failed to save guest mode state:', error);
      setIsGuest(true);
    }
  }, []);

  const exitGuestMode = useCallback(async () => {
    try {
      await AsyncStorage.setItem(GUEST_MODE_KEY, 'false');
      setIsGuest(false);
    } catch (error) {
      // Log error but continue
      console.error('Failed to clear guest mode state:', error);
      setIsGuest(false);
    }
  }, []);

  return (
    <GuestContext.Provider
      value={{
        isGuest,
        isLoading,
        enterGuestMode,
        exitGuestMode,
      }}
    >
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error('useGuest must be used within a GuestProvider');
  }
  return context;
}
