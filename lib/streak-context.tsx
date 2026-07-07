import React, { createContext, useContext, useState, useCallback } from 'react';
import { AchievementCelebration } from '@/components/achievement-celebration';
import { useDailyHooksEnabled } from '@/hooks/use-feature-flag';
import { recordUserActivity, type StreakAction } from './streak-service';

/**
 * Streak context (PS-15 PR 3). Exposes a single imperative `recordActivity`
 * that qualifying-action handlers call in their mutation onSuccess (mirroring
 * triggerFirstWinCheck in notification-priming-context). On a milestone
 * (3/7/30/100) it pops the existing AchievementCelebration — no new
 * celebration UI. `streakVersion` bumps after every recorded action so the
 * profile punch card can refetch without a manual refresh.
 *
 * Gated on daily_hooks: when off, recordActivity is a no-op and nothing is
 * written or shown.
 */

interface MilestoneCelebration {
  icon: string;
  name: string;
  description: string;
  level?: number;
}

interface StreakContextValue {
  recordActivity: (action: StreakAction) => void;
  streakVersion: number;
}

const StreakContext = createContext<StreakContextValue>({
  recordActivity: () => {},
  streakVersion: 0,
});

export function useStreak() {
  return useContext(StreakContext);
}

// DRAFT copy — cinephile-dry, Content Queue review pending (PS-15 PR 3).
const MILESTONE_COPY: Record<number, { icon: string; description: string }> = {
  3: { icon: '🎟️', description: 'Three days in a row. The habit is forming.' },
  7: { icon: '🎫', description: 'A full week at the movies. Nicely done.' },
  30: { icon: '🏆', description: 'Thirty straight days. That is a season pass.' },
  100: { icon: '👑', description: 'One hundred days. You live here now.' },
};

function milestoneCelebration(milestone: number): MilestoneCelebration {
  const copy = MILESTONE_COPY[milestone] ?? {
    icon: '🔥',
    description: 'Streak milestone reached.',
  };
  return {
    icon: copy.icon,
    name: `${milestone}-Day Streak`,
    description: copy.description,
    level: 1,
  };
}

export function StreakProvider({ children }: { children: React.ReactNode }) {
  const dailyHooksEnabled = useDailyHooksEnabled();
  const [celebration, setCelebration] = useState<MilestoneCelebration | null>(null);
  const [streakVersion, setStreakVersion] = useState(0);

  const recordActivity = useCallback(
    (action: StreakAction) => {
      // Gate before the write — nothing is recorded while daily_hooks is dark.
      if (!dailyHooksEnabled) return;
      recordUserActivity(action)
        .then((result) => {
          if (!result) return;
          setStreakVersion((v) => v + 1);
          if (result.milestone) {
            setCelebration(milestoneCelebration(result.milestone));
          }
        })
        .catch(() => {});
    },
    [dailyHooksEnabled]
  );

  return (
    <StreakContext.Provider value={{ recordActivity, streakVersion }}>
      {children}
      <AchievementCelebration
        achievement={celebration}
        visible={celebration !== null}
        onDismiss={() => setCelebration(null)}
      />
    </StreakContext.Provider>
  );
}
