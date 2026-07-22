/**
 * Double-length episode detection.
 *
 * Streaming platforms sometimes split a double-length episode (an hour-long
 * premiere/finale in a 22-minute show) into two parts that don't exist in
 * TMDB — TMDB's canonical aired order has ONE record and no part-1/part-2
 * data anywhere, including its community episode groups (verified against
 * The Office's "Peacock" order, 2026-07-21). So the only reliable signal is
 * the episode's runtime relative to its season's typical runtime.
 *
 * The rule is relative, not absolute: 42 minutes is a double in a 22-minute
 * sitcom but perfectly normal in a drama. 1.6× the season median cleanly
 * separates true doubles (~1.9–2×, the ones platforms actually split) from
 * modestly supersized episodes (~1.2–1.5×, which platforms ship whole).
 */

interface RuntimeCarrier {
  runtime?: number | null;
}

const MIN_SAMPLES = 4;
const MIN_MEDIAN_MINUTES = 10;
const DOUBLE_FACTOR = 1.6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * True when `episode` runs at least 1.6× its season's median runtime.
 * Fails closed (false) when the episode has no runtime, the season has fewer
 * than 4 episodes with runtimes, or the median is degenerate (<10 min).
 */
export function isDoubleLengthEpisode(
  episode: RuntimeCarrier,
  seasonEpisodes: RuntimeCarrier[]
): boolean {
  const runtime = episode.runtime;
  if (runtime == null || runtime <= 0) return false;

  const runtimes = seasonEpisodes
    .map((e) => e.runtime)
    .filter((r): r is number => r != null && r > 0);
  if (runtimes.length < MIN_SAMPLES) return false;

  const seasonMedian = median(runtimes);
  if (seasonMedian < MIN_MEDIAN_MINUTES) return false;

  return runtime >= seasonMedian * DOUBLE_FACTOR;
}

/** User-facing explanation shown alongside the indicator. */
export const DOUBLE_LENGTH_HINT =
  'Double-length — some streaming services split this into two parts';
