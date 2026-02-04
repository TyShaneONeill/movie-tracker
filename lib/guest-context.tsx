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
const HAS_SEEN_WELCOME_KEY = 'cinetrak_has_seen_welcome';

interface GuestContextType {
  /** Currently in guest mode (browsing without account) */
  isGuest: boolean;
  /** Has made a choice on welcome screen (either signed in or entered guest mode) */
  hasSeenWelcome: boolean;
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
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load guest state from AsyncStorage on mount
  useEffect(() => {
    const loadGuestState = async () => {
      try {
        const [guestValue, welcomeValue] = await Promise.all([
          AsyncStorage.getItem(GUEST_MODE_KEY),
          AsyncStorage.getItem(HAS_SEEN_WELCOME_KEY),
        ]);

        setIsGuest(guestValue === 'true');
        setHasSeenWelcome(welcomeValue === 'true');
      } catch (error) {
        // If we fail to read, default to showing welcome screen
        setIsGuest(false);
        setHasSeenWelcome(false);
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

      // Mark welcome as seen when user successfully signs in
      if (session?.user && !hasSeenWelcome) {
        await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
        setHasSeenWelcome(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [isGuest, hasSeenWelcome]);

  const enterGuestMode = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(GUEST_MODE_KEY, 'true'),
        AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true'),
      ]);
      setIsGuest(true);
      setHasSeenWelcome(true);
    } catch (error) {
      // Log error but continue - state will be in memory only
      console.error('Failed to save guest mode state:', error);
      setIsGuest(true);
      setHasSeenWelcome(true);
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
        hasSeenWelcome,
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
