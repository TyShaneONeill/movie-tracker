import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { computeTasteInsights, type TasteInsights, type UserMovieRow } from '@/lib/taste-profile';

/**
 * Data hook for the Taste Profile deep-dive (vault PS-22, screen 3/4).
 *
 * NAMED `useTasteInsights` (not `useTasteProfile`) — an unrelated, already-
 * shipped hook of that name already exists (`hooks/use-taste-profile.ts`,
 * Release Calendar personalization, PR #214). See the naming note atop
 * `lib/taste-profile.ts`.
 *
 * Two fetches, run in parallel, mirroring `hooks/use-rating-personality.ts`:
 *   1. The user's own WATCHED movies (`user_movies`) — a normal RLS read of
 *      the caller's rows. Feeds the instant, no-network decade/genre/picks
 *      computed by `computeTasteInsights`.
 *   2. The cached AI row (`taste_profile_cache`) — top directors, top
 *      studio, and the "read" text, written by the `generate-taste-summary`
 *      edge function. `.maybeSingle()` because a brand-new user has no row yet.
 *
 * Staleness (no cache row, or 10+ more movies logged since the cache was
 * generated — see `computeStaleness` in lib/taste-profile.ts) triggers ONE
 * automatic call to the edge function per mount, guarded by a ref so a slow
 * or failed regeneration never loops.
 */

interface GenerateTasteSummaryResponse {
  success: boolean;
  summary?: string;
  error?: string;
}

async function fetchTasteInsights(userId: string): Promise<TasteInsights> {
  const [moviesRes, cacheRes] = await Promise.all([
    supabase
      .from('user_movies')
      .select('tmdb_id, genre_ids, release_date')
      .eq('user_id', userId)
      .eq('status', 'watched'),
    supabase
      .from('taste_profile_cache')
      .select('summary, aggregates, logs_count_at_generation, generated_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (moviesRes.error) throw new Error(moviesRes.error.message);
  if (cacheRes.error) throw new Error(cacheRes.error.message);

  const movies: UserMovieRow[] = (moviesRes.data ?? []).map((row) => ({
    tmdbId: row.tmdb_id,
    genreIds: row.genre_ids,
    releaseDate: row.release_date,
  }));

  return computeTasteInsights(movies, cacheRes.data);
}

async function regenerateTasteSummary(accessToken: string): Promise<GenerateTasteSummaryResponse> {
  const { data, error } = await supabase.functions.invoke<GenerateTasteSummaryResponse>(
    'generate-taste-summary',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (error) {
    // Extract detailed error from FunctionsHttpError response (mirrors
    // hooks/use-generate-art.ts's handling of the same supabase-js shape).
    const fnErrorAny = error as any;
    const httpStatus = fnErrorAny.status || fnErrorAny.context?.status;

    let errorBody: any = null;
    try {
      if (typeof fnErrorAny.context?.json === 'function') {
        errorBody = await fnErrorAny.context.json();
      } else if (typeof fnErrorAny.context?.body === 'string') {
        errorBody = JSON.parse(fnErrorAny.context.body);
      } else if (fnErrorAny.data) {
        errorBody = typeof fnErrorAny.data === 'string' ? JSON.parse(fnErrorAny.data) : fnErrorAny.data;
      }
    } catch {
      // body parsing failed — fall through to the generic message below
    }

    if (httpStatus === 429) {
      throw new Error("You've used today's regenerations — try again tomorrow.");
    }

    throw new Error(errorBody?.error || error.message || 'Failed to regenerate your taste profile');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to regenerate your taste profile');
  }

  return data;
}

export function useTasteInsights() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasAutoRegenerated = useRef(false);

  const query = useQuery({
    queryKey: ['tasteInsights', user?.id],
    queryFn: () => fetchTasteInsights(user!.id),
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes — mirrors use-rating-personality.ts
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
  });

  const regenerate = useMutation({
    mutationKey: ['tasteInsightsRegenerate', user?.id],
    mutationFn: async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error('Not authenticated');
      }
      return regenerateTasteSummary(sessionData.session.access_token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasteInsights', user?.id] });
    },
  });

  const { isPending: isRegenerating, mutate: triggerRegenerate } = regenerate;

  // Invalidation = staleness check, client-side trigger (per PS-22 brief):
  // once loaded, if the profile is stale, auto-call the edge fn ONCE per
  // mount — guarded by a ref so a slow/failed regeneration never loops.
  useEffect(() => {
    if (!query.data?.stale || hasAutoRegenerated.current || isRegenerating) return;
    hasAutoRegenerated.current = true;
    triggerRegenerate();
  }, [query.data?.stale, isRegenerating, triggerRegenerate]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    regenerate: triggerRegenerate,
    isRegenerating,
    regenerateError: regenerate.error,
  };
}
