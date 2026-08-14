/**
 * Cold-start timeout + cached-user fallback for AuthProvider (N6a).
 * See lib/auth-context.tsx AUTH_SESSION_TIMEOUT_MS / readCachedUser / writeCachedUser.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn().mockReturnValue({
  data: { subscription: { unsubscribe: jest.fn() } },
});
const mockSignOut = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setSentryUser: jest.fn(),
}));

jest.mock('@/lib/query-client', () => ({
  queryClient: { clear: jest.fn() },
}));

jest.mock('@/lib/push-notification-service', () => ({
  unregisterPushToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn() },
}));

jest.mock('expo-apple-authentication', () => ({}));

import { AuthProvider, useAuth } from '@/lib/auth-context';

const AUTH_USER_CACHE_KEY = 'pocketstubs_last_known_user';
const AUTH_SESSION_TIMEOUT_MS = 8000;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const mockUser = {
  id: 'user-1',
  aud: 'authenticated',
  email: 'ty@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('AuthProvider cold-start timeout + cached fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to the cached user when getSession() hangs past the timeout (does not spin forever)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === AUTH_USER_CACHE_KEY ? Promise.resolve(JSON.stringify(mockUser)) : Promise.resolve(null)
    );
    // Simulates a hung token refresh on bad 5G — this promise never settles in the test.
    mockGetSession.mockReturnValue(new Promise(() => {}));

    jest.useFakeTimers();
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_SESSION_TIMEOUT_MS);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
    // Session is intentionally left null on the fallback path — see readCachedUser() doc.
    expect(result.current.session).toBeNull();
  });

  it('renders signed-out (not stuck spinning) when getSession() hangs and there is no cached user', async () => {
    mockGetSession.mockReturnValue(new Promise(() => {}));

    jest.useFakeTimers();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_SESSION_TIMEOUT_MS);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('reconciles with the real session once the hung getSession() eventually resolves', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === AUTH_USER_CACHE_KEY ? Promise.resolve(JSON.stringify(mockUser)) : Promise.resolve(null)
    );

    let resolveSession: (value: unknown) => void = () => {};
    mockGetSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      })
    );

    jest.useFakeTimers();
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_SESSION_TIMEOUT_MS);
    });
    expect(result.current.user).toEqual(mockUser); // fallback applied first

    const realUser = { ...mockUser, id: 'user-2' };
    const realSession = { access_token: 'tok', refresh_token: 'rtok', user: realUser };

    await act(async () => {
      resolveSession({ data: { session: realSession }, error: null });
      // Flush the microtask queue so the .then() handler runs under fake timers.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.session).toEqual(realSession);
    expect(result.current.user).toEqual(realUser);
  });

  it('does not touch the cache fallback when getSession() resolves before the timeout (fast path unchanged)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(AUTH_USER_CACHE_KEY);
  });

  it('caches the resolved user on the normal fast path so a future hang has a fallback', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok', refresh_token: 'rtok', user: mockUser } },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(AUTH_USER_CACHE_KEY, JSON.stringify(mockUser));
  });
});
