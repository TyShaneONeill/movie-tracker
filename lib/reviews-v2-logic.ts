/**
 * Pure logic for the Reviews v2 profile tab (design contract "Reviews Tab —
 * Proposal 01").
 *
 * All derivation the redesign needs — scope counts/filtering, chip-render
 * rules, sort ordering, the fine-print chip flags — lives here as side-effect
 * free functions so the rendering components stay thin and the behavior is
 * unit-tested independently of React Native. Mirrors `first-takes-v2-logic.ts`.
 */

import type { Review } from './database.types';
import type { ReviewSortOption } from '../hooks/use-user-reviews';

export type { ReviewSortOption } from '../hooks/use-user-reviews';

/**
 * The three scope chips. Same vocabulary as First Takes v2 so the shared
 * `FirstTakesScopeChips` component renders both. `tv` maps to any non-movie
 * media_type at the filter boundary.
 */
export type ReviewScope = 'all' | 'movie' | 'tv';

/** Any non-movie media_type reads as TV (reviews carry `movie` | `tv_show`). */
export function isTvReview(review: Pick<Review, 'media_type'>): boolean {
  return review.media_type !== 'movie';
}

export interface ReviewScopeCounts {
  all: number;
  movie: number;
  tv: number;
}

/** Live counts for the scope chips, derived from the fetched review set. */
export function reviewScopeCounts(reviews: Pick<Review, 'media_type'>[]): ReviewScopeCounts {
  let movie = 0;
  let tv = 0;
  for (const review of reviews) {
    if (isTvReview(review)) tv++;
    else movie++;
  }
  return { all: reviews.length, movie, tv };
}

/**
 * Scope chips appear ONLY when the user has BOTH media types (contract A /
 * "same rule as FT v2") — a movies-only or TV-only shelf shows no chip row.
 */
export function shouldShowReviewScopeChips(reviews: Pick<Review, 'media_type'>[]): boolean {
  const counts = reviewScopeCounts(reviews);
  return counts.movie > 0 && counts.tv > 0;
}

/** Client-side scope filter over the already-fetched reviews. */
export function filterReviewsByScope<T extends Pick<Review, 'media_type'>>(
  reviews: T[],
  scope: ReviewScope
): T[] {
  if (scope === 'all') return reviews;
  if (scope === 'movie') return reviews.filter((r) => !isTvReview(r));
  return reviews.filter((r) => isTvReview(r));
}

/**
 * Orders reviews for the given sort option. The query already returns
 * created_at-descending, so `recent` is a stable pass-through; the others
 * sort a copy so the input is never mutated. Mirrors the legacy profile
 * sort logic exactly (popular = like_count desc, highest/lowest = rating).
 */
export function sortReviews<
  T extends Pick<Review, 'like_count' | 'rating'>
>(reviews: T[], sort: ReviewSortOption): T[] {
  const list = [...reviews];
  switch (sort) {
    case 'popular':
      return list.sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
    case 'highest':
      return list.sort((a, b) => b.rating - a.rating);
    case 'lowest':
      return list.sort((a, b) => a.rating - b.rating);
    case 'recent':
    default:
      return list; // already created_at desc from the query
  }
}

/**
 * The fine-print chip flags for a review row (contract note E). Every chip
 * encodes real row state, never decoration:
 *   • TV        — media_type is not `movie`
 *   • Rewatch   — is_rewatch (the one rose-accented chip)
 *   • Edited    — edited_at is set
 *   • Private   — visibility === 'private'
 *   • Followers — visibility === 'followers_only'
 *
 * The visibility chip is shown ONLY when the review is not public. The legacy
 * card distinguished private (lock) from followers-only (people) via an icon;
 * preserving both labels keeps that information rather than collapsing them.
 */
export interface ReviewChipFlags {
  tv: boolean;
  rewatch: boolean;
  edited: boolean;
  /** null when public; otherwise the label to show. */
  visibility: 'Private' | 'Followers' | null;
}

export function reviewChipFlags(
  review: Pick<Review, 'media_type' | 'is_rewatch' | 'edited_at' | 'visibility'>
): ReviewChipFlags {
  let visibility: ReviewChipFlags['visibility'] = null;
  if (review.visibility === 'private') visibility = 'Private';
  else if (review.visibility === 'followers_only') visibility = 'Followers';

  return {
    tv: isTvReview(review),
    rewatch: !!review.is_rewatch,
    edited: !!review.edited_at,
    visibility,
  };
}
