/**
 * deleteAccount() must destroy the persisted session, not just React state.
 *
 * Regression cover for Sentry REACT-NATIVE-POCKETSTUBS-42. Clearing only
 * setSession/setUser left the stored access token in place; it stays valid
 * until it expires, so the next launch restored a session for a user that no
 * longer exists in auth.users. Every write then failed the user_id foreign key
 * (Postgres 23502/23503 -> PostgREST 409) while the UI reported success.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'tok', user: { id: 'user-1' } } },
        error: null,
      }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    functions: { invoke: jest.fn().mockResolvedValue({ data: { success: true }, error: null }) },
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
  captureMessage: jest.fn(),
  setSentryUser: jest.fn(),
}));

jest.mock('@/lib/query-client', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), setPersonProperties: jest.fn(), identify: jest.fn() },
}));
jest.mock('@/lib/push-notification-service', () => ({
  unregisterPushToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn(), hide: jest.fn() }));
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

import { AuthProvider, useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

async function renderAuth() {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

describe('AuthContext.deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('signs out so no session survives the deleted account', async () => {
    const result = await renderAuth();

    await act(async () => {
      await result.current.deleteAccount();
    });

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('still clears local state when the sign-out call itself fails', async () => {
    mockSignOut.mockResolvedValue({ error: { message: 'user not found' } });
    const result = await renderAuth();

    let outcome: { error: Error | null } | undefined;
    await act(async () => {
      outcome = await result.current.deleteAccount();
    });

    expect(outcome?.error).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('does not sign out when the delete Edge Function fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('edge down') });
    const result = await renderAuth();

    let outcome: { error: Error | null } | undefined;
    await act(async () => {
      outcome = await result.current.deleteAccount();
    });

    expect(outcome?.error).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
