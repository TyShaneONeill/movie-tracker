import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { checkAchievements } from './achievement-service';
import { AchievementCelebration } from '@/components/achievement-celebration';

interface CelebrationData {
  icon: string;
  name: string;
  description: string;
  level: number;
}

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
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const queryClient = useQueryClient();

  const triggerAchievementCheck = useCallback(() => {
    checkAchievements()
      .then((newlyAwarded) => {
        if (newlyAwarded.length > 0) {
          const first = newlyAwarded[0];
          setCelebrationData({
            icon: first.achievement.icon,
            name: first.achievement.name,
            description: first.level_description,
            level: first.level,
          });
          setShowCelebration(true);
          queryClient.invalidateQueries({ queryKey: ['userAchievements'] });
        }
      })
      .catch(() => {});
  }, [queryClient]);

  return (
    <AchievementContext.Provider value={{ triggerAchievementCheck }}>
      {children}
      <AchievementCelebration
        achievement={celebrationData}
        visible={showCelebration}
        onDismiss={() => setShowCelebration(false)}
      />
    </AchievementContext.Provider>
  );
}
