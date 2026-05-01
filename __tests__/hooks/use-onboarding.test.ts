import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';

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
