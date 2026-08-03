/**
 * The one comparison rule for companion names — `watched_with` has no FK, so
 * string normalization IS the identity rule. Every surface that dedupes or
 * compares companion names (edit-journey sheet, scan batch tagging) must go
 * through this module; a second local copy means the scan flow and the edit
 * sheet can disagree about duplicates on the same database column.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Dedupe names by normalized value, preserving first display form + order. */
export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = normalizeName(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n.trim());
  }
  return out;
}
