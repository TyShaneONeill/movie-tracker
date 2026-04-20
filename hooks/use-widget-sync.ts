import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { syncWidgetCache } from '@/lib/widget-cache';

const DEBOUNCE_MS = 3000;

/**
 * Mounts once at the app root. Keeps the iOS home-screen widget's App Groups
 * cache fresh by firing syncWidgetCache on mount and every foreground event.
 * Foreground triggers are coalesced via a 3s trailing-edge debounce.
 * Skips concurrent in-flight syncs. No-op on other platforms.
 *
 * After each successful sync, invalidates the React Query key families that
 * widget AppIntents (MarkEpisodeWatchedIntent, StartNextSeasonIntent) can
 * mutate directly via Supabase — userTvShow, userTvShows, episodeWatches.
 * This ensures show-detail and list screens reflect widget-initiated state
 * immediately on first foreground render rather than waiting for staleTime.
 */
export function useWidgetSync(): void {
  const inFlight = useRef(false);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const runSync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await syncWidgetCache();
      // Widget AppIntents mutate user_tv_shows + user_episode_watches directly
      // via Supabase. The app's React Query cache has no visibility into these
      // writes, so show-detail + list queries stay stale until staleTime expires
      // — observed as "tap widget eyeball, open app, show-detail checkbox still
      // unchecked." Invalidating on sync ensures the first render after app
      // foreground sees widget-initiated state immediately.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return k === 'userTvShow' || k === 'userTvShows' || k === 'episodeWatches';
        },
      });
    } catch {
      // swallow — syncWidgetCache already has Sentry breadcrumbs for its
      // own failures; invalidation should not run on failed sync
    } finally {
      inFlight.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    const scheduleSync = () => {
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
      trailingTimer.current = setTimeout(() => {
        trailingTimer.current = null;
        void runSync();
      }, DEBOUNCE_MS);
    };

    // Mount fires immediately (cold start should be snappy — no debounce)
    void runSync();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') scheduleSync();
    });

    return () => {
      sub.remove();
      if (trailingTimer.current) clearTimeout(trailingTimer.current);
    };
  }, [runSync]);
}
