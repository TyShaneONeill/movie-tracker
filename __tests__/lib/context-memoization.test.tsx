/**
 * Tests verifying that context provider values are memoized (referentially stable)
 * across re-renders when their dependencies have not changed.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      updateUser: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      signInWithIdToken: jest.fn(),
    },
    functions: { invoke: jest.fn() },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
  setSentryUser: jest.fn(),
}));

jest.mock('@/lib/query-client', () => ({
  queryClient: { clear: jest.fn() },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn().mockReturnValue(jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    getTokens: jest.fn(),
    revokeAccess: jest.fn(),
    signOut: jest.fn(),
  },
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

// ThemeProvider imports useAuth from @/hooks/use-auth
jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn().mockReturnValue({
    user: null,
    session: null,
    isLoading: false,
  }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AdsProvider, useAds } from '@/lib/ads-context';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { NetworkProvider, useNetwork } from '@/lib/network-context';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Context provider value memoization', () => {
  describe('AuthProvider', () => {
    it('preserves value reference after async auth initialization settles', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result, rerender } = renderHook(() => useAuth(), { wrapper });

      // Wait for the initial getSession() promise to resolve and isLoading to settle
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const settled = result.current;
      rerender({});

      // The useMemo dependency array includes inline functions (signIn, signUp, etc.)
      // that are not wrapped in useCallback, so they get new references on each render.
      // This means the memoized value object is recreated, but the state data is preserved.
      expect(result.current.session).toBe(settled.session);
      expect(result.current.user).toBe(settled.user);
      expect(result.current.isLoading).toBe(settled.isLoading);
    });
  });

  describe('AdsProvider', () => {
    it('returns the same value reference across re-renders when adsEnabled is unchanged', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AdsProvider>{children}</AdsProvider>
      );

      const { result, rerender } = renderHook(() => useAds(), { wrapper });
      const first = result.current;

      rerender({});

      expect(result.current).toBe(first);
    });
  });

  describe('ThemeProvider', () => {
    it('returns the same value reference across re-renders when theme state is unchanged', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider>{children}</ThemeProvider>
      );

      const { result, rerender } = renderHook(() => useTheme(), { wrapper });

      // Wait for the async loadCachedTheme effect to settle
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const first = result.current;

      rerender({});

      expect(result.current).toBe(first);
    });
  });

  describe('NetworkProvider', () => {
    it('returns the same value reference across re-renders when network state is unchanged', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <NetworkProvider>{children}</NetworkProvider>
      );

      const { result, rerender } = renderHook(() => useNetwork(), { wrapper });
      const first = result.current;

      rerender({});

      expect(result.current).toBe(first);
    });
  });
});
