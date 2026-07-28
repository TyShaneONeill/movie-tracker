import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
// Via hooks/use-auth, not lib/auth-context directly: the re-export is the seam
// tests mock, and importing the context module pulls expo-apple-authentication
// into any suite that renders a screen using this hook.
import { useAuth } from '@/hooks/use-auth';
import type { ShowCurrency } from '@/lib/show-currency-copy';

/**
 * "Am I current on this show, and when is the next episode?" — answered once for
 * every watching show in a single RPC.
 *
 * Deliberately ONE query for all shows rather than one per card: the Home rail
 * renders several Continue Watching cards at once, and a per-show hook would fan
 * out into N round trips on the app's first screen.
 *
 * The verdict itself is computed server-side by get_user_show_currency()
 * (20260728010000), which checks episode-by-episode against the catalog. The old
 * client hook compared counts (`episodesWatched >= airedCount`) and could
 * therefore report "caught up" while an aired episode sat unwatched — see that
 * migration's header. Nothing here re-derives the verdict; it only transports it.
 */
export function useShowCurrencyMap() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['showCurrency', user?.id],
    enabled: !!user?.id,
    // Currency changes when the user marks an episode (invalidated explicitly by
    // the mark/unmark paths) or when a new episode airs — daily at most. A short
    // window would re-run a multi-table join on every screen focus for a value
    // that cannot have moved.
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<Map<string, ShowCurrency>> => {
      const { data, error } = await supabase.rpc('get_user_show_currency');
      if (error) throw error;
      const map = new Map<string, ShowCurrency>();
      for (const row of (data ?? []) as ShowCurrency[]) {
        map.set(row.user_tv_show_id, row);
      }
      return map;
    },
  });
}

/**
 * Currency for one show, or null when unknown.
 *
 * Returns null — never a guess — while loading, on error, or for a show the RPC
 * did not rule on. Callers must render their normal state in that case: the
 * whole design rests on saying nothing when we are not certain.
 */
export function useShowCurrency(userTvShowId: string | null | undefined): ShowCurrency | null {
  const { data } = useShowCurrencyMap();
  if (!userTvShowId || !data) return null;
  return data.get(userTvShowId) ?? null;
}
