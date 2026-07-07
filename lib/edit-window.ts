/**
 * Edit grace window (PS-12 anti-abuse) — client mirror of the DB trigger
 * `enforce_edit_grace_window` (migration 20260704150000).
 *
 * A post/comment's CONTENT is editable only within a short window after posting
 * AND only before it has any engagement (likes/comments). This prevents the
 * "bait-and-switch" edit where a post earns likes on one version and is then
 * rewritten. After the window closes or engagement arrives, the content locks
 * and the user must delete + repost to change it.
 *
 * This is UI gating only — the DB trigger is the actual guarantee. Keep the
 * window value (15 min) and the lock conditions in sync with the migration.
 */

export const EDIT_GRACE_MS = 15 * 60 * 1000; // 15 minutes — matches the trigger

function withinWindow(createdAt: string | null | undefined, now: number): boolean {
  if (!createdAt) return false; // unknown creation time → treat as locked (safe)
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created <= EDIT_GRACE_MS;
}

/** Reviews & First Takes: locked once liked, commented on, or past the window. */
export function canEditPost(
  post: {
    created_at?: string | null;
    like_count?: number | null;
    comment_count?: number | null;
  },
  now: number = Date.now()
): boolean {
  if ((post.like_count ?? 0) > 0) return false;
  if ((post.comment_count ?? 0) > 0) return false;
  return withinWindow(post.created_at, now);
}

/** Comments: locked once liked or past the window. */
export function canEditComment(
  comment: { created_at?: string | null; like_count?: number | null },
  now: number = Date.now()
): boolean {
  if ((comment.like_count ?? 0) > 0) return false;
  return withinWindow(comment.created_at, now);
}

/** True when the DB rejected an edit because the grace window had closed. */
export function isEditWindowClosedError(err: unknown): boolean {
  const msg =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  return msg.includes('edit_window_closed');
}

export const EDIT_WINDOW_CLOSED_MESSAGE =
  'This post can no longer be edited — it already has activity or the edit window has closed. Delete and repost to change it.';
