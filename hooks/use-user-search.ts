import { useQuery } from '@tanstack/react-query';
import { searchUsers, type UserSearchResult } from '@/lib/user-service';
import { useAuth } from './use-auth';

interface UseUserSearchResult {
  users: UserSearchResult[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useUserSearch(query: string): UseUserSearchResult {
  const { user } = useAuth();
  const trimmedQuery = query.trim();

  const { data, isLoading, isError, error } = useQuery<UserSearchResult[], Error>({
    queryKey: ['userSearch', trimmedQuery],
    queryFn: () => searchUsers(trimmedQuery, user?.id),
    enabled: trimmedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    users: data ?? [],
    isLoading,
    isError,
    error: error ?? null,
  };
}
