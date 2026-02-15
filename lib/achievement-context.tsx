import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { checkAchievements } from './achievement-service';
import { AchievementCelebration } from '@/components/achievement-celebration';
import type { AwardedAchievement } from './achievement-service';

interface AchievementContextValue {
  triggerAchievementCheck: () => void;
}

const AchievementContext = createContext<AchievementContextValue>({
  triggerAchievementCheck: () => {},
});

export function useAchievementCheck() {
  return useContext(AchievementContext);
}

export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const [celebrationAchievement, setCelebrationAchievement] = useState<AwardedAchievement['achievement'] | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const queryClient = useQueryClient();

  const triggerAchievementCheck = useCallback(() => {
    // Fire-and-forget: don't block the caller
    checkAchievements()
      .then((newlyAwarded) => {
        if (newlyAwarded.length > 0) {
          setCelebrationAchievement(newlyAwarded[0].achievement);
          setShowCelebration(true);
          queryClient.invalidateQueries({ queryKey: ['userAchievements'] });
        }
      })
      .catch(() => {
        // Silently fail - achievement checking shouldn't break the app
      });
  }, [queryClient]);

  return (
    <AchievementContext.Provider value={{ triggerAchievementCheck }}>
      {children}
      <AchievementCelebration
        achievement={celebrationAchievement}
        visible={showCelebration}
        onDismiss={() => setShowCelebration(false)}
      />
    </AchievementContext.Provider>
  );
}
