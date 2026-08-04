/**
 * Storage conventions for date-only journey fields.
 *
 * `watched_at` is a timestamp column but semantically holds a CALENDAR DAY —
 * the clock time lives separately in `watch_time`. The app-wide convention is
 * LOCAL midnight: every writer (edit-journey sheet, both scan save paths) must
 * produce an instant that localizes back to the same calendar day on the
 * device that wrote it. Writing UTC midnight instead shifts the displayed day
 * back by one for users west of Greenwich (#794).
 */

/** Local `YYYY-MM-DD` → ISO at LOCAL MIDNIGHT (date-only; clock lives in watch_time). */
export function localMidnightISO(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return new Date().toISOString();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}
