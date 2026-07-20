import { useMemo } from 'react';
import { useSeasonEpisodes } from '@/hooks/use-season-episodes';
import { resolveNextUpEpisode, type EpisodeCoords } from '@/lib/episode-room-logic';
import type { TMDBEpisode } from '@/lib/tmdb.types';

const toAiredInfo = (episodes: TMDBEpisode[]) =>
  episodes.map((e) => ({ episodeNumber: e.episode_number, airDate: e.air_date }));

/**
 * Resolves the NEXT-UP episode after a show's last-watched coordinate
 * (`current_season`/`current_episode`), for the home Continue Watching card.
 * Returns null when the viewer is caught up OR the aired-episode catalog isn't
 * loaded yet — the card falls back to showing the last-watched coordinate in
 * both cases (never blank).
 *
 * Cheap by construction: the current season's episodes come from the same
 * react-query-cached `useSeasonEpisodes` the room and show screens already warm
 * (30-min staleTime). The next season is fetched ONLY at a season boundary —
 * i.e. once the current season is loaded and it has no episode after the
 * last-watched one — so a mid-season show costs a single cached season fetch.
 */
export function useNextEpisodeUp(
  tmdbId: number,
  currentSeason: number | null,
  currentEpisode: number | null,
  enabled = true
): EpisodeCoords | null {
  const today = new Date().toISOString().slice(0, 10);

  const canCompute =
    enabled &&
    tmdbId > 0 &&
    currentSeason != null &&
    currentEpisode != null &&
    currentSeason >= 1;

  const { episodes: currentEpisodes } = useSeasonEpisodes({
    showId: tmdbId,
    seasonNumber: currentSeason ?? 0,
    enabled: canCompute,
  });

  // The next season is only relevant once we're past the last episode this
  // season carries — gate its fetch on that so mid-season shows never pull it.
  const atSeasonBoundary =
    canCompute &&
    currentEpisodes.length > 0 &&
    !currentEpisodes.some((e) => e.episode_number === (currentEpisode ?? 0) + 1);

  const { episodes: nextEpisodes } = useSeasonEpisodes({
    showId: tmdbId,
    seasonNumber: (currentSeason ?? 0) + 1,
    enabled: atSeasonBoundary,
  });

  return useMemo(() => {
    if (!canCompute) return null;
    return resolveNextUpEpisode({
      season: currentSeason!,
      episode: currentEpisode!,
      currentSeasonEpisodes:
        currentEpisodes.length > 0 ? toAiredInfo(currentEpisodes) : null,
      nextSeasonEpisodes:
        atSeasonBoundary && nextEpisodes.length > 0 ? toAiredInfo(nextEpisodes) : null,
      today,
    });
  }, [canCompute, currentSeason, currentEpisode, currentEpisodes, atSeasonBoundary, nextEpisodes, today]);
}
