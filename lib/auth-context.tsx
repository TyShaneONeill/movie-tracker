import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Toast from 'react-native-toast-message';
import { supabase } from './supabase';
import { queryClient } from './query-client';
import { setSentryUser, captureException } from './sentry';
import { analytics } from '@/lib/analytics';
import type { Session, User } from '@supabase/supabase-js';

// Dynamically import Apple Authentication to avoid crash on web (iOS-only native module)
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  AppleAuthentication = require('expo-apple-authentication');
}

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

// On web, use Supabase OAuth instead of the native Google Sign-In SDK
if (Platform.OS === 'web') {
  isGoogleSignInAvailable = true;
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
  signInWithFacebook: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Track user-initiated sign-outs so we can distinguish them from
  // involuntary ones (e.g. expired refresh token) in onAuthStateChange.
  const userInitiatedSignOut = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) {
        const isRefreshError =
          error.message?.includes('Refresh Token') ||
          error.message?.includes('refresh_token') ||
          error.message?.includes('Invalid Refresh Token');
        // Stale or corrupted session — clear state and let user sign in fresh
        console.warn('[auth] getSession failed:', error.message);
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setSentryUser(null);
        if (isRefreshError) {
          Toast.show({
            type: 'info',
            text1: 'Session expired',
            text2: 'Please sign in again.',
            visibilityTime: 4000,
          });
        }
      } else {
        setSession(s);
        setUser(s?.user ?? null);
        setSentryUser(s?.user?.id ?? null);
      }
      setIsLoading(false);
    }).catch(() => {
      // Catch any unexpected throw (e.g. storage read failure)
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Handle token refresh failure — sign out gracefully instead of
      // surfacing a raw AuthApiError to the user.
      if (event === 'TOKEN_REFRESHED' && !newSession) {
        console.warn('[auth] Token refresh failed — signing out');
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
        setSentryUser(null);
        Toast.show({
          type: 'info',
          text1: 'Session expired',
          text2: 'Please sign in again.',
          visibilityTime: 4000,
        });
        return;
      }

      // Handle involuntary sign-out (e.g. Supabase detected invalid refresh token).
      // Don't show toast for user-initiated sign-outs.
      if (event === 'SIGNED_OUT' && !userInitiatedSignOut.current) {
        // Only show toast if we previously had a session (real expiry, not just app boot)
        if (session) {
          Toast.show({
            type: 'info',
            text1: 'Session expired',
            text2: 'Please sign in again.',
            visibilityTime: 4000,
          });
        }
      }
      userInitiatedSignOut.current = false;

      setSession(newSession);
      setUser(newSession?.user ?? null);
      // Update Sentry user context when auth state changes
      setSentryUser(newSession?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      analytics.track('auth:sign_in', { method: 'email' });
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (!error) {
      analytics.track('auth:sign_up', { method: 'email' });
    }
    // If user exists but session is null, email confirmation is required
    const needsEmailConfirmation = !error && !!data.user && !data.session;
    return { error: error as Error | null, needsEmailConfirmation };
  };

  const signOut = async () => {
    try {
      userInitiatedSignOut.current = true;
      const { error } = await supabase.auth.signOut();
      if (error) {
        captureException(error as Error, { context: 'signOut' });
        throw error;
      }
      analytics.track('auth:sign_out');
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
    if (Platform.OS !== 'ios' || !AppleAuthentication) {
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
        analytics.track('auth:sign_in', { method: 'apple' });
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
    // On web, use Supabase OAuth redirect flow instead of native SDK
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      analytics.track('auth:sign_in', { method: 'google' });
      return;
    }

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

        analytics.track('auth:sign_in', { method: 'google' });
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

  const signInWithFacebook = async () => {
    // On web, use Supabase OAuth redirect flow (same as Google web)
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      return;
    }

    // On native, open an in-app browser for the OAuth flow
    const redirectTo = makeRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }
    } else if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Facebook Sign-In was cancelled');
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

  const value = useMemo(
    () => ({
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
      signInWithFacebook,
      deleteAccount,
    }),
    [
      session,
      user,
      isLoading,
      signIn,
      signUp,
      signOut,
      updatePassword,
      resetPasswordForEmail,
      signInWithApple,
      signInWithGoogle,
      signInWithFacebook,
      deleteAccount,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
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
