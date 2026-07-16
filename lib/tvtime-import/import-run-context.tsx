import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';

import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import { hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import { getPermissionStatus } from '@/lib/push-notification-service';
import { invalidateTvTimeImportQueries } from '@/lib/query-invalidation';
import { invalidateHasTvTimeImport } from '@/hooks/use-has-tvtime-import';
import {
  runTvTimeImport,
  saveNeedsReview,
  markImportCompleted,
  type ImportCounts,
  type ImportProgress,
  type ImportShow,
  type ImportMovie,
  type PersistedReviewItem,
  type ImportPreview,
} from '@/lib/tvtime-import';

// ---------------------------------------------------------------------------
// Import run state — LIFTED OUT OF THE SCREEN so an import keeps running (and
// stays observable) after the user taps "Hide" and navigates away. The screen
// re-attaches by reading this state; a global pill mirrors it while the screen
// is not focused.
// ---------------------------------------------------------------------------

export type ImportRunPhase = 'idle' | 'running' | 'complete' | 'error';

export interface ImportRunState {
  phase: ImportRunPhase;
  progress: ImportProgress;
  counts: ImportCounts | null;
  preview: ImportPreview | null;
  reviewItems: PersistedReviewItem[];
  error: string | null;
  /** Whether the import SCREEN is currently focused. The pill shows only when
   *  an import is active and the screen is NOT focused. */
  screenFocused: boolean;
}

export interface StartImportArgs {
  userId: string;
  accessToken: string;
  shows: ImportShow[];
  movies: ImportMovie[];
  importKey: string;
  preview: ImportPreview;
  reviewItems: PersistedReviewItem[];
  entryPoint: string;
}

interface ImportRunContextValue extends ImportRunState {
  start: (args: StartImportArgs) => void;
  reset: () => void;
  setScreenFocused: (focused: boolean) => void;
}

const ImportRunContext = createContext<ImportRunContextValue | null>(null);

export function useImportRun(): ImportRunContextValue {
  const ctx = useContext(ImportRunContext);
  if (!ctx) throw new Error('useImportRun must be used within ImportRunProvider');
  return ctx;
}

const IDLE: ImportRunState = {
  phase: 'idle',
  progress: { processed: 0, total: 0 },
  counts: null,
  preview: null,
  reviewItems: [],
  error: null,
  screenFocused: true,
};

/** Fire the completion local notification only when the user has actually left
 *  the app (backgrounded) — an in-app completion is covered by the pill +
 *  haptic. Never prompts for permission (getPermissionStatus only reads it). */
async function maybeNotifyCompletion(result: ImportCounts): Promise<void> {
  try {
    if (AppState.currentState === 'active') return;
    if ((await getPermissionStatus()) !== 'granted') return;
    const stubs = result.episodesInserted + result.moviesInserted + result.moviesUpdated;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Import complete',
        body: `${stubs} ${stubs === 1 ? 'stub' : 'stubs'} printed from your TV Time history.`,
        data: { deeplink: 'pocketstubs://settings/tvtime-import' },
      },
      trigger: null, // immediate
    });
  } catch {
    // best-effort; the in-app pill still signals completion
  }
}

export function ImportRunProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ImportRunState>(IDLE);
  const runningRef = useRef(false);
  const focusedRef = useRef(true);

  const setScreenFocused = useCallback((focused: boolean) => {
    focusedRef.current = focused;
    setState((s) => {
      // The moment the user leaves the screen mid-run = "backgrounded".
      if (!focused && s.phase === 'running') {
        analytics.track('import_backgrounded', {
          processed: s.progress.processed,
          total: s.progress.total,
        });
      }
      return { ...s, screenFocused: focused };
    });
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    setState((s) => ({ ...IDLE, screenFocused: s.screenFocused }));
  }, []);

  const start = useCallback(
    (args: StartImportArgs) => {
      if (runningRef.current) return; // one import at a time
      runningRef.current = true;
      const startedAt = Date.now();
      setState({
        phase: 'running',
        progress: { processed: 0, total: 0 },
        counts: null,
        preview: args.preview,
        reviewItems: args.reviewItems,
        error: null,
        screenFocused: focusedRef.current,
      });
      analytics.track('import_started', {
        entry_point: args.entryPoint,
        shows: args.shows.length,
        episodes: args.shows.reduce((n, sh) => n + sh.episodes.length, 0),
        movies: args.movies.length,
      });

      void (async () => {
        try {
          const result = await runTvTimeImport({
            shows: args.shows,
            movies: args.movies,
            importKey: args.importKey,
            accessToken: args.accessToken,
            onProgress: (p) => setState((s) => (s.phase === 'running' ? { ...s, progress: p } : s)),
          });

          // Completion side-effects run here (not the screen) so they happen
          // even when the user has navigated away.
          await saveNeedsReview(args.userId, args.reviewItems);
          await markImportCompleted(args.userId);
          invalidateTvTimeImportQueries(queryClient);
          invalidateHasTvTimeImport(queryClient);

          analytics.track('import_completed', {
            entry_point: args.entryPoint,
            shows_upserted: result.showsUpserted,
            episodes_inserted: result.episodesInserted,
            episodes_skipped: result.episodesSkipped,
            episodes_invalid: result.episodesInvalid,
            movies_inserted: result.moviesInserted,
            movies_updated: result.moviesUpdated,
            movies_skipped: result.moviesSkipped,
            movies_invalid: result.moviesInvalid,
            needs_review: args.reviewItems.length,
            duration_ms: Date.now() - startedAt,
          });
          if (!focusedRef.current) {
            analytics.track('import_completed_while_hidden', {
              stubs: result.episodesInserted + result.moviesInserted + result.moviesUpdated,
            });
          }

          // Haptic fires regardless of focus (the pill flips to complete).
          hapticNotification(NotificationFeedbackType.Success);
          void maybeNotifyCompletion(result);

          runningRef.current = false;
          setState((s) => ({
            ...s,
            phase: 'complete',
            counts: result,
            progress: { processed: s.progress.total, total: s.progress.total },
          }));
        } catch (err) {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'tvtime-import-run',
          });
          // Persist review state so a backgrounded failure is still recoverable.
          await saveNeedsReview(args.userId, args.reviewItems).catch(() => {});
          runningRef.current = false;
          setState((s) => ({
            ...s,
            phase: 'error',
            error: 'Something interrupted the import. Nothing was duplicated — you can try again.',
          }));
        }
      })();
    },
    [queryClient]
  );

  const value = useMemo<ImportRunContextValue>(
    () => ({ ...state, start, reset, setScreenFocused }),
    [state, start, reset, setScreenFocused]
  );

  return <ImportRunContext.Provider value={value}>{children}</ImportRunContext.Provider>;
}
