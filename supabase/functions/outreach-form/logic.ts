// Pure, dependency-free logic for the outreach-form edge function.
//
// Kept free of Deno / jsr imports so it can be unit-tested from Jest
// (see __tests__/edge-functions/outreach-form-logic.test.ts) exactly like
// send-day2-bridge/day2-bridge-copy.ts. index.ts imports from here for the
// side-effectful I/O paths (DB, RevenueCat, PostHog, Discord).

/**
 * Version of the question set the form renders. Bumped whenever the questions
 * change so answers can be interpreted against the right schema later. Stored
 * client-side context only — the fn echoes it back on load.
 */
export const QUESTIONS_VERSION = 1;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if the token is a well-formed uuid. Cheap pre-check before any DB hit. */
export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && UUID_RE.test(token);
}

/**
 * Best-effort first name from an email local part, used only to warm the form
 * greeting ("Hi Antonio"). Returns undefined unless the local part looks like a
 * real first.last handle — we never show a mangled login like "stmvgkrvr6".
 * "antonio.perrella96@gmail.com" -> "Antonio".
 */
export function deriveFirstName(email: string): string | undefined {
  const at = email.indexOf('@');
  if (at <= 0) return undefined;
  const local = email.slice(0, at);
  if (!local.includes('.')) return undefined; // only trust first.last style
  const first = local.split(/[._-]/)[0].replace(/[^a-zA-Z]/g, '');
  if (first.length < 2 || first.length > 20) return undefined;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

/** RevenueCat promotional-entitlement duration string for a given grant length. */
export type RevenueCatDuration = 'two_month' | 'three_month';

/**
 * Map the invite's grant_months to the RevenueCat promotional `duration` enum.
 * The table CHECK constraint already restricts grant_months to {2,3}; we throw
 * on anything else so a bad row surfaces loudly rather than granting silently.
 */
export function mapGrantDuration(grantMonths: number): RevenueCatDuration {
  if (grantMonths === 3) return 'three_month';
  if (grantMonths === 2) return 'two_month';
  throw new Error(`unsupported grant_months: ${grantMonths}`);
}

/** Compute the grant expiry timestamp for a promotional grant of N months. */
export function computeGrantExpiry(startedAt: Date, months: number): Date {
  const expires = new Date(startedAt.getTime());
  expires.setUTCMonth(expires.getUTCMonth() + months);
  return expires;
}

/**
 * Mask an email for logging / Discord — keeps the first char of the local part
 * and the domain, so ops can eyeball which invite completed without spraying the
 * full PII into a chat channel. "antonio.perrella96@gmail.com" -> "a***@gmail.com".
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const first = email[0];
  const domain = email.slice(at + 1);
  return `${first}***@${domain}`;
}

const MAX_ANSWERS_BYTES = 8000;
const MAX_STRING_LEN = 2000;

export interface ValidatedSubmission {
  answers: Record<string, unknown>;
  followupOk: boolean;
}

export interface ValidationError {
  error: string;
}

export type ValidationResult = ValidatedSubmission | ValidationError;

export function isValidationError(r: ValidationResult): r is ValidationError {
  return (r as ValidationError).error !== undefined;
}

/**
 * Validate + normalize a submit payload's answers/followup_ok.
 *
 * Deliberately lenient about SHAPE (the form owns the question set and may add
 * questions without a redeploy of this fn) but strict about SIZE and type so a
 * malicious token holder can't stuff the jsonb column. Rules:
 *   - answers must be a plain object (not null / array / primitive)
 *   - top-level string values are trimmed and truncated to MAX_STRING_LEN
 *   - the serialized object must be <= MAX_ANSWERS_BYTES
 *   - followup_ok is coerced to a strict boolean (default true — the form
 *     defaults the toggle to yes)
 */
export function validateSubmission(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;
  const rawAnswers = b.answers;

  if (
    typeof rawAnswers !== 'object' ||
    rawAnswers === null ||
    Array.isArray(rawAnswers)
  ) {
    return { error: 'invalid_answers' };
  }

  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    if (typeof value === 'string') {
      answers[key] = value.trim().slice(0, MAX_STRING_LEN);
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      answers[key] = value;
    }
    // silently drop nested objects/arrays — keep the column flat + bounded
  }

  if (JSON.stringify(answers).length > MAX_ANSWERS_BYTES) {
    return { error: 'answers_too_large' };
  }

  const followupOk = b.followup_ok === undefined ? true : b.followup_ok === true;

  return { answers, followupOk };
}
