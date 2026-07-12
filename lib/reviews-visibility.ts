import type { Review } from '@/lib/database.types';

export type ReviewVisibility = 'public' | 'followers_only' | 'private';

export interface ReviewVisibilityContext {
  /** The signed-in viewer's user id, if any. */
  viewerId?: string | null;
  /** The profile owner whose reviews are being listed / counted. */
  targetUserId: string;
  /** Whether the viewer follows the target (ignored when viewing own profile). */
  isFollowing: boolean;
}

/**
 * The review visibilities a viewer is allowed to see for a target user's profile.
 *
 * Returns `null` when NO client-side visibility filter should be applied — the
 * viewer is the owner and should see everything, including `private`. Callers
 * translate `null` into "omit the `.in('visibility', …)` clause" and let RLS
 * decide (a user's own reviews are always visible to them).
 *
 * For another user's profile the set mirrors the `reviews` RLS policies:
 *   - always `public`
 *   - plus `followers_only` when the viewer follows the target
 *   - never `private`
 *
 * The profile tab-bar COUNT and the reviews LIST both resolve visibility through
 * this same rule — the list applies this filter, the count passes through the
 * identical RLS gate — so the tab counter can no longer disagree with the list
 * it opens (#669).
 */
export function resolveReviewVisibilities({
  viewerId,
  targetUserId,
  isFollowing,
}: ReviewVisibilityContext): ReviewVisibility[] | null {
  if (!viewerId || viewerId === targetUserId) {
    return null; // own profile: no filter — see everything, incl. private
  }
  return isFollowing ? ['public', 'followers_only'] : ['public'];
}

/**
 * Filter already-fetched reviews to those a viewer may see, using the same rule
 * as {@link resolveReviewVisibilities}. Lets a caller (and the tests) assert the
 * visible-COUNT equals the visible-LIST length across viewer / following / mixed
 * cases.
 */
export function filterReviewsByVisibility<T extends Pick<Review, 'visibility'>>(
  reviews: T[],
  ctx: ReviewVisibilityContext,
): T[] {
  const allowed = resolveReviewVisibilities(ctx);
  if (allowed === null) return reviews;
  return reviews.filter((r) => allowed.includes(r.visibility as ReviewVisibility));
}
