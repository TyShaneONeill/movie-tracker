import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { computeBlindSpots, CANON_FILMS, type BlindSpots, type UserMovie } from '@/lib/blind-spots';

/**
 * Data hook for the Blind Spots deep-dive (vault PS-22).
 *
 * Fetches the user's own WATCHED movies from `user_movies` (a normal RLS
 * read of the caller's rows, mirroring `hooks/use-rating-personality.ts`)
 * and hands them + the baked canon (`lib/blind-spots-canon.json`) to the
 * pure `computeBlindSpots` — see `lib/blind-spots.ts`. No RPC, no new
 * migration: everything derives client-side from the user's library and the
 * curated canon.
 */

async function fetchBlindSpots(userId: string): Promise<BlindSpots> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('tmdb_id, genre_ids')
    .eq('user_id', userId)
    .eq('status', 'watched');

  if (error) throw new Error(error.message);

  const userMovies: UserMovie[] = (data ?? []).map((row) => ({
    tmdbId: row.tmdb_id,
    genreIds: row.genre_ids,
  }));

  return computeBlindSpots(userMovies, CANON_FILMS);
}

export function useBlindSpots() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blindSpots', user?.id],
    queryFn: () => fetchBlindSpots(user!.id),
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes — the canon is static, only the user's own library moves
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
  });
}
