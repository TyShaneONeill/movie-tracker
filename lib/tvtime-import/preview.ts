import type { TvTimeMatchResult } from './types';
import type { PersistedReviewItem } from './import-storage';

/** The translated preview (mock frame 3): TV Time vocabulary -> PocketStubs. */
export interface ImportPreview {
  /** Episodes watched -> logged to watch history / counts toward stats. */
  episodes: number;
  /** Shows -> join the Watching list. */
  shows: number;
  /** Movies watched -> stubs printed in the collection. */
  moviesWatched: number;
  /** Movies to watch -> added to the Pile (watchlist). */
  moviesWatchlist: number;
  /** Rows that won't cleanly auto-import (parse failures + unmatched +
   *  ambiguous). Surfaced pre-confirm and listed after import so nothing
   *  disappears silently. */
  needsAttention: number;
}

/** Derive the translated preview counts from a matched payload. Pure. */
export function buildImportPreview(match: TvTimeMatchResult): ImportPreview {
  const episodes = match.shows.matched.reduce((sum, s) => sum + s.episodes.length, 0);
  const shows = match.shows.matched.length;
  const moviesWatched = match.movies.matched.filter((m) => m.status === 'watched').length;
  const moviesWatchlist = match.movies.matched.filter((m) => m.status === 'watchlist').length;
  const needsAttention =
    match.warnings.length +
    match.shows.unmatched.length +
    match.movies.unmatched.length +
    match.movies.needsReview.length;
  return { episodes, shows, moviesWatched, moviesWatchlist, needsAttention };
}

/**
 * Build the "Needs a look" list: ambiguous matches (with TMDB candidates for
 * one-tap fixing) followed by unmatched movies (no candidates — the fix sheet
 * opens on manual search). Shows that failed TVDB->TMDB mapping are not
 * re-linkable via movie search in v1 and are excluded from this list.
 */
export function buildReviewItems(match: TvTimeMatchResult): PersistedReviewItem[] {
  const fromNeedsReview: PersistedReviewItem[] = match.movies.needsReview.map((m) => ({
    title: m.title,
    releaseDate: m.releaseDate,
    status: m.status,
    watchedAt: m.watchedAt,
    rewatchCount: m.rewatchCount,
    candidates: m.candidates.slice(0, 6),
  }));
  const fromUnmatched: PersistedReviewItem[] = match.movies.unmatched.map((m) => ({
    title: m.title,
    releaseDate: m.releaseDate,
    status: m.status,
    watchedAt: m.watchedAt,
    rewatchCount: m.rewatchCount,
    candidates: [],
  }));
  return [...fromNeedsReview, ...fromUnmatched];
}
