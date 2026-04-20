import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ============================================================================
// Mocks - must come before the import of the hook under test
// ============================================================================

const mockSync = jest.fn();
jest.mock('@/lib/widget-cache', () => ({
  syncWidgetCache: (...args: unknown[]) => mockSync(...args),
}));

import { useWidgetSync } from '@/hooks/use-widget-sync';

// ============================================================================
// Tests
// ============================================================================

// Helper: create a fresh QueryClient + wrapper for each test.
// useWidgetSync now calls useQueryClient(), so all renderHook calls need a
// QueryClientProvider in scope — even tests that don't assert on invalidation.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useWidgetSync', () => {
  beforeEach(() => {
    mockSync.mockReset();
    mockSync.mockResolvedValue(undefined);
  });

  it('runs sync on mount', async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWidgetSync(), { wrapper });
    await act(async () => {});
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('runs sync when AppState changes to active (after debounce)', async () => {
    jest.useFakeTimers();
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (s: string) => void
    ) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    const { wrapper } = createWrapper();
    renderHook(() => useWidgetSync(), { wrapper });
    // Drain the mount sync
    await act(async () => {});
    mockSync.mockClear();

    // Trigger active event then advance past the 3s debounce window
    await act(async () => {
      listeners.forEach((cb) => cb('active'));
      jest.advanceTimersByTime(3000);
    });

    jest.useRealTimers();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('skips subsequent triggers while a sync is in flight', async () => {
    let resolveFirst: () => void = () => {};
    mockSync.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveFirst = r; })
    );
    mockSync.mockResolvedValue(undefined);

    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (s: string) => void
    ) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    const { wrapper } = createWrapper();
    renderHook(() => useWidgetSync(), { wrapper });
    // Mount call is in flight - trigger two more AppState events
    await act(async () => {
      listeners.forEach((cb) => cb('active'));
      listeners.forEach((cb) => cb('active'));
    });

    // Still just the one mount call - the two AppState events were skipped
    expect(mockSync).toHaveBeenCalledTimes(1);

    // Resolve the in-flight sync so the hook can clean up
    await act(async () => {
      resolveFirst();
    });
  });

  it('removes the AppState listener on unmount', async () => {
    const removeMock = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({
      remove: removeMock,
    } as never);

    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useWidgetSync(), { wrapper });
    await act(async () => {});
    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid AppState active triggers into a single delayed sync', async () => {
    jest.useFakeTimers();
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: (s: string) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    const { wrapper } = createWrapper();
    renderHook(() => useWidgetSync(), { wrapper });
    await act(async () => {});
    mockSync.mockClear();

    // Rapid-fire 5 active events within 100ms
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        listeners.forEach((cb) => cb('active'));
        jest.advanceTimersByTime(20);
      }
    });

    // None should have fired yet - still within the 3s debounce window
    expect(mockSync).not.toHaveBeenCalled();

    // Advance past the debounce window
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    jest.useRealTimers();
    // Let the pending runSync promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Cache invalidation tests (require QueryClient wrapper)
// ============================================================================

describe('useWidgetSync cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSync.mockResolvedValue(undefined);
  });

  it('invalidates userTvShow/userTvShows/episodeWatches queries after sync', async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useWidgetSync(), { wrapper });

    // Allow the async sync + invalidation to complete
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });

    // Verify predicate logic covers the right key families
    const predicateCall = invalidateSpy.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean };
    const predicate = predicateCall.predicate;

    expect(predicate({ queryKey: ['userTvShow', 'uid', 123] })).toBe(true);
    expect(predicate({ queryKey: ['userTvShows', 'uid', 'watching'] })).toBe(true);
    expect(predicate({ queryKey: ['episodeWatches', 'uid', 'utv', 2] })).toBe(true);
    // Must NOT invalidate TMDB metadata or unrelated key families
    expect(predicate({ queryKey: ['tvShow', 123] })).toBe(false);
    expect(predicate({ queryKey: ['userTvShowLike', 'uid', 123] })).toBe(false);
    expect(predicate({ queryKey: ['movie', 456] })).toBe(false);
  });

  it('does NOT invalidate when syncWidgetCache rejects', async () => {
    mockSync.mockRejectedValue(new Error('boom'));
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useWidgetSync(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSync).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
