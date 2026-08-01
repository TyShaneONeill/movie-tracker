/**
 * The one home for the wordless-take invariant.
 *
 * Decision (Ty, 2026-07-31 — "Wordless first takes never render on public
 * surfaces"): a rating-only take STILL EXISTS. The rating is recorded, it feeds
 * the owner's stats, and it still occupies the row that the
 * `idx_first_takes_unique_*` indexes reserve for that (user, target) pair — so
 * dedup, `hasOwnTake`, and the composer's existing-take state must all keep
 * seeing it. What it never does is RENDER: a take whose text is empty or
 * whitespace-only is dropped from every surface that posts takes for an
 * audience (feed, Debrief Room, profiles, movie/TV detail, share cards).
 *
 * Every surface imports from here rather than inlining `.trim()`, so the
 * invariant has a single definition to change and a single place to test.
 *
 * "Has words" means ANY non-whitespace character. An emoji-only take ("🔥") is
 * therefore a real take and renders — the rule is about a take with nothing in
 * it, not about a take we judge to be low effort.
 *
 * This is a RENDER-LAYER filter, mirroring the standing block-filter pattern
 * (SELECT RLS ignores blocks, so the client filters): no schema change, no RPC
 * change. Several queries already carry a `.like('quote_text', '_%')` SQL
 * guard, which catches `''` but NOT `'   '` — `_` matches a space. These
 * helpers are what actually close that gap, so keep them even where the SQL
 * filter is present.
 */

/** Core predicate: does this text have anything in it a reader could read? */
export function hasTakeWords(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim().length > 0;
}

/** Minimal shape shared by every raw `first_takes` row in the render tree. */
export interface TakeWithQuoteText {
  quote_text?: string | null;
}

/** May this take be shown on a public first-take surface? */
export function isPubliclyVisibleTake(
  take: TakeWithQuoteText | null | undefined
): boolean {
  return !!take && hasTakeWords(take.quote_text);
}

/** Drop wordless takes from a list of raw `first_takes` rows. */
export function filterPubliclyVisibleTakes<T extends TakeWithQuoteText>(
  takes: T[]
): T[] {
  return takes.filter((take) => isPubliclyVisibleTake(take));
}

/**
 * Same rule for the layers that have already renamed the column — the feed's
 * `quoteText`, the legacy profile card's `quote`, a wrapper's `{ take }` — via
 * an accessor rather than a fifth shape overload.
 */
export function filterPubliclyVisibleBy<T>(
  items: T[],
  getText: (item: T) => string | null | undefined
): T[] {
  return items.filter((item) => hasTakeWords(getText(item)));
}
