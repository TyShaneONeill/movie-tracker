import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import {
  computeRatingPersonality,
  normalizeCommunityPayload,
  type RatingPersonality,
  type UserRating,
} from '@/lib/rating-personality';

/**
 * Data hook for the Rating Personality deep-dive (vault PS-22).
 *
 * Two fetches, run in parallel:
 *   1. The user's OWN movie ratings (`first_takes`, rating not null,
 *      media_type != 'tv_show') — a normal RLS read of the caller's rows.
 *   2. The `get_rating_personality` RPC for the community aggregates (global
 *      average + distribution + per-title consensus for titles with >= 2
 *      raters). The RPC is SECURITY DEFINER and binds to auth.uid().
 *
 * The pure `computeRatingPersonality` module turns the two into the view model
 * (verdict, deltas, histograms, divergence rows) — see `lib/rating-personality.ts`.
 */

async function fetchRatingPersonality(userId: string): Promise<RatingPersonality> {
  const [ownRes, rpcRes] = await Promise.all([
    supabase
      .from('first_takes')
      .select('rating, tmdb_id, movie_title, poster_path')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .neq('media_type', 'tv_show')
      .order('created_at', { ascending: false }),
    supabase.rpc('get_rating_personality', { p_user_id: userId }),
  ]);

  if (ownRes.error) throw new Error(ownRes.error.message);
  if (rpcRes.error) throw new Error(rpcRes.error.message);

  const ratings: UserRating[] = (ownRes.data ?? [])
    .filter((row) => row.rating != null)
    .map((row) => ({
      rating: row.rating as number,
      tmdbId: row.tmdb_id,
      title: row.movie_title,
      posterPath: row.poster_path,
      year: null, // first_takes carries no release year; diverge rows omit it
    }));

  const community = normalizeCommunityPayload(rpcRes.data);
  return computeRatingPersonality(ratings, community);
}

export function useRatingPersonality() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ratingPersonality', user?.id],
    queryFn: () => fetchRatingPersonality(user!.id),
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes — community aggregates move slowly
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
  });
}
