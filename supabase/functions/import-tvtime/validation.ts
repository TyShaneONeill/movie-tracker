// Pure payload-size guard — shared by the import-tvtime edge fn and its Jest
// boundary test. Self-contained (no Deno/npm imports) so both runtimes can load
// it.
//
// The client chunks within these ceilings, so a well-formed chunk never trips
// the guard. The SHOWS ceiling matters for follows-heavy migrants: thousands of
// followed 0-episode shows pass the episode ceiling (they carry no episodes) yet
// each still costs a lookup + insert, so an unbounded shows.length is an edge-fn
// wall-clock/timeout risk. Capping shows.length bounds that work per call.

export const MAX_TOTAL_EPISODES_PER_CALL = 5000;
export const MAX_TOTAL_MOVIES_PER_CALL = 2000;
export const MAX_TOTAL_SHOWS_PER_CALL = 500;

/** The 413 `chunk_too_large` body — the client reslices on `error` or a 413. */
export interface ChunkTooLargeBody {
  error: 'chunk_too_large';
  maxEpisodes: number;
  maxMovies: number;
  maxShows: number;
}

/** Total episodes across all shows (a missing/non-array `episodes` counts 0). */
export function countTotalEpisodes(shows: readonly { episodes?: unknown }[]): number {
  return shows.reduce(
    (sum, s) => sum + (Array.isArray(s?.episodes) ? s.episodes.length : 0),
    0,
  );
}

/**
 * Returns the 413 body when any per-call ceiling (shows, episodes, or movies) is
 * exceeded, else null. Kept as one place so the caps and the response shape
 * can't drift apart.
 */
export function checkPayloadSize(
  shows: readonly { episodes?: unknown }[],
  movies: readonly unknown[],
): ChunkTooLargeBody | null {
  const totalEpisodes = countTotalEpisodes(shows);
  if (
    shows.length > MAX_TOTAL_SHOWS_PER_CALL ||
    totalEpisodes > MAX_TOTAL_EPISODES_PER_CALL ||
    movies.length > MAX_TOTAL_MOVIES_PER_CALL
  ) {
    return {
      error: 'chunk_too_large',
      maxEpisodes: MAX_TOTAL_EPISODES_PER_CALL,
      maxMovies: MAX_TOTAL_MOVIES_PER_CALL,
      maxShows: MAX_TOTAL_SHOWS_PER_CALL,
    };
  }
  return null;
}
