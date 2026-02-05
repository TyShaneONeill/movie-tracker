import { useQuery } from '@tanstack/react-query';
import { getFollowers } from '@/lib/follow-service';
import type { Profile } from '@/lib/database.types';

export function useFollowers(userId: string) {
  const { data, isLoading, isError, error } = useQuery<Profile[], Error>({
    queryKey: ['followers', userId],
    queryFn: () => getFollowers(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    followers: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
