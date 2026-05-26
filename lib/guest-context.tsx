import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { unregisterPushToken } from '@/lib/push-notification-service';

const GUEST_MODE_KEY = 'pocketstubs_is_guest';

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
  // On web, default to guest mode immediately (content-first, no signin wall)
  const [isGuest, setIsGuest] = useState(Platform.OS === 'web');
  const [isLoading, setIsLoading] = useState(true);

  // Load guest state from AsyncStorage on mount
  useEffect(() => {
    const loadGuestState = async () => {
      try {
        if (Platform.OS === 'web') {
          // Web always starts in guest mode — no need to check AsyncStorage
          setIsGuest(true);
        } else {
          const guestValue = await AsyncStorage.getItem(GUEST_MODE_KEY);
          setIsGuest(guestValue === 'true');
        }
      } catch (error) {
        setIsGuest(Platform.OS === 'web');
      } finally {
        setIsLoading(false);
      }
    };

    loadGuestState();
  }, []);

  // Read isGuest through a ref inside the auth-listener callback so the effect
  // below can keep an empty dep array. Including `isGuest` in the deps
  // re-subscribed Supabase on every guest-state flip; Supabase synchronously
  // re-emits INITIAL_SESSION on each new subscription, which calls
  // exitGuestMode → setIsGuest → re-subscribe → … until Hermes OOMs.
  // Repro: PocketStubs-2026-05-26-152834.ips (expo::EventEmitter::removeListener
  // frame in the Hades OOM stack, triggered by a deep-link push during
  // early-lifecycle hydration).
  const isGuestRef = useRef(isGuest);
  useEffect(() => {
    isGuestRef.current = isGuest;
  }, [isGuest]);

  const enterGuestMode = useCallback(async () => {
    try {
      // Clear any stale auth session before entering guest mode
      // This prevents "Invalid Refresh Token" errors from leftover sessions
      await unregisterPushToken();
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

  // Listen for auth state changes - exit guest mode when user logs in.
  // Declared AFTER exitGuestMode so the useCallback ref is defined when the
  // effect runs. Critically uses isGuestRef (not isGuest) so the dep array
  // can be [exitGuestMode] instead of [isGuest] — see the OOM note above.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip the synchronous INITIAL_SESSION re-emit so re-subscribes never
      // re-enter exitGuestMode.
      if (event === 'INITIAL_SESSION') return;
      if (session?.user && isGuestRef.current) {
        // User logged in while in guest mode, exit guest mode
        await exitGuestMode();
      }
    });

    return () => subscription.unsubscribe();
  }, [exitGuestMode]);

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
