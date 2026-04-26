/**
 * Sanitization utilities for user-submitted bug reports.
 *
 * Three layers (applied in order by the edge function):
 *   1. sanitizeTitle — title is a single-line field; newlines flatten to space
 *      to prevent log-injection attacks.
 *   2. sanitizeDescription — preserves \n \r \t; strips other non-printing
 *      control chars. Users write multi-line descriptions legitimately.
 *   3. scrubPII — regex pass for email / CC-like digit runs / password
 *      patterns. Applied to BOTH title and description after step 1/2.
 */

// Non-printing ASCII control chars (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
// Intentionally excludes \t (0x09), \n (0x0A), \r (0x0D) — handled separately.
// eslint-disable-next-line no-control-regex
const NON_PRINTING_CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeTitle(input: string): string {
  return input
    // flatten CRLF first to avoid double-replacement
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(NON_PRINTING_CONTROL, '');
}

export function sanitizeDescription(input: string): string {
  return input.replace(NON_PRINTING_CONTROL, '');
}

const EMAIL_RE = /\b[\w._%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi;
// 13-19 consecutive digits with word boundaries. Matches CC numbers without
// embedded spaces/dashes. We deliberately don't match formatted CC (e.g.
// 4111-1111-...) to avoid false positives on any hyphen-separated digit block.
const CC_LIKE_RE = /\b\d{13,19}\b/g;
// Match `password` / `passwd` / `pwd` (case-insensitive), with optional
// spaces around `:` or `=`, then one non-whitespace token.
const PASSWORD_RE = /(password|passwd|pwd)\s*[:=]\s*\S+/gi;

export function scrubPII(input: string): string {
  return input
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(CC_LIKE_RE, '[REDACTED_CC]')
    .replace(PASSWORD_RE, 'password: [REDACTED_PW]');
}
