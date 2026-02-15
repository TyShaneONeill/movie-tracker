import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchAchievements,
  fetchAchievementLevels,
  fetchUserAchievements,
  checkAchievements,
  computeAchievementProgress,
} from '@/lib/achievement-service';
import type {
  AwardedAchievementLevel,
  UserAchievementWithLevel,
  AchievementProgress,
} from '@/lib/achievement-service';
import type { Achievement, AchievementLevel } from '@/lib/database.types';

export function useAchievements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: fetchAchievements,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const levelsQuery = useQuery({
    queryKey: ['achievementLevels'],
    queryFn: fetchAchievementLevels,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const userAchievementsQuery = useQuery({
    queryKey: ['userAchievements', user?.id],
    queryFn: () => fetchUserAchievements(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const progress = useMemo(() => {
    if (!achievementsQuery.data || !levelsQuery.data) return [];
    return computeAchievementProgress(
      achievementsQuery.data,
      levelsQuery.data,
      userAchievementsQuery.data ?? []
    );
  }, [achievementsQuery.data, levelsQuery.data, userAchievementsQuery.data]);

  const triggerCheck = async (): Promise<AwardedAchievementLevel[]> => {
    const newlyAwarded = await checkAchievements();
    if (newlyAwarded.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['userAchievements', user?.id] });
    }
    return newlyAwarded;
  };

  return {
    achievements: achievementsQuery.data ?? ([] as Achievement[]),
    levels: levelsQuery.data ?? ([] as AchievementLevel[]),
    userAchievements: userAchievementsQuery.data ?? ([] as UserAchievementWithLevel[]),
    progress,
    isLoading: achievementsQuery.isLoading || levelsQuery.isLoading || userAchievementsQuery.isLoading,
    triggerCheck,
    refetch: () => {
      achievementsQuery.refetch();
      levelsQuery.refetch();
      userAchievementsQuery.refetch();
    },
  };
}
