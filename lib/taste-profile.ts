/**
 * Pure view-model logic for the Taste Profile deep-dive (vault PS-22, screen
 * 3/4). Dependency-free (no RN / supabase imports) so it is unit-testable in
 * isolation — the hook (`hooks/use-taste-insights.ts`) does the fetching and
 * hands the raw `user_movies` rows + the cached AI row here.
 *
 * Favorite decade and comfort genre are cheap (already stored on
 * `user_movies`) and computed here, client-side, for instant display — no
 * network round-trip, no staleness. Top director / top studio need TMDB
 * credits lookups the client doesn't have, so those + the AI "read" only
 * come from `taste_profile_cache` (written by the `generate-taste-summary`
 * edge function) and can go stale — see `computeStaleness`.
 *
 * NAMING NOTE: an unrelated, already-shipped feature (Release Calendar
 * personalization, PR #214) already owns `hooks/use-taste-profile.ts` +
 * `lib/taste-profile-service.ts` + the type name `TasteProfile` (genre-match
 * scoring for release recommendations — see `app/release-calendar.tsx`).
 * This module's exports are named `TasteInsights*` / `computeTasteInsights`
 * to avoid colliding with that feature; do not rename them back to
 * `TasteProfile` without renaming or removing the release-calendar one first.
 */

import { TMDB_GENRE_MAP } from './tmdb.types';
import { CANON_FILMS, type CanonFilm } from './blind-spots';

/** One of the user's own watched movies (from `user_movies`). */
export interface UserMovieRow {
  tmdbId: number;
  genreIds: number[] | null;
  releaseDate: string | null;
}

export interface DecadeCount {
  decade: string; // e.g. "1990s"
  count: number;
}

export interface GenreCount {
  genreId: number;
  name: string;
  count: number;
}

export interface DirectorCount {
  name: string;
  count: number;
}

/** Normalized `taste_profile_cache` row — the AI-derived half of the profile. */
export interface TasteInsightsCacheRow {
  summary: string;
  topDirectors: DirectorCount[];
  topStudio: string | null;
  generatedAt: string;
  logsCountAtGeneration: number;
}

/** A "Picked for you" recommendation card. */
export interface Pick {
  tmdbId: number;
  title: string;
  year: number;
  posterPath: string | null;
  voteAverage: number;
}

export interface TasteInsights {
  watchedCount: number;
  topDecade: DecadeCount | null;
  comfortGenre: GenreCount | null;
  picks: Pick[];
  cache: TasteInsightsCacheRow | null;
  /** True when the cache is missing or the user has logged >= STALE_LOG_DELTA
   *  more movies since it was generated — drives the hook's one-shot
   *  auto-regenerate. */
  stale: boolean;
}

/** Logged-movie delta since the last cache generation that triggers an
 *  automatic regeneration (or a missing cache row, which always counts). */
export const STALE_LOG_DELTA = 10;

/** "Picked for you" cards shown. */
export const PICKS_COUNT = 3;

/** Bucket a release date's year into a decade label ("1994-03-01" -> "1990s"). */
function decadeLabel(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1800) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

