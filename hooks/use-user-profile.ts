import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, UserMovie, FirstTake } from '@/lib/database.types';

const FIVE_MINUTES = 5 * 60 * 1000;

type ActiveTab = 'collection' | 'first-takes' | 'watchlist';

/**
 * Fetch another user's profile from Supabase
 */
async function fetchOtherUserProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // Profile might not exist (returns PGRST116 error code)
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Fetch counts for all tabs in a single parallel batch (HEAD queries, no data transferred)
 */
async function fetchOtherUserCounts(userId: string) {
  const [watchedResult, firstTakesResult, watchlistResult] = await Promise.all([
    supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'watched'),
    supabase
      .from('first_takes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .like('quote_text', '_%'),
    supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'watchlist'),
  ]);

  return {
    watched: watchedResult.count ?? 0,
    firstTakes: firstTakesResult.count ?? 0,
    watchlist: watchlistResult.count ?? 0,
  };
}

/**
 * Fetch another user's movies by status
 */
async function fetchOtherUserMovies(
  userId: string,
  status: 'watched' | 'watchlist'
): Promise<UserMovie[]> {
  const { data, error } = await (supabase.from('user_movies') as any)
    .select('*')
    .eq('user_id', userId)
    .eq('status', status)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as UserMovie[];
}

/**
 * Fetch another user's First Takes
 */
async function fetchOtherUserFirstTakes(userId: string): Promise<FirstTake[]> {
  const { data, error } = await (supabase.from('first_takes') as any)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as FirstTake[];
}

export interface UseUserProfileResult {
  profile: Profile | null;
  watchedMovies: UserMovie[];
  firstTakes: FirstTake[];
  watchlist: UserMovie[];
  isLoading: boolean;
  isError: boolean;
  stats: {
    watched: number;
    firstTakes: number;
    watchlist: number;
  };
}

/**
 * Hook to fetch another user's profile data (READ-ONLY)
 *
 * Lazy-loads tab data: only the active tab's full dataset is fetched.
 * Tab counts are fetched eagerly via lightweight HEAD queries for the tab bar.
 * Once fetched, data stays cached across tab switches via React Query.
 */
export function useUserProfile(userId: string, activeTab: ActiveTab = 'collection'): UseUserProfileResult {
  // Always fetch profile
  const profileQuery = useQuery({
    queryKey: ['otherUserProfile', userId],
    queryFn: () => fetchOtherUserProfile(userId),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  // Always fetch lightweight counts for tab bar stats
  const countsQuery = useQuery({
    queryKey: ['otherUserCounts', userId],
    queryFn: () => fetchOtherUserCounts(userId),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  // Lazy-load: only fetch full data for the active tab
  const watchedMoviesQuery = useQuery({
    queryKey: ['otherUserMovies', userId, 'watched'],
    queryFn: () => fetchOtherUserMovies(userId, 'watched'),
    enabled: !!userId && activeTab === 'collection',
    staleTime: FIVE_MINUTES,
  });

  const firstTakesQuery = useQuery({
    queryKey: ['otherUserFirstTakes', userId],
    queryFn: () => fetchOtherUserFirstTakes(userId),
    enabled: !!userId && activeTab === 'first-takes',
    staleTime: FIVE_MINUTES,
  });

  const watchlistQuery = useQuery({
    queryKey: ['otherUserMovies', userId, 'watchlist'],
    queryFn: () => fetchOtherUserMovies(userId, 'watchlist'),
    enabled: !!userId && activeTab === 'watchlist',
    staleTime: FIVE_MINUTES,
  });

  const watchedMovies = watchedMoviesQuery.data ?? [];
  const firstTakes = firstTakesQuery.data ?? [];
  const watchlist = watchlistQuery.data ?? [];
  const counts = countsQuery.data ?? { watched: 0, firstTakes: 0, watchlist: 0 };

  return {
    profile: profileQuery.data ?? null,
    watchedMovies,
    firstTakes,
    watchlist,
    isLoading: profileQuery.isLoading || countsQuery.isLoading,
    isError: profileQuery.isError || countsQuery.isError,
    stats: counts,
  };
}
