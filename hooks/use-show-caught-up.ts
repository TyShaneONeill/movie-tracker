import { useQuery } from '@tanstack/react-query';
import { getAiredEpisodeCount } from '@/lib/tv-show-service';

/**
 * "Caught Up" — a Returning Series where every episode that has aired so far
 * has been watched. Distinct from status='watched', which only ever applies
 * to Ended/Canceled shows (see check_and_flip_show_completion) — a Returning
 * Series must never flip to Watched, since a new episode airing would then
 * bounce it back to Watching and read as losing a badge.
 *
 * Deliberately DERIVED at read time rather than stored as a status value: a
 * derived value can't go stale when a new episode airs (it just reverts to
 * "Watching" on its own) — a stored enum would need an explicit un-flip
 * write path on top of the completion-flip one. See PS-xx N2 report 07-26.
 *
 * Known limitation: aired-count comes from the shared tv_show_episodes
 * catalog, which is populated lazily per-season (whenever any user fetches
 * that season) — the same source the season accordion's aired-filter and the
 * mark_episode_watched RPC guard already rely on. A season nobody has ever
 * fetched won't be counted, which could under-count the aired total (and
 * therefore over-report Caught Up) for an obscure show. Consistent with the
 * rest of the app's existing aired-detection model, not a new risk.
 */
export function useShowCaughtUp(params: {
  tmdbShowId: number;
  /** The show's own status pill — only 'watching' is eligible for Caught Up. */
  currentStatus: string | null;
  /** Live TMDB status text ('Returning Series' | 'Ended' | 'Canceled' | ...). */
  tmdbStatus: string | null | undefined;
  /** The user's total watched-episode count for this show (series-wide). */
  episodesWatched: number | null | undefined;
}): boolean {
  const { tmdbShowId, currentStatus, tmdbStatus, episodesWatched } = params;

  const eligible =
    currentStatus === 'watching' &&
    tmdbShowId > 0 &&
    tmdbStatus != null &&
    tmdbStatus !== 'Ended' &&
    tmdbStatus !== 'Canceled';

  const { data: airedEpisodeCount } = useQuery({
    queryKey: ['airedEpisodeCount', tmdbShowId],
    queryFn: () => getAiredEpisodeCount(tmdbShowId),
    enabled: eligible,
    // Aired count only ever grows (new episodes airing), so a stale read
    // just means a brand-new episode isn't reflected for up to an hour —
    // acceptable for a display-only badge, same order of magnitude as the
    // metadata-refresh staleness window in lib/metadata-refresh.ts.
    staleTime: 60 * 60 * 1000,
  });

  if (!eligible || typeof airedEpisodeCount !== 'number' || airedEpisodeCount <= 0) {
    return false;
  }

  return (episodesWatched ?? 0) >= airedEpisodeCount;
}
