import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

// Whether the user has ever completed a TV Time import — derived from DATA
// (rows tagged source='tvtime_import'), NOT a state column. Drives the Settings
// demotion (pinned section disappears after the first import) and the home
// banner return policy (never shown once imported). Cached; invalidate after a
// successful import so both surfaces update without a restart.
export const HAS_TVTIME_IMPORT_KEY = 'tvtime-has-import';

async function checkHasImport(userId: string): Promise<boolean> {
  // Cover both shapes an import can take: a movies-only import writes
  // user_movies; a shows import writes user_episode_watches. Both are tagged
  // source='tvtime_import'. HEAD + exact count avoids fetching any rows.
  const [movies, episodes] = await Promise.all([
    supabase
      .from('user_movies')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'tvtime_import'),
    supabase
      .from('user_episode_watches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'tvtime_import'),
  ]);
  return (movies.count ?? 0) > 0 || (episodes.count ?? 0) > 0;
}

export function useHasTvTimeImport(): { hasImport: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [HAS_TVTIME_IMPORT_KEY, user?.id],
    queryFn: () => checkHasImport(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // rarely changes; refetched on import via invalidation
  });
  return { hasImport: data ?? false, isLoading };
}

/** Invalidate the derived import-existence check (call after a successful import). */
export function invalidateHasTvTimeImport(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: [HAS_TVTIME_IMPORT_KEY] });
}
