import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { fetchSuggestedUsers, type SuggestedUser } from '@/lib/suggested-users-service';

export function useSuggestedUsers() {
  const { user } = useAuth();

  const {
    data: suggestions,
    isLoading,
    error,
  } = useQuery<SuggestedUser[]>({
    queryKey: ['suggestedUsers', user?.id],
    queryFn: fetchSuggestedUsers,
    enabled: !!user,
    staleTime: 10 * 60 * 1000,     // 10 minutes
    gcTime: 30 * 60 * 1000,        // 30 minutes
    refetchOnMount: false,
  });

  return {
    suggestions: suggestions ?? [],
    isLoading,
    error: error as Error | null,
  };
}