/** Most-watched release decade, or null if no movie has a usable release_date. */
export function computeTopDecade(movies: UserMovieRow[]): DecadeCount | null {
  const counts = new Map<string, number>();
  for (const m of movies) {
    const label = decadeLabel(m.releaseDate);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: DecadeCount | null = null;
  for (const [decade, count] of counts) {
    if (!best || count > best.count) best = { decade, count };
  }
  return best;
}

/** Most-watched movie genre, or null if no movie has genre_ids. */
export function computeComfortGenre(movies: UserMovieRow[]): GenreCount | null {
  const counts = new Map<number, number>();
  for (const m of movies) {
    for (const genreId of m.genreIds ?? []) {
      if (TMDB_GENRE_MAP[genreId]) counts.set(genreId, (counts.get(genreId) ?? 0) + 1);
    }
  }
  let best: GenreCount | null = null;
  for (const [genreId, count] of counts) {
    if (!best || count > best.count) best = { genreId, name: TMDB_GENRE_MAP[genreId], count };
  }
  return best;
}

/** True when there's no cache yet, or the user has logged STALE_LOG_DELTA+
 *  more watched movies since the cache was generated. */
export function computeStaleness(watchedCount: number, cache: TasteInsightsCacheRow | null): boolean {
  if (!cache) return true;
  return watchedCount - cache.logsCountAtGeneration >= STALE_LOG_DELTA;
}

/** Unwatched, high-vote canon films in the user's comfort genre — the
 *  "Picked for you" deterministic v1 (Blind Spots precedent, see
 *  lib/blind-spots.ts's bestUnwatched). Canon films don't carry director
 *  metadata, so picks key off comfort genre only; top director stays a
 *  display-only stat sourced from the AI cache. */
export function computePicks(
  movies: UserMovieRow[],
  comfortGenreId: number | null,
  canon: CanonFilm[]
): Pick[] {
  if (comfortGenreId == null) return [];
  const watchedIds = new Set(movies.map((m) => m.tmdbId));
  return [...canon]
    .filter((f) => f.genreIds.includes(comfortGenreId) && !watchedIds.has(f.tmdbId))
    .sort((a, b) => b.voteAverage - a.voteAverage)
    .slice(0, PICKS_COUNT)
    .map((f) => ({
      tmdbId: f.tmdbId,
      title: f.title,
      year: f.year,
      posterPath: f.posterPath,
      voteAverage: f.voteAverage,
    }));
}

/** Formats the top directors as a display string for the "top director" stat
 *  card, e.g. "Denis Villeneuve" or "Denis Villeneuve, Christopher Nolan".
 *  Null when there's no cache (or the cache carries no director data) yet. */
export function formatTopDirectors(topDirectors: DirectorCount[], max = 2): string | null {
  if (topDirectors.length === 0) return null;
  return topDirectors.slice(0, max).map((d) => d.name).join(', ');
}

/** Normalize a raw `taste_profile_cache` row (or null, when none exists yet)
 *  into a typed `TasteInsightsCacheRow`, tolerating a missing/malformed
 *  `aggregates` jsonb blob rather than crashing the screen. */
export function normalizeCacheRow(raw: unknown): TasteInsightsCacheRow | null {
  if (!raw) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.summary !== 'string') return null;

  const aggregates = (obj.aggregates ?? {}) as Record<string, unknown>;
  const topDirectorsRaw = Array.isArray(aggregates.topDirectors) ? aggregates.topDirectors : [];
  const topDirectors: DirectorCount[] = topDirectorsRaw
    .map((d) => d as Record<string, unknown>)
    .filter((d) => typeof d.name === 'string' && typeof d.count === 'number')
    .map((d) => ({ name: d.name as string, count: d.count as number }));

  const topStudio = typeof aggregates.topStudio === 'string' ? aggregates.topStudio : null;
  const logsCountAtGeneration =
    typeof obj.logs_count_at_generation === 'number' ? obj.logs_count_at_generation : 0;
  const generatedAt = typeof obj.generated_at === 'string' ? obj.generated_at : '';

  return { summary: obj.summary, topDirectors, topStudio, generatedAt, logsCountAtGeneration };
}

/**
 * Compute the full Taste Profile view model from the user's watched movies
 * and the raw `taste_profile_cache` row (or null). Pure — no side effects, no I/O.
 * `canon` defaults to the shared Blind Spots canon (same 168-title dataset,
 * reused here for "Picked for you"); passed explicitly for testability.
 */
export function computeTasteInsights(
  movies: UserMovieRow[],
  rawCacheRow: unknown = null,
  canon: CanonFilm[] = CANON_FILMS
): TasteInsights {
  const cache = normalizeCacheRow(rawCacheRow);
  const topDecade = computeTopDecade(movies);
  const comfortGenre = computeComfortGenre(movies);
  const picks = computePicks(movies, comfortGenre?.genreId ?? null, canon);
  const stale = computeStaleness(movies.length, cache);

  return {
    watchedCount: movies.length,
    topDecade,
    comfortGenre,
    picks,
    cache,
    stale,
  };
}
