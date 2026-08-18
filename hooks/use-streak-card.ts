/**
 * Loads the user's streak card for whichever surface needs it (the Stats entry
 * cell and the streak screen), refetching whenever an activity is recorded.
 *
 * Fails closed on `streak_spine`: while the flag is off nothing is fetched and
 * `card` stays null, so a gated caller renders its pre-streak fallback.
 */

import { useCallback, useEffect, useState } from 'react';

import { useStreakSpineEnabled } from '@/hooks/use-feature-flag';
import { useStreak } from '@/lib/streak-context';
import { getStreakCard, type StreakCard } from '@/lib/streak-service';

export function useStreakCard(): { enabled: boolean; card: StreakCard | null; loaded: boolean } {
  const enabled = useStreakSpineEnabled();
  const { streakVersion } = useStreak();
  const [card, setCard] = useState<StreakCard | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const data = await getStreakCard();
    setCard(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load, streakVersion]);

  return { enabled, card, loaded };
}
