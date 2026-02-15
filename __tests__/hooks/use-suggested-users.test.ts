import '../setup';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useSuggestedUsers } from '@/hooks/use-suggested-users';
import type { SuggestedUser } from '@/lib/suggested-users-service';

// Mock the service
jest.mock('@/lib/suggested-users-service', () => ({
  fetchSuggestedUsers: jest.fn(),
}));

// Mock auth
jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

import { fetchSuggestedUsers } from '@/lib/suggested-users-service';
import { useAuth } from '@/hooks/use-auth';

const mockFetchSuggestedUsers = fetchSuggestedUsers as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

function makeSuggestedUser(overrides: Partial<SuggestedUser> = {}): SuggestedUser {
  return {
    id: 'user-1',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    followersCount: 10,
    reason: 'Followed by @alice',
    reasonType: 'mutual_followers',
    score: 5,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

describe('useSuggestedUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty suggestions and loading=false when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useSuggestedUsers(), {
      wrapper: createWrapper(),
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchSuggestedUsers).not.toHaveBeenCalled();
  });

  it('fetches suggestions when user is authenticated', async () => {
    const suggestions = [makeSuggestedUser()];
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
    mockFetchSuggestedUsers.mockResolvedValue(suggestions);

    const { result } = renderHook(() => useSuggestedUsers(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.suggestions).toEqual(suggestions);
    expect(mockFetchSuggestedUsers).toHaveBeenCalled();
  });

  it('returns error on fetch failure', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
    mockFetchSuggestedUsers.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSuggestedUsers(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.suggestions).toEqual([]);
  });
});
