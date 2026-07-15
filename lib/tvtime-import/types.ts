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

/** A show successfully mapped to a TMDB tv id. */
export interface MatchedShow extends ParsedShow {
  tmdbId: number;
  tmdbName: string;
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
  findTvByTvdbId(tvdbId: number): Promise<{ id: number; name: string } | null>;
  /** Search TMDB movies by title, optionally biased by release year. */
  searchMovie(title: string, year: number | null): Promise<TMDBMovie[]>;
}

export interface MatchOptions {
  /** Max in-flight TMDB requests. Default 5. */
  concurrency?: number;
}
