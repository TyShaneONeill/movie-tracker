import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the provider.
// ---------------------------------------------------------------------------

// useAuth is mutable so a test can simulate logout / account switch mid-run.
let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

const mockRunImport = jest.fn();
const mockSaveNeedsReview = jest.fn().mockResolvedValue(undefined);
const mockMarkImportCompleted = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/tvtime-import', () => ({
  runTvTimeImport: (...args: unknown[]) => mockRunImport(...args),
  saveNeedsReview: (...args: unknown[]) => mockSaveNeedsReview(...args),
  markImportCompleted: (...args: unknown[]) => mockMarkImportCompleted(...args),
}));

const mockHaptic = jest.fn();
jest.mock('@/lib/haptics', () => ({
  hapticNotification: (...args: unknown[]) => mockHaptic(...args),
  NotificationFeedbackType: { Success: 'success' },
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@/lib/query-invalidation', () => ({
  invalidateTvTimeImportQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
}));
const mockInvalidateHas = jest.fn();
jest.mock('@/hooks/use-has-tvtime-import', () => ({
  invalidateHasTvTimeImport: (...args: unknown[]) => mockInvalidateHas(...args),
}));

jest.mock('@/lib/push-notification-service', () => ({
  getPermissionStatus: jest.fn().mockResolvedValue('denied'),
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

import { ImportRunProvider, useImportRun } from '@/lib/tvtime-import/import-run-context';
import type { StartImportArgs } from '@/lib/tvtime-import/import-run-context';
import type { ImportCounts } from '@/lib/tvtime-import';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const COUNTS: ImportCounts = {
  showsUpserted: 2,
  episodesInserted: 10,
  episodesSkipped: 0,
  episodesInvalid: 0,
  moviesInserted: 3,
  moviesUpdated: 1,
  moviesSkipped: 0,
  moviesInvalid: 0,
};

function startArgs(userId = 'user-1'): StartImportArgs {
  return {
    userId,
    accessToken: 'token',
    shows: [],
    movies: [],
    importKey: 'key-1',
    preview: {
      shows: 2,
      episodes: 10,
      moviesWatched: 3,
      moviesWatchlist: 0,
      needsAttention: 0,
    },
    reviewItems: [],
    entryPoint: 'settings',
  };
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(ImportRunProvider, null, children));
  return renderHook(() => useImportRun(), { wrapper });
}

beforeEach(() => {
  mockUser = { id: 'user-1' };
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportRunProvider', () => {
  it('ignores a second start() while a run is in flight (double-start guard)', async () => {
    const d = deferred<ImportCounts>();
    mockRunImport.mockReturnValue(d.promise);

    const { result } = renderProvider();

    act(() => {
      result.current.start(startArgs());
      result.current.start(startArgs()); // second tap while running
    });

    expect(mockRunImport).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(COUNTS);
      await d.promise;
    });

    await waitFor(() => expect(result.current.phase).toBe('complete'));
  });

  it('suppresses completion side-effects and resets when the user changes mid-run', async () => {
    const d = deferred<ImportCounts>();
    mockRunImport.mockReturnValue(d.promise);

    const { result, rerender } = renderProvider();

    act(() => {
      result.current.start(startArgs('user-1'));
    });
    expect(result.current.phase).toBe('running');

    // Logout (or account switch) while the import is still running.
    mockUser = null;
    rerender(undefined);

    // The run's promise resolves AFTER the user is gone.
    await act(async () => {
      d.resolve(COUNTS);
      await d.promise;
    });

    // None of the completion side-effects fire for the departed user...
    expect(mockSaveNeedsReview).not.toHaveBeenCalled();
    expect(mockMarkImportCompleted).not.toHaveBeenCalled();
    expect(mockHaptic).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalledWith('import_completed', expect.anything());
    // ...and the provider state is dropped back to idle.
    await waitFor(() => expect(result.current.phase).toBe('idle'));
  });

  it('fires completion side-effects exactly once when the import finishes while hidden', async () => {
    const d = deferred<ImportCounts>();
    mockRunImport.mockReturnValue(d.promise);

    const { result } = renderProvider();

    act(() => {
      result.current.start(startArgs());
    });
    // User navigates away mid-run → screen unfocused.
    act(() => {
      result.current.setScreenFocused(false);
    });

    await act(async () => {
      d.resolve(COUNTS);
      await d.promise;
    });

    await waitFor(() => expect(result.current.phase).toBe('complete'));
    expect(mockMarkImportCompleted).toHaveBeenCalledTimes(1);
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('import_completed', expect.objectContaining({ entry_point: 'settings' }));
    expect(mockTrack).toHaveBeenCalledWith('import_completed_while_hidden', expect.objectContaining({ stubs: COUNTS.episodesInserted + COUNTS.moviesInserted + COUNTS.moviesUpdated }));
    // background analytics fires once, not twice (StrictMode-safe: outside the setState updater)
    expect(mockTrack.mock.calls.filter((c) => c[0] === 'import_backgrounded')).toHaveLength(1);
  });

  it('drops a FINISHED run to idle when the user leaves the screen (so the global pill cannot linger)', async () => {
    const d = deferred<ImportCounts>();
    mockRunImport.mockReturnValue(d.promise);

    const { result } = renderProvider();

    act(() => {
      result.current.start(startArgs());
    });
    // Import completes while the user is still on the done screen (focused).
    await act(async () => {
      d.resolve(COUNTS);
      await d.promise;
    });
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    // Leaving the done screen (via the "Ink your blank stubs" CTA / back-swipe —
    // not the explicit Done button) must reset the run; otherwise the completed
    // phase was carried out of the flow and the global pill lingered on the deck
    // and home (founder soak round 4 P0).
    act(() => {
      result.current.setScreenFocused(false);
    });
    await waitFor(() => expect(result.current.phase).toBe('idle'));
  });

  it('leaves a RUNNING import untouched on blur (backgrounded import still completes + surfaces)', async () => {
    const d = deferred<ImportCounts>();
    mockRunImport.mockReturnValue(d.promise);

    const { result } = renderProvider();
    act(() => {
      result.current.start(startArgs());
    });
    // Leaving mid-run must NOT reset — the import keeps going and the pill shows.
    act(() => {
      result.current.setScreenFocused(false);
    });
    expect(result.current.phase).toBe('running');

    await act(async () => {
      d.resolve(COUNTS);
      await d.promise;
    });
    await waitFor(() => expect(result.current.phase).toBe('complete'));
  });
});
