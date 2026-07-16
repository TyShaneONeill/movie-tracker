import type { TMDBMovie } from '@/lib/tmdb.types';

// ============================================================================
// Parsed payload (parser.ts output)
// ============================================================================

/** A single watched episode, addressed by TheTVDB episode id + season/episode. */
export interface ParsedEpisode {
  /** TheTVDB episode id (the app resolves episodes by season/episode number, but
   *  we keep the TVDB id for provenance / dedupe). */
  tvdbEpisodeId: number;
  season: number;
  episode: number;
  /** Watch-mark timestamp, e.g. `2026-07-14 23:47:37`. Null when TV Time omitted it. */
  watchedAt: string | null;
}

/** A followed / partially-watched show from the TV Time export. */
export interface ParsedShow {
  /** TheTVDB series id (`s_id` in the export). */
  tvdbId: number;
  name: string;
  followed: boolean;
  favorited: boolean;
  episodes: ParsedEpisode[];
}

/** A movie from the (older-format) movie records file. */
export interface ParsedMovie {
  title: string;
  /** `YYYY-MM-DD` (time component stripped). Null when absent. */
  releaseDate: string | null;
  status: 'watched' | 'watchlist';
  /** Watch timestamp for watched movies; null for watchlist entries. */
  watchedAt: string | null;
  rewatchCount: number;
}

/** Normalized output of {@link parseTvTimeExport}. */
export interface ParsedTvTimePayload {
  shows: ParsedShow[];
  movies: ParsedMovie[];
  /** Non-fatal issues (malformed rows skipped, etc.). Never throws on a bad row. */
  warnings: string[];
}

/** Filename → raw CSV content. The UI layer unzips; this layer stays pure. */
export type TvTimeFileMap = Record<string, string>;

// ============================================================================
// Matcher (matcher.ts output)
// ============================================================================

/** Result of resolving a TVDB id to TMDB. `id`/`name` are always present; the
 *  rest is best-effort metadata (from the extended find-by-external-id fn) used
 *  to populate the show row so imported shows render posters + contribute to
 *  stats like organic ones. All optional for backward compat. */
export interface TmdbShowLookup {
  id: number;
  name: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  firstAirDate?: string | null;
  voteAverage?: number | null;
  overview?: string | null;
}

/** A show successfully mapped to a TMDB tv id, carried with the metadata needed
 *  to render it (posters, stats) — parity with an organically-tracked show.
 *  Metadata fields are optional: a lookup that returns only id+name still
 *  imports (poster just stays null, as before). */
export interface MatchedShow extends ParsedShow {
  tmdbId: number;
  tmdbName: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  genreIds?: number[];
  firstAirDate?: string | null;
  voteAverage?: number | null;
  overview?: string | null;
  numberOfEpisodes?: number | null;
  numberOfSeasons?: number | null;
}

/** A movie confidently mapped to a TMDB movie. */
export interface MatchedMovie extends ParsedMovie {
  tmdbId: number;
  tmdbMovie: TMDBMovie;
}

/** A movie that needs human disambiguation, carried with its TMDB candidates. */
export interface MovieNeedsReview extends ParsedMovie {
  candidates: TMDBMovie[];
}

export interface ShowMatchResult {
  matched: MatchedShow[];
  unmatched: ParsedShow[];
}

export interface MovieMatchResult {
  matched: MatchedMovie[];
  needsReview: MovieNeedsReview[];
  unmatched: ParsedMovie[];
}

export interface TvTimeMatchResult {
  shows: ShowMatchResult;
  movies: MovieMatchResult;
  warnings: string[];
}

/**
 * TMDB access surface the matcher depends on. Injected so the core stays pure
 * and unit-testable (tests pass a mock). The default implementation
 * ({@link createDefaultTmdbGateway}) is backed by the existing Supabase edge
 * functions — the same `supabase.functions.invoke` pattern the rest of the app
 * uses, not a new HTTP client.
 */
export interface TmdbGateway {
  /**
   * Resolve a TheTVDB series id to a TMDB tv id via TMDB's
   * `/find/{id}?external_source=tvdb_id`. Returns null when TMDB has no mapping.
   */
  findTvByTvdbId(tvdbId: number): Promise<TmdbShowLookup | null>;
  /** Search TMDB movies by title, optionally biased by release year. */
  searchMovie(title: string, year: number | null): Promise<TMDBMovie[]>;
  /**
   * Best-effort episode/season counts for a matched show (TMDB tv-details).
   * OPTIONAL on the interface so existing test mocks and the pure matcher stay
   * valid; `/find` doesn't carry these, so they need a details lookup. A null
   * result (or an absent method) simply leaves the counts null.
   */
  getShowEpisodeCounts?(
    tmdbId: number
  ): Promise<{ numberOfEpisodes: number | null; numberOfSeasons: number | null } | null>;
}

export interface MatchOptions {
  /** Max in-flight TMDB requests. Default 5. */
  concurrency?: number;
}
