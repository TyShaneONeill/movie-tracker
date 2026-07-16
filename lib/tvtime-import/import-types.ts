// Client <-> `import-tvtime` edge function contract (PR 3).
//
// These types mirror the payload the edge function validates and the counts it
// returns (supabase/functions/import-tvtime, PR #683). They are intentionally a
// SEPARATE, narrower shape from the matcher output in `types.ts`: the edge fn
// keys shows by `tmdbShowId` + `name` (not the matcher's `tmdbId`/`tmdbName`),
// takes only season/episode/watchedAt per episode, and never sees TVDB ids.
// The mapping from matcher output to this contract lives in `import-client.ts`.

/** One watched episode, addressed by season/episode against the matched show. */
export interface ImportEpisode {
  season: number;
  episode: number;
  watchedAt: string | null;
}

/** A show to import, keyed to TMDB. `followed`/`favorited` are informational.
 *  Metadata fields are OPTIONAL (backward compat) — when present the edge fn
 *  persists them so the show renders a poster and feeds stats like an
 *  organically-tracked one. */
export interface ImportShow {
  tmdbShowId: number;
  name: string;
  followed: boolean;
  favorited: boolean;
  episodes: ImportEpisode[];
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  firstAirDate?: string | null;
  voteAverage?: number | null;
  numberOfEpisodes?: number | null;
  numberOfSeasons?: number | null;
}

/** A movie to import, keyed to TMDB. Metadata fields OPTIONAL (backward compat)
 *  — mirror what movie-service persists so imported movies render posters and
 *  contribute to stats. */
export interface ImportMovie {
  tmdbId: number;
  title: string;
  status: 'watched' | 'watchlist';
  watchedAt: string | null;
  rewatchCount: number;
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  voteAverage?: number | null;
  releaseDate?: string | null;
}

/** One chunk's request body. `importKey` is stable across the whole import so
 *  retried/re-sliced chunks stay idempotent server-side. */
export interface ImportPayload {
  importKey: string;
  shows: ImportShow[];
  movies: ImportMovie[];
}

/** The edge fn's 200 response — the numbers the done screen renders. */
export interface ImportCounts {
  showsUpserted: number;
  episodesInserted: number;
  episodesSkipped: number;
  episodesInvalid: number;
  moviesInserted: number;
  moviesUpdated: number;
  moviesSkipped: number;
  moviesInvalid: number;
}

/** Per-call aggregate ceilings the edge fn enforces (413 `chunk_too_large`).
 *  The client slices within these so a well-formed chunk never trips the guard. */
export const MAX_EPISODES_PER_CALL = 5000;
export const MAX_MOVIES_PER_CALL = 2000;

/** A zeroed counts accumulator. */
export function emptyImportCounts(): ImportCounts {
  return {
    showsUpserted: 0,
    episodesInserted: 0,
    episodesSkipped: 0,
    episodesInvalid: 0,
    moviesInserted: 0,
    moviesUpdated: 0,
    moviesSkipped: 0,
    moviesInvalid: 0,
  };
}

/** Sum two count objects (used to fold per-chunk results into a running total). */
export function addImportCounts(a: ImportCounts, b: ImportCounts): ImportCounts {
  return {
    showsUpserted: a.showsUpserted + b.showsUpserted,
    episodesInserted: a.episodesInserted + b.episodesInserted,
    episodesSkipped: a.episodesSkipped + b.episodesSkipped,
    episodesInvalid: a.episodesInvalid + b.episodesInvalid,
    moviesInserted: a.moviesInserted + b.moviesInserted,
    moviesUpdated: a.moviesUpdated + b.moviesUpdated,
    moviesSkipped: a.moviesSkipped + b.moviesSkipped,
    moviesInvalid: a.moviesInvalid + b.moviesInvalid,
  };
}
