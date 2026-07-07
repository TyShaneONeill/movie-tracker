/**
 * Edited-provenance helpers (PS-12).
 *
 * Pure, dependency-free logic for deciding when a post has genuinely had its
 * CONTENT edited — as opposed to a non-content change like visibility, which
 * must NOT mark a post as "Edited".
 *
 * The service/edge layers call {@link contentChanged} with the current stored
 * row and the incoming (already-normalized) values; only when a content field
 * actually differs do they stamp `edited_at`. `updated_at` is deliberately not
 * used as the edited signal because it moves on every write.
 */

// ---------------------------------------------------------------------------
// Content field lists (snake_case, matching the DB columns)
// ---------------------------------------------------------------------------

/**
 * Review content the audience reads. Editing any of these marks the review
 * "Edited". `visibility` and `is_rewatch` are metadata, NOT content.
 */
export const REVIEW_CONTENT_FIELDS = [
  'title',
  'review_text',
  'rating',
  'is_spoiler',
] as const;

/**
 * First Take content. `visibility` is NOT content.
 */
export const FIRST_TAKE_CONTENT_FIELDS = [
  'quote_text',
  'rating',
  'reaction_emoji',
  'is_spoiler',
] as const;

/**
 * Comment content — the body text only.
 */
export const COMMENT_CONTENT_FIELDS = ['body'] as const;

// ---------------------------------------------------------------------------
// Content-change detection
// ---------------------------------------------------------------------------

/**
 * Returns true if any of `fields` is present in `incoming` (i.e. the caller
 * intends to write it) AND differs from the value in `current`.
 *
 * A field that is absent from `incoming`, or explicitly `undefined`, is treated
 * as "not being changed" and skipped — so a visibility-only patch (which never
 * includes a content field) yields `false`.
 *
 * Comparison is strict equality. Callers should normalize incoming values the
 * same way they will be stored (e.g. trim strings, round ratings) BEFORE
 * calling this, so that a whitespace-only edit that trims to the same value is
 * correctly seen as unchanged.
 */
export function contentChanged(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  fields: readonly string[]
): boolean {
  if (!current) return false;
  for (const field of fields) {
    if (!(field in incoming)) continue;
    const next = incoming[field];
    if (next === undefined) continue;
    if (next !== current[field]) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Comment body validation (shared shape; the Deno edge fn mirrors this)
// ---------------------------------------------------------------------------

/** Max comment length — mirrors the review_comments_body_check DB constraint. */
export const COMMENT_MAX_LENGTH = 500;

export interface CommentBodyValidation {
  valid: boolean;
  /** The trimmed body (safe to persist when `valid`). */
  trimmed: string;
  /** Human-readable reason when `valid` is false. */
  error?: string;
}

/**
 * Validate a comment body the same way as create: non-empty after trim and no
 * longer than {@link COMMENT_MAX_LENGTH} characters. Pure — used by the client
 * for an early guard and unit-tested; the edge function enforces the canonical
 * server-side check.
 */
export function validateCommentBody(raw: unknown): CommentBodyValidation {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length < 1) {
    return { valid: false, trimmed, error: 'Comment cannot be empty' };
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer`,
    };
  }
  return { valid: true, trimmed };
}
