import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchAchievements,
  fetchUserAchievements,
  checkAchievements,
} from '@/lib/achievement-service';
import type {
  AwardedAchievement,
  UserAchievementWithDetails,
} from '@/lib/achievement-service';
import type { Achievement } from '@/lib/database.types';

export function useAchievements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // All achievement definitions
  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: fetchAchievements,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (static data)
  });

  // User's earned achievements
  const userAchievementsQuery = useQuery({
    queryKey: ['userAchievements', user?.id],
    queryFn: () => fetchUserAchievements(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Trigger achievement check and return newly awarded
  const triggerCheck = async (): Promise<AwardedAchievement[]> => {
    const newlyAwarded = await checkAchievements();
    if (newlyAwarded.length > 0) {
      // Invalidate to refresh the list
      queryClient.invalidateQueries({ queryKey: ['userAchievements', user?.id] });
    }
    return newlyAwarded;
  };

  return {
    achievements: achievementsQuery.data ?? ([] as Achievement[]),
    userAchievements: userAchievementsQuery.data ?? ([] as UserAchievementWithDetails[]),
    isLoading: achievementsQuery.isLoading || userAchievementsQuery.isLoading,
    triggerCheck,
    refetch: () => {
      achievementsQuery.refetch();
      userAchievementsQuery.refetch();
    },
  };
}
