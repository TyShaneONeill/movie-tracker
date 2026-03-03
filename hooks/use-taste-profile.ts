import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { computeTasteProfile } from '@/lib/taste-profile-service';
import type { TasteProfile } from '@/lib/taste-profile-service';

/**
 * Hook to compute and cache the user's taste profile.
 * Recalculates at most once per hour (staleTime).
 */
export function useTasteProfile() {
  const { user } = useAuth();

  return useQuery<TasteProfile>({
    queryKey: ['taste-profile', user?.id],
    queryFn: () => computeTasteProfile(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // 1 hour - profile doesn't change frequently
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
  });
}
