/**
 * Pure display logic for the Top Genres bar (no RN deps → unit-testable).
 *
 * Caps the split bar at MAX_GENRE_SEGMENTS: with more genres than that, the top
 * (N-1) by share are kept and everything else is rolled into a single muted
 * "Other" bucket, so the bar stays legible instead of a smear of thin slivers.
 */

import type { GenreStats } from '@/hooks/use-user-stats';

/** Sentinel id for the aggregated "Other" bucket (not a real TMDB genre). */
export const OTHER_GENRE_ID = -1;
/** Max segments in the bar. The 6th aggregates the remaining genres. */
export const MAX_GENRE_SEGMENTS = 6;

/** A genre row for display — the "Other" bucket also carries the IDs it rolled
 *  up so its detail drill-in can query across all of them. */
export type DisplayGenre = GenreStats & { otherGenreIds?: number[] };

export const isOtherGenre = (g: GenreStats) => g.genreId === OTHER_GENRE_ID;

export function buildDisplayGenres(genres: GenreStats[]): DisplayGenre[] {
  if (genres.length <= MAX_GENRE_SEGMENTS) return genres;
  const sorted = [...genres].sort((a, b) => b.percentage - a.percentage);
  const top = sorted.slice(0, MAX_GENRE_SEGMENTS - 1);
  const rest = sorted.slice(MAX_GENRE_SEGMENTS - 1);
  const other: DisplayGenre = {
    genreId: OTHER_GENRE_ID,
    genreName: 'Other',
    count: rest.reduce((sum, g) => sum + g.count, 0),
    percentage: rest.reduce((sum, g) => sum + g.percentage, 0),
    otherGenreIds: rest.map((g) => g.genreId),
  };
  return [...top, other];
}
