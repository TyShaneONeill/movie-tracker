// Pure metadata-whitelist builders, shared by the import-tvtime edge fn and the
// Jest boundary test. Self-contained (no Deno/npm imports) so both runtimes can
// import it.
//
// SAFETY INVARIANT: these builders emit ONLY poster/genre/date-style metadata
// columns. They can NEVER emit `status`, `watched_at`, or `source`. That is
// what makes the self-heal UPDATE path safe — backfilling a blank poster can
// never downgrade a watch, clear a timestamp, or relabel a row's origin.
//
// `overview` is deliberately NOT included: it's the largest field and feeds
// neither posters nor stats, so it's dropped end-to-end to avoid inflating the
// per-call byte size (which the count-based 413 reslice can't detect).

export interface MovieMetaInput {
  posterPath?: unknown;
  backdropPath?: unknown;
  genreIds?: unknown;
  voteAverage?: unknown;
  releaseDate?: unknown;
}

export interface ShowMetaInput {
  posterPath?: unknown;
  backdropPath?: unknown;
  genreIds?: unknown;
  firstAirDate?: unknown;
  voteAverage?: unknown;
  numberOfEpisodes?: unknown;
  numberOfSeasons?: unknown;
}

/** A non-empty trimmed string, or null. */
export function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

/** A finite number, or null. */
export function sanitizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** An array of finite integer genre ids (drops junk). Empty -> []. */
export function sanitizeGenreIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((g): g is number => typeof g === 'number' && Number.isInteger(g));
}

/** Persistable metadata subset for a movie row. Only defined keys are returned
 *  so an absent field never nulls an existing value on the self-heal path. */
export function movieMetadata(movie: MovieMetaInput | null | undefined): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const poster = sanitizeString(movie?.posterPath);
  const backdrop = sanitizeString(movie?.backdropPath);
  const releaseDate = sanitizeString(movie?.releaseDate);
  const vote = sanitizeNumber(movie?.voteAverage);
  if (poster !== null) meta.poster_path = poster;
  if (backdrop !== null) meta.backdrop_path = backdrop;
  if (releaseDate !== null) meta.release_date = releaseDate;
  if (vote !== null) meta.vote_average = vote;
  if (Array.isArray(movie?.genreIds) && movie.genreIds.length > 0) {
    meta.genre_ids = sanitizeGenreIds(movie.genreIds);
  }
  return meta;
}

/** Persistable metadata subset for a show row (see {@link movieMetadata}). */
export function showMetadata(show: ShowMetaInput | null | undefined): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const poster = sanitizeString(show?.posterPath);
  const backdrop = sanitizeString(show?.backdropPath);
  const firstAir = sanitizeString(show?.firstAirDate);
  const vote = sanitizeNumber(show?.voteAverage);
  const numEps = sanitizeNumber(show?.numberOfEpisodes);
  const numSeasons = sanitizeNumber(show?.numberOfSeasons);
  if (poster !== null) meta.poster_path = poster;
  if (backdrop !== null) meta.backdrop_path = backdrop;
  if (firstAir !== null) meta.first_air_date = firstAir;
  if (vote !== null) meta.vote_average = vote;
  if (numEps !== null) meta.number_of_episodes = numEps;
  if (numSeasons !== null) meta.number_of_seasons = numSeasons;
  if (Array.isArray(show?.genreIds) && show.genreIds.length > 0) {
    meta.genre_ids = sanitizeGenreIds(show.genreIds);
  }
  return meta;
}
