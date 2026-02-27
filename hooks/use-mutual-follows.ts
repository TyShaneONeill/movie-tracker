import { useQuery } from '@tanstack/react-query';
import { getFollowers, getFollowing } from '@/lib/follow-service';
import type { Profile } from '@/lib/database.types';

async function fetchMutualFollows(userId: string): Promise<Profile[]> {
  const [followers, following] = await Promise.all([
    getFollowers(userId),
    getFollowing(userId),
  ]);

  const followerIds = new Set(followers.map((p) => p.id));
  return following.filter((p) => followerIds.has(p.id));
}

export function useMutualFollows(userId: string) {
  const { data, isLoading, isError, error } = useQuery<Profile[], Error>({
    queryKey: ['mutualFollows', userId],
    queryFn: () => fetchMutualFollows(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    mutualFollows: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
