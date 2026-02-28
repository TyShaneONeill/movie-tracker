import { useMemo } from 'react';
import { useUserTvShows } from '@/hooks/use-user-tv-shows';
import { useAuth } from '@/hooks/use-auth';

export function useContinueWatching() {
  const { user } = useAuth();
  const { shows: rawShows, isLoading, refetch } = useUserTvShows('watching');

  const shows = useMemo(() => {
    if (!user || rawShows.length === 0) return [];
    return [...rawShows]
      .sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [rawShows, user]);

  return { shows, isLoading, refetch };
}
