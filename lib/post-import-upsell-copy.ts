/**
 * The line the post-import PocketStubs+ upsell opens with.
 *
 * It names what the user just brought over, so the pitch is about THEIR library
 * rather than a generic feature. That only works if the numbers are real: the
 * original built the sentence from shows and movies unconditionally, so an
 * import that added only EPISODES to already-tracked shows produced
 *
 *     "You just brought over 0 shows and 0 movies."
 *
 * at the exact moment the pitch depends on. Nobody had seen it because until
 * #768 the sheet could never render at all.
 *
 * Rules, in order of preference — always lead with something true and non-zero:
 *   shows and movies  -> "5 shows and 12 movies"
 *   shows only        -> "5 shows"
 *   movies only       -> "12 movies"
 *   episodes only     -> "13 episodes"        (the re-import case)
 *   nothing countable -> no quantity at all; the sheet is gated on stubs > 0,
 *                        so this is unreachable in practice, but it degrades to
 *                        a sentence that still reads rather than to "0".
 */

export interface UpsellCounts {
  showCount: number;
  movieCount: number;
  episodeCount: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "5 shows and 12 movies" / "13 episodes" / null when nothing is countable. */
export function describeImportHaul(counts: UpsellCounts): string | null {
  const { showCount, movieCount, episodeCount } = counts;
  const parts: string[] = [];
  if (showCount > 0) parts.push(plural(showCount, 'show', 'shows'));
  if (movieCount > 0) parts.push(plural(movieCount, 'movie', 'movies'));
  if (parts.length > 0) return parts.join(' and ');

  // No new shows or movies — this was episodes landing on shows already tracked.
  // Say that, rather than reporting two zeroes.
  if (episodeCount > 0) return plural(episodeCount, 'episode', 'episodes');
  return null;
}

/** Full upsell body. */
export function postImportUpsellMessage(counts: UpsellCounts): string {
  const haul = describeImportHaul(counts);
  const opener = haul
    ? `You just brought over ${haul}.`
    : 'Your library just landed in PocketStubs.';
  return `${opener} See your taste profile — rating personality, blind spots, and more — across everything you've watched with PocketStubs+.`;
}
