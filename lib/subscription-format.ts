/** Shared formatting helpers for subscription status display (settings + subscription page). */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date as "Jun 5, 2027" (empty string for null). */
export function formatExpiryDate(date: Date | null): string {
  if (!date) return '';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Whole days remaining until a date (rounded up); 0 if already past, null if no date. */
export function getDaysLeft(date: Date | null): number | null {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
