interface TMDBVideo {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TMDBVideosResponse {
  results: TMDBVideo[];
}

const TYPE_RANK: Record<string, number> = {
  Trailer: 0,
  Teaser: 1,
  Clip: 2,
};

/**
 * Picks a single best YouTube trailer key from a TMDB videos response,
 * or null if nothing qualifies.
 *
 * Heuristic (ranked):
 *   1. Filter to site === 'YouTube' (Vimeo / TMDB-hosted skipped)
 *   2. Filter to type ∈ {'Trailer', 'Teaser', 'Clip'} (skip Featurette, BTS, etc.)
 *   3. Sort by:
 *      - type rank (Trailer < Teaser < Clip)
 *      - official: true before false
 *      - published_at descending (most recent)
 *   4. Take the first
 */
export function selectBestTrailer(response: TMDBVideosResponse): string | null {
  const candidates = response.results.filter(
    (v) => v.site === 'YouTube' && v.type in TYPE_RANK
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ra = TYPE_RANK[a.type] ?? 999;
    const rb = TYPE_RANK[b.type] ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return b.published_at.localeCompare(a.published_at);
  });
  return candidates[0].key;
}
