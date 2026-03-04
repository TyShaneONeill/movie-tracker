import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { fetchFriendsRatings, type FriendsRatingsResponse } from '@/lib/review-service';

export function useFriendsRatings(
  tmdbId: number,
  enabled: boolean = true
) {
  const { user } = useAuth();

  return useQuery<FriendsRatingsResponse, Error>({
    queryKey: ['friendsRatings', tmdbId],
    queryFn: () => fetchFriendsRatings(tmdbId),
    enabled: enabled && tmdbId > 0 && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}
