/**
 * Loads the user's streak card for whichever surface needs it (the Stats entry
 * cell and the streak screen), refetching whenever an activity is recorded and
 * whenever the app returns to the foreground on a NEW local day.
 *
 * Fails closed on `streak_spine`: while the flag is off nothing is fetched and
 * `card` stays null, so a gated caller renders its pre-streak fallback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useStreakSpineEnabled } from '@/hooks/use-feature-flag';
import { useStreak } from '@/lib/streak-context';
import { getStreakCard, type StreakCard } from '@/lib/streak-service';
import { localTodayISO } from '@/lib/streak-logic';

export function useStreakCard(): {
  enabled: boolean;
  card: StreakCard | null;
  loaded: boolean;
  reload: () => void;
} {
  const enabled = useStreakSpineEnabled();
  const { streakVersion } = useStreak();
  const [card, setCard] = useState<StreakCard | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Every fetch takes a ticket and only the newest one may write. Two are
  // genuinely concurrent here — a recorded activity bumps streakVersion while a
  // foreground refetch is already in flight — and without this the slower of
  // the two wins and paints a stale card over a fresh one.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestRequest.current;
    const data = await getStreakCard();
    if (ticket !== latestRequest.current) return;
    setCard(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load, streakVersion, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // A card fetched yesterday is not merely stale, it is INVERTED: a streak
  // extended before midnight still renders "in the can" on a day nothing has
  // been logged. Refetch only when the local date has actually rolled over, so
  // an ordinary app-switch costs nothing.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (card && localTodayISO() !== card.localDate) void load();
    });
    return () => sub.remove();
  }, [enabled, card, load]);

  return { enabled, card, loaded, reload };
}
