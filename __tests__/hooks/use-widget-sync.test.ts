import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

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

describe('useWidgetSync', () => {
  beforeEach(() => {
    mockSync.mockReset();
    mockSync.mockResolvedValue(undefined);
  });

  it('runs sync on mount', async () => {
    renderHook(() => useWidgetSync());
    await act(async () => {});
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('runs sync when AppState changes to active', async () => {
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (s: string) => void
    ) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }) as never);

    renderHook(() => useWidgetSync());
    // Drain the mount sync
    await act(async () => {});
    mockSync.mockClear();

    await act(async () => {
      listeners.forEach((cb) => cb('active'));
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

    renderHook(() => useWidgetSync());
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

    const { unmount } = renderHook(() => useWidgetSync());
    await act(async () => {});
    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
