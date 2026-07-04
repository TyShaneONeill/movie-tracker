import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies before importing the hook
const mockGetNotifications = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();

jest.mock('@/lib/notification-service', () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
  markAllAsRead: (...args: unknown[]) => mockMarkAllAsRead(...args),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useNotifications } from '@/hooks/use-notifications';

const n = (id: string, read: boolean) => ({
  id,
  user_id: 'user-1',
  actor_id: 'actor-1',
  type: 'like_first_take',
  data: {},
  read,
  created_at: '2026-07-03T00:00:00Z',
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useNotifications — per-row optimistic mark-as-read (issue #580 device repro)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotifications.mockResolvedValue({
      notifications: [n('n1', false), n('n2', false)],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(2);
    mockMarkAsRead.mockResolvedValue(undefined);
    mockMarkAllAsRead.mockResolvedValue(undefined);
  });

  it('flips ONLY the tapped row to read, immediately, after markAllAsRead ran on screen open', async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    // List loads with both rows unread
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    expect(result.current.notifications.every((x) => !x.read)).toBe(true);

    // Screen-open behavior: mark all read (server) — refetchType 'none'
    // must keep the rendered rows unread for this session
    await act(async () => {
      await result.current.markAllAsRead();
    });
    expect(result.current.notifications.every((x) => !x.read)).toBe(true);

    // User taps n1 → the row must settle to read (onMutate patch + onSuccess
    // re-assert). NOTE: the hook-level cache alone can still transiently lose
    // a race against a stale in-flight refetch — the notifications SCREEN
    // additionally holds session-local readOverrides so the tapped row
    // renders read regardless (the actual #580 device guarantee).
    await act(async () => {
      await result.current.markAsRead('n1');
    });

    await waitFor(() => {
      expect(result.current.notifications.find((x) => x.id === 'n1')?.read).toBe(true);
    });
    expect(result.current.notifications.find((x) => x.id === 'n2')?.read).toBe(false);
  });

  it('flips the tapped row even before the server write resolves (optimistic)', async () => {
    // Server write hangs — the optimistic patch alone must update the row
    let resolveWrite: () => void = () => {};
    mockMarkAsRead.mockImplementation(
      () => new Promise<void>((res) => { resolveWrite = res; })
    );

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    act(() => {
      result.current.markAsRead('n1').catch(() => {});
    });

    await waitFor(() => {
      expect(result.current.notifications.find((x) => x.id === 'n1')?.read).toBe(true);
    });
    expect(result.current.notifications.find((x) => x.id === 'n2')?.read).toBe(false);

    resolveWrite();
  });
});
