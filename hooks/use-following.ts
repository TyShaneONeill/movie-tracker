import { useQuery } from '@tanstack/react-query';
import { getFollowing } from '@/lib/follow-service';
import type { Profile } from '@/lib/database.types';

export function useFollowing(userId: string) {
  const { data, isLoading, isError, error } = useQuery<Profile[], Error>({
    queryKey: ['following', userId],
    queryFn: () => getFollowing(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    following: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
