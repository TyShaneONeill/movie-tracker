import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: mockEq };
      },
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return { eq: () => ({ single: mockSingle }) };
      },
    })),
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

import { OnboardingProvider, useOnboarding } from '@/hooks/use-onboarding';
import { useAuth } from '@/hooks/use-auth';

const mockUseAuth = useAuth as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(OnboardingProvider, null, children);
}

describe('useOnboarding.completeOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('returns true on successful DB update', async () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(true);
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('returns false when supabase update returns an error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'db down' } });
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(false);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('returns false when no user is signed in', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(false);
  });
});

// ============================================================================
// N6a: local cache (stale-while-revalidate) + fetch timeout
// ============================================================================

const ONBOARDING_CACHE_KEY = (userId: string) => `pocketstubs_onboarding_completed:${userId}`;
const ONBOARDING_FETCH_TIMEOUT_MS = 5000;

describe('useOnboarding caching + timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
    mockEq.mockResolvedValue({ error: null });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders immediately from a cached value without waiting on the network', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === ONBOARDING_CACHE_KEY('user-1') ? Promise.resolve('true') : Promise.resolve(null)
    );
    // Network never resolves in this test's window — cache hit must not wait on it.
    mockSingle.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('reconciles when the background refresh returns a value different from the cache', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === ONBOARDING_CACHE_KEY('user-1') ? Promise.resolve('true') : Promise.resolve(null)
    );
    // Held open deliberately so we can assert the cache-first render happens
    // before the network resolves, then resolve it to a DIFFERENT value.
    let resolveFetch: (value: unknown) => void = () => {};
    mockSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => useOnboarding(), { wrapper });

    // Served from cache immediately, without waiting on the still-pending fetch.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);

    // Now the background fetch lands and reconciles to the real value.
    await act(async () => {
      resolveFetch({ data: { onboarding_completed: false }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_CACHE_KEY('user-1'), 'false');
  });

  it('defaults to false (does not spin forever) when there is no cache and the fetch hangs past the timeout', async () => {
    mockSingle.mockReturnValue(new Promise(() => {}));

    jest.useFakeTimers();
    const { result } = renderHook(() => useOnboarding(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(ONBOARDING_FETCH_TIMEOUT_MS);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('resetOnboarding() invalidates the cache so a stale true is not resurrected on next launch', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true }, error: null });

    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);

    await act(async () => {
      await result.current.resetOnboarding();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_CACHE_KEY('user-1'), 'false');
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('completeOnboarding() writes the cache so a subsequent cold start renders instantly', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });

    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.completeOnboarding();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_CACHE_KEY('user-1'), 'true');
  });

  it('normal fast path (no cache, fetch resolves quickly) is unchanged', async () => {
    mockSingle.mockResolvedValue({ data: { onboarding_completed: true }, error: null });

    const { result } = renderHook(() => useOnboarding(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasCompletedOnboarding).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(ONBOARDING_CACHE_KEY('user-1'), 'true');
  });
});
