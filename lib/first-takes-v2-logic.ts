/**
 * Pure logic for the First Takes v2 profile tab (design contract 01.2).
 *
 * All derivation the redesign needs — scope counts/filtering, chip-render
 * rules, the rating-slot rule, TV detection, display title — lives here as
 * side-effect-free functions so the rendering components stay thin and the
 * behavior is unit-tested independently of React Native.
 */

import type { FirstTake } from './database.types';

/** The three scope chips. Mirrors the Search v2 scope pattern. */
export type FirstTakesScope = 'all' | 'movie' | 'tv';

/** Any non-movie media_type (tv_show / tv_season / tv_episode) reads as TV. */
export function isTvTake(take: Pick<FirstTake, 'media_type'>): boolean {
  return take.media_type !== 'movie';
}

/**
 * The title shown in the fine-print footer. TV takes carry the series in
 * `show_name`; movies use `movie_title`. Falls back across both so a row is
 * never title-less.
 */
export function takeDisplayTitle(
  take: Pick<FirstTake, 'show_name' | 'movie_title'>
): string {
  return (take.show_name?.trim() || take.movie_title || '').trim();
}

/**
 * The rating slot renders a stamp ONLY for a real positive rating. Null or 0
 * leaves the slot EMPTY (Decision, Ty 2026-07-11) — `reaction_emoji` is never a
 * rating substitute. Matches the legacy card's `rating != null && rating > 0`.
 */
export function hasRating(take: Pick<FirstTake, 'rating'>): boolean {
  return take.rating != null && take.rating > 0;
}

/** Whole numbers show bare (9); halves show one decimal (8.5). */
export function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

/**
 * The `S{n} · E{n}` chip renders ONLY when the episode columns are non-null.
 * No writer populates them today (0 rows in prod) — the renderer is kept ready
 * per contract Decision 4 so episode-level takes light up for free if they ship.
 * Season-only (no episode) degrades to `S{n}`; nothing when season is null.
 */
export function formatSeasonEpisode(
  take: Pick<FirstTake, 'season_number' | 'episode_number'>
): string | null {
  if (take.season_number == null) return null;
  if (take.episode_number == null) return `S${take.season_number}`;
  return `S${take.season_number} · E${take.episode_number}`;
}

export interface ScopeCounts {
  all: number;
  movie: number;
  tv: number;
}

/** Live counts for the scope chips, derived from the fetched take set. */
export function scopeCounts(takes: Pick<FirstTake, 'media_type'>[]): ScopeCounts {
  let movie = 0;
  let tv = 0;
  for (const take of takes) {
    if (isTvTake(take)) tv++;
    else movie++;
  }
  return { all: takes.length, movie, tv };
}

/**
 * Scope chips appear ONLY when the user has BOTH media types (contract F2) —
 * a movies-only or TV-only diary shows no chip row.
 */
export function shouldShowScopeChips(takes: Pick<FirstTake, 'media_type'>[]): boolean {
  const counts = scopeCounts(takes);
  return counts.movie > 0 && counts.tv > 0;
}

/** Client-side scope filter over the already-fetched, already-sorted takes. */
export function filterTakesByScope<T extends Pick<FirstTake, 'media_type'>>(
  takes: T[],
  scope: FirstTakesScope
): T[] {
  if (scope === 'all') return takes;
  if (scope === 'movie') return takes.filter((t) => !isTvTake(t));
  return takes.filter((t) => isTvTake(t));
}

/**
 * Splits a chronologically-sorted (newest-first) take list into the hero
 * (latest) and the earlier ledger rows. The hero is strictly the most recent of
 * the visible scope (contract Decision 3 — no pinning).
 */
export function splitHeroAndRest<T>(takes: T[]): { hero: T | null; rest: T[] } {
  if (takes.length === 0) return { hero: null, rest: [] };
  return { hero: takes[0], rest: takes.slice(1) };
}
