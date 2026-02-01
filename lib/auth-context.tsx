import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { queryClient } from './query-client';
import { setSentryUser, captureException } from './sentry';
import type { Session, User } from '@supabase/supabase-js';

// Get Google client IDs from expo config (exposed via app.config.js extra)
const googleIosClientId =
  Constants.expoConfig?.extra?.googleIosClientId ??
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleWebClientId =
  Constants.expoConfig?.extra?.googleWebClientId ??
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Dynamically import Google Sign-In to handle Expo Go gracefully
let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null = null;
let isSuccessResponse: typeof import('@react-native-google-signin/google-signin').isSuccessResponse | null = null;
let isErrorWithCode: typeof import('@react-native-google-signin/google-signin').isErrorWithCode | null = null;
let statusCodes: typeof import('@react-native-google-signin/google-signin').statusCodes | null = null;
let isGoogleSignInAvailable = false;

try {
  const googleSignInModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = googleSignInModule.GoogleSignin;
  isSuccessResponse = googleSignInModule.isSuccessResponse;
  isErrorWithCode = googleSignInModule.isErrorWithCode;
  statusCodes = googleSignInModule.statusCodes;

  // Configure Google Sign-In if module loaded successfully
  if (GoogleSignin && googleIosClientId) {
    GoogleSignin.configure({
      iosClientId: googleIosClientId,
      webClientId: googleWebClientId,
    });
    isGoogleSignInAvailable = true;
  }
} catch (error) {
  // Google Sign-In not available (expected in Expo Go)
  isGoogleSignInAvailable = false;
}

// Export availability flags for UI components
export { isGoogleSignInAvailable };

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isGoogleSignInAvailable: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Set Sentry user context on initial load
      setSentryUser(session?.user?.id ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Update Sentry user context when auth state changes
      setSentryUser(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    // If user exists but session is null, email confirmation is required
    const needsEmailConfirmation = !error && !!data.user && !data.session;
    return { error: error as Error | null, needsEmailConfirmation };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        captureException(error as Error, { context: 'signOut' });
        throw error;
      }
      // Clear all cached queries to prevent stale user data
      queryClient.clear();
      // Explicitly clear the state to ensure immediate UI update
      setSession(null);
      setUser(null);
    } catch (error) {
      captureException(error as Error, { context: 'signOut' });
      // Clear cache and state even if API call fails to ensure user is logged out locally
      queryClient.clear();
      setSession(null);
      setUser(null);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error as Error | null };
  };

  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'cinetrak://reset-password',
    });
    return { error: error as Error | null };
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only available on iOS devices');
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (error) {
          throw error;
        }
        // Auth state will be updated by the onAuthStateChange listener
        return;
      }

      throw new Error('No identity token received from Apple');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
        const appleError = error as { code: string };
        if (appleError.code === 'ERR_REQUEST_CANCELED') {
          throw new Error('Apple Sign-In was cancelled');
        }
      }
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    if (!isGoogleSignInAvailable || !GoogleSignin || !isSuccessResponse || !isErrorWithCode || !statusCodes) {
      throw new Error('Google Sign-In is not available. Please use a development build to test this feature.');
    }

    try {
      // Check if Google Play Services are available (Android) or proceed (iOS)
      await GoogleSignin.hasPlayServices();

      // Trigger native Google Sign-In
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const { idToken } = response.data;

        if (!idToken) {
          throw new Error('No ID token received from Google');
        }

        // Sign in with Supabase using the ID token
        const { error, data } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (error) {
          if (error.message.includes('audience')) {
            throw new Error(
              'Google Sign-In failed: The iOS Client ID is not authorized in Supabase. ' +
              'Add the iOS Client ID to Supabase Dashboard > Authentication > Providers > Google > Client IDs.'
            );
          }
          throw error;
        }

        // Auth state will be updated by the onAuthStateChange listener
        return;
      } else {
        throw new Error('Google Sign-In failed');
      }
    } catch (error) {
      if (isErrorWithCode && isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            throw new Error('Google Sign-In was cancelled');
          case statusCodes.IN_PROGRESS:
            throw new Error('Google Sign-In is already in progress');
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            throw new Error('Google Play Services not available');
          default:
            throw error;
        }
      }
      throw error;
    }
  };

  const deleteAccount = async (): Promise<{ error: Error | null }> => {
    try {
      // Get the current session for the authorization header
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        return { error: new Error('No active session') };
      }

      // Call the delete-account Edge Function
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });

      if (error) {
        captureException(error as Error, { context: 'deleteAccount' });
        return { error: error as Error };
      }

      if (data?.error) {
        return { error: new Error(data.error) };
      }

      // Clear all cached queries
      queryClient.clear();

      // Clear the session and user state
      setSession(null);
      setUser(null);

      return { error: null };
    } catch (error) {
      captureException(error as Error, { context: 'deleteAccount' });
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading,
        isGoogleSignInAvailable,
        signIn,
        signUp,
        signOut,
        updatePassword,
        resetPasswordForEmail,
        signInWithApple,
        signInWithGoogle,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
