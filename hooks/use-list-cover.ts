import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getMovieDetails } from '@/lib/movie-service';
import { getTvShowDetails } from '@/lib/tv-show-service';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { resolveCover, type CoverCandidate, type MediaKind } from '@/lib/lists-v2-logic';

/** Backdrop size for list heroes — 16:9 crop reads cinematic (contract D). */
const BACKDROP_SIZE = 'w780' as const;
/** Cap on detail fetches when resolving a smart-default cover for a custom list. */
const MAX_SMART_FETCH = 5;

export interface UseListCoverArgs {
  /** Inline-known candidates. System-list items carry a real backdropPath;
   *  custom-list items carry null (list_movies has no backdrop) and must fetch. */
  candidates: CoverCandidate[];
  /** User-chosen cover TMDB id, or null for the smart default. */
  chosenTmdbId: number | null;
  /** Media of the chosen title (needed to fetch it when not inline). */
  chosenMedia?: MediaKind;
  enabled?: boolean;
}

export interface UseListCoverResult {
  backdropUrl: string | null;
  resolving: boolean;
}

interface FetchTarget {
  tmdbId: number;
  media: MediaKind;
}

/**
 * Resolves the list-hero BACKDROP url (contract C): chosen cover > smart default
 * (most popular title WITH a backdrop) > first with a backdrop > null (caller
 * shows the gradient placeholder — fail-safe, so merge+OTA can precede any
 * migration).
 *
 * Fast path: when a candidate already carries an inline backdrop (system lists),
 * no network fetch happens. Slow path: custom-list items have no inline
 * backdrop, so we fetch TMDB details for the chosen title, or for up to
 * `MAX_SMART_FETCH` candidates to find the most-popular-with-backdrop.
 */
export function useListCover({
  candidates,
  chosenTmdbId,
  chosenMedia,
  enabled = true,
}: UseListCoverArgs): UseListCoverResult {
  // 1. Try to resolve from what we already know (no fetch).
  const inline = useMemo(
    () => resolveCover(candidates, chosenTmdbId),
    [candidates, chosenTmdbId]
  );
  const inlineUrl = inline?.backdropPath ? getTMDBImageUrl(inline.backdropPath, BACKDROP_SIZE) : null;

  // 2. Decide what (if anything) to fetch. Disabled entirely once inline resolves.
  const needFetch = enabled && !inlineUrl;
  const targets = useMemo<FetchTarget[]>(() => {
    if (!needFetch) return [];
    if (chosenTmdbId != null) {
      const media =
        chosenMedia ?? candidates.find((c) => c.tmdbId === chosenTmdbId)?.media ?? 'movie';
      return [{ tmdbId: chosenTmdbId, media }];
    }
    return candidates.slice(0, MAX_SMART_FETCH).map((c) => ({ tmdbId: c.tmdbId, media: c.media }));
  }, [needFetch, chosenTmdbId, chosenMedia, candidates]);

  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: t.media === 'tv' ? ['tvShow', t.tmdbId] : ['movie', t.tmdbId],
      queryFn: () =>
        t.media === 'tv' ? getTvShowDetails(t.tmdbId) : getMovieDetails(t.tmdbId),
      enabled: needFetch && t.tmdbId > 0,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const fetching = needFetch && results.some((r) => r.isLoading);

  // 3. Rank the fetched details the same way (chosen > smart default).
  const fetchedUrl = useMemo(() => {
    if (!needFetch || fetching) return null;
    const fetchedCandidates: CoverCandidate[] = results
      .map((r, i) => {
        const data = r.data as
          | { movie?: { backdrop_path: string | null; vote_average: number } }
          | { show?: { backdrop_path: string | null; vote_average: number } }
          | undefined;
        const detail =
          (data as { movie?: { backdrop_path: string | null; vote_average: number } })?.movie ??
          (data as { show?: { backdrop_path: string | null; vote_average: number } })?.show;
        if (!detail) return null;
        return {
          tmdbId: targets[i].tmdbId,
          media: targets[i].media,
          backdropPath: detail.backdrop_path,
          score: detail.vote_average,
        } as CoverCandidate;
      })
      .filter((c): c is CoverCandidate => c !== null);

    const resolved = resolveCover(fetchedCandidates, chosenTmdbId);
    return resolved?.backdropPath ? getTMDBImageUrl(resolved.backdropPath, BACKDROP_SIZE) : null;
    // results identity changes each render; targets/chosenTmdbId gate the real inputs.
  }, [needFetch, fetching, results, targets, chosenTmdbId]);

  return {
    backdropUrl: inlineUrl ?? fetchedUrl,
    resolving: fetching,
  };
}
