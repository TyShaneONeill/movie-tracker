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

// Captures the QueryClient created for the most recent wrapper so a test can
// drive it directly (e.g. force an in-flight refetch to reproduce a race).
let lastQueryClient: QueryClient;
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  lastQueryClient = queryClient;
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

describe('useNotifications — removeRequestCards (in-place resolution of follow_request cards)', () => {
  const req = (id: string, actorId: string) => ({
    id,
    user_id: 'user-1',
    actor_id: actorId,
    type: 'follow_request',
    data: {},
    read: false,
    created_at: '2026-07-03T00:00:00Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnreadCount.mockResolvedValue(3);
    mockMarkAsRead.mockResolvedValue(undefined);
    mockMarkAllAsRead.mockResolvedValue(undefined);
  });

  it('removes every follow_request card from the actor, synchronously, leaving other cards intact', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), req('r2', 'actor-1'), n('n1', false)],
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));

    // No server round-trip involved — pure cache surgery must drop both
    // duplicate request cards from actor-1 (cancel + re-send, issue #588)
    act(() => {
      result.current.removeRequestCards('actor-1');
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });
    expect(result.current.notifications[0].id).toBe('n1');
  });

  it('does not touch non-request cards from the same actor or requests from other actors', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), req('r2', 'actor-2'), n('n1', false)],
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));

    act(() => {
      result.current.removeRequestCards('actor-1');
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(2);
    });
    const ids = result.current.notifications.map((x) => x.id).sort();
    expect(ids).toEqual(['n1', 'r2']);
  });
});

describe('useNotifications — clearUnreadForRequests (bell badge clears on accept/decline)', () => {
  const req = (id: string, actorId: string, read = false) => ({
    id,
    user_id: 'user-1',
    actor_id: actorId,
    type: 'follow_request',
    data: {},
    read,
    created_at: '2026-07-03T00:00:00Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkAsRead.mockResolvedValue(undefined);
    mockMarkAllAsRead.mockResolvedValue(undefined);
  });

  it('decrements the badge count by the unread request cards from the actor', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), n('n1', false)],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(2);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    // Both the list AND the count must be loaded — clearUnreadForRequests
    // counts the unread request rows from the cached list.
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });

    // Badge drops by the one unread follow_request card from actor-1. The
    // decrement lands in the cache synchronously, but the bell reads it through
    // a useQuery observer whose re-render React Query dispatches on the next
    // task — so assert the settled value via waitFor, exactly as the
    // removeRequestCards suite above does for the list. (An immediate read here
    // sees the pre-clear value even though the cache is already correct — that
    // async gap is what #731's own tests read as a failure.)
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('drops duplicate request cards from the same actor (cancel + re-send, #588) once each', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), req('r2', 'actor-1'), n('n1', false)],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(3);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    await waitFor(() => expect(result.current.unreadCount).toBe(3));

    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('does not go negative if the cached count already lags behind', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1')],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(0);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('leaves the count untouched for actors with no unread request cards', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-2'), req('r2', 'actor-1', true), n('n1', false)],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(2);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    // actor-1's only card is already read → nothing to decrement.
    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });

    expect(result.current.unreadCount).toBe(2);
  });

  it('wins the race against a stale in-flight count refetch (the stuck-badge repro)', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), n('n1', true)],
      hasMore: false,
    });
    // The screen-open count fetch is still in flight when the user accepts —
    // it will resolve LATE with a stale pre-accept value. cancelQueries in
    // clearUnreadForRequests must neutralize it so its result is discarded and
    // the deterministically-cleared badge is NOT overwritten (the exact race
    // that left the badge stuck in prod).
    let resolveStaleCount: (v: number) => void = () => {};
    mockGetUnreadCount
      .mockImplementationOnce(
        () => new Promise<number>((res) => { resolveStaleCount = res; })
      )
      .mockResolvedValue(0);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    // Accept resolves the request before the stale count fetch settles.
    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });
    expect(result.current.unreadCount).toBe(0);

    // The stale fetch resolves LATE with a clearly-distinct value — if it
    // could write, the badge would jump to 5. cancelQueries must have
    // discarded it, so the badge stays cleared.
    await act(async () => {
      resolveStaleCount(5);
      await Promise.resolve();
    });
    expect(result.current.unreadCount).toBe(0);
  });

  it('a stale count refetch resolving AFTER the optimistic decrement is discarded, not restored', async () => {
    // The prod stuck-badge repro with a real prior count: the badge has already
    // loaded a value (2), then a refetch is in flight (the screen-open count
    // snapshot that still counts the pending follow_request) when the user
    // accepts. clearUnreadForRequests cancels that in-flight fetch first, then
    // decrements to 1 — so when the fetch settles late with a stale value it
    // must be discarded, leaving the badge at the decremented value rather than
    // the stale pre-accept count.
    mockGetNotifications.mockResolvedValue({
      notifications: [req('r1', 'actor-1'), n('n1', true)],
      hasMore: false,
    });
    let resolveStaleRefetch: (v: number) => void = () => {};
    mockGetUnreadCount
      .mockResolvedValueOnce(2) // initial screen load
      .mockImplementationOnce(
        () => new Promise<number>((res) => { resolveStaleRefetch = res; })
      )
      .mockResolvedValue(2); // any further refetch would also read the stale 2

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    // Force a count refetch and leave it in flight (hanging) — mirrors the
    // pre-accept snapshot fetch that has not settled yet.
    act(() => {
      lastQueryClient.invalidateQueries({ queryKey: ['notificationCount', 'user-1'] });
    });
    await waitFor(() => expect(mockGetUnreadCount).toHaveBeenCalledTimes(2));

    // Accept resolves the request while that refetch is still in flight.
    await act(async () => {
      await result.current.clearUnreadForRequests('actor-1');
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    // The stale in-flight refetch settles LATE with a distinct value. It was
    // cancelled before the decrement, so it must be dropped entirely: the badge
    // must stay at the optimistic 1 — not jump to 99, not revert to 2.
    await act(async () => {
      resolveStaleRefetch(99);
      await Promise.resolve();
    });
    expect(result.current.unreadCount).toBe(1);
  });
});
