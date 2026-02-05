import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, UserMovie, FirstTake } from '@/lib/database.types';

const FIVE_MINUTES = 5 * 60 * 1000;

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
 * Fetches:
 * - Profile data
 * - Watched movies (user_movies where status='watched')
 * - First Takes
 * - Watchlist (user_movies where status='watchlist')
 */
export function useUserProfile(userId: string): UseUserProfileResult {
  // Fetch profile
  const profileQuery = useQuery({
    queryKey: ['otherUserProfile', userId],
    queryFn: () => fetchOtherUserProfile(userId),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  // Fetch watched movies
  const watchedMoviesQuery = useQuery({
    queryKey: ['otherUserMovies', userId, 'watched'],
    queryFn: () => fetchOtherUserMovies(userId, 'watched'),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  // Fetch First Takes
  const firstTakesQuery = useQuery({
    queryKey: ['otherUserFirstTakes', userId],
    queryFn: () => fetchOtherUserFirstTakes(userId),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  // Fetch watchlist
  const watchlistQuery = useQuery({
    queryKey: ['otherUserMovies', userId, 'watchlist'],
    queryFn: () => fetchOtherUserMovies(userId, 'watchlist'),
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });

  const watchedMovies = watchedMoviesQuery.data ?? [];
  const firstTakes = firstTakesQuery.data ?? [];
  const watchlist = watchlistQuery.data ?? [];

  return {
    profile: profileQuery.data ?? null,
    watchedMovies,
    firstTakes,
    watchlist,
    isLoading:
      profileQuery.isLoading ||
      watchedMoviesQuery.isLoading ||
      firstTakesQuery.isLoading ||
      watchlistQuery.isLoading,
    isError:
      profileQuery.isError ||
      watchedMoviesQuery.isError ||
      firstTakesQuery.isError ||
      watchlistQuery.isError,
    stats: {
      watched: watchedMovies.length,
      firstTakes: firstTakes.length,
      watchlist: watchlist.length,
    },
  };
}
