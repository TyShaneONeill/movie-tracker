/**
 * Pure view-model logic for the Rating Personality deep-dive (vault PS-22).
 *
 * Dependency-free (no RN / supabase imports) so it is unit-testable in
 * isolation — the hook (`hooks/use-rating-personality.ts`) does the fetching
 * and hands the raw rows + community payload here for the actual math.
 *
 * The rating scale is 1–10 throughout (matches `first_takes.rating`).
 */

/** One of the user's own movie ratings (from `first_takes`, movies only). */
export interface UserRating {
  rating: number; // 1..10
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** Release year, when known — used for the "(year)" suffix on diverge rows. */
  year?: number | null;
}

/** A per-title community average, emitted by the RPC only for titles with
 *  rater_count >= 2. */
export interface CommunityPerTitle {
  tmdb_id: number;
  community_avg: number;
  rater_count: number;
}

/** The shape returned by the `get_rating_personality` RPC (as JSON). */
export interface CommunityPayload {
  community_avg: number | null;
  community_dist: number[]; // length 10, score 1..10
  per_title: CommunityPerTitle[];
}

/** A single "where you part ways" row. */
export interface DivergenceRow {
  /** Stable identity for list keys — titles can collide (remakes). */
  tmdbId: number;
  title: string;
  year: number | null;
  you: number;
  crowd: number;
  poster: string | null;
}

export type Verdict = 'Generous' | 'Balanced' | 'Tough';

export interface RatingPersonality {
  yourAvg: number;
  communityAvg: number;
  delta: number; // yourAvg - communityAvg
  rated: number;
  pctHigh: number; // % of user ratings >= 8, rounded
  verdict: Verdict;
  /** Marker position on the harsh→generous scale, [0,1] = yourAvg/10. */
  position: number;
  /** Community tick position, [0,1] = communityAvg/10. */
  communityMarker: number;
  blurb: string;
  dist: { you: number[]; community: number[] };
  generous: DivergenceRow[];
  tougher: DivergenceRow[];
  /** True when at least one diverging title (generous or tougher) exists —
   *  drives the honest empty state for the "Where you part ways" section. */
  hasDivergenceData: boolean;
}

/**
 * Verdict thresholds — based on how far the user's average sits from the
 * PocketStubs community average:
 *   delta >= +0.5  → "Generous" (you score higher than the crowd)
 *   delta <= -0.5  → "Tough"    (you score lower than the crowd)
 *   otherwise      → "Balanced" (you track the consensus)
 * 0.5 on a 1–10 scale is a deliberately modest band so "Balanced" means
 * genuinely close, not merely "within a point".
 */
export const VERDICT_BAND = 0.5;

/** Ratings at or above this count as a "high" score (the "% rated 8+" stat). */
export const HIGH_RATING_FLOOR = 8;

/** Max rows shown in each divergence list (generous / tougher). */
export const DIVERGENCE_TOP_N = 5;

/** Bucket a 1–10 rating into an index 0..9 (round, then clamp 1..10). */
function bucketIndex(rating: number): number {
  const rounded = Math.round(rating);
  const clamped = Math.min(10, Math.max(1, rounded));
  return clamped - 1;
}

/** Build a length-10 histogram (index 0 = score 1 … index 9 = score 10). */
export function histogram(ratings: number[]): number[] {
  const dist = new Array<number>(10).fill(0);
  for (const r of ratings) {
    dist[bucketIndex(r)] += 1;
  }
  return dist;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function verdictFor(delta: number): Verdict {
  if (delta >= VERDICT_BAND) return 'Generous';
  if (delta <= -VERDICT_BAND) return 'Tough';
  return 'Balanced';
}

function blurbFor(verdict: Verdict, delta: number): string {
  const mag = round1(Math.abs(delta)).toFixed(1);
  switch (verdict) {
    case 'Generous':
      return `You rate about ${mag} higher than the PocketStubs average — you tend to find the good in what you watch.`;
    case 'Tough':
      return `You rate about ${mag} lower than the PocketStubs average — a discerning eye that's hard to impress.`;
    case 'Balanced':
    default:
      return `Your scores track the PocketStubs consensus almost exactly — a reliable barometer for the crowd.`;
  }
}

/**
 * Normalize the raw RPC JSON into a typed `CommunityPayload`, tolerating nulls
 * / missing keys / a short dist array (defensive — the RPC guarantees length
 * 10, but a cold/empty DB or a shape drift shouldn't crash the screen).
 */
export function normalizeCommunityPayload(raw: unknown): CommunityPayload {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const avgRaw = obj.community_avg;
  const community_avg =
    typeof avgRaw === 'number' && Number.isFinite(avgRaw) ? avgRaw : null;

  const distRaw = Array.isArray(obj.community_dist) ? obj.community_dist : [];
  const community_dist = new Array<number>(10).fill(0).map((_, i) => {
    const v = distRaw[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  });

  const perRaw = Array.isArray(obj.per_title) ? obj.per_title : [];
  const per_title: CommunityPerTitle[] = perRaw
    .map((r) => r as Record<string, unknown>)
    .filter(
      (r) =>
        typeof r.tmdb_id === 'number' &&
        typeof r.community_avg === 'number' &&
        typeof r.rater_count === 'number'
    )
    .map((r) => ({
      tmdb_id: r.tmdb_id as number,
      community_avg: r.community_avg as number,
      rater_count: r.rater_count as number,
    }));

  return { community_avg, community_dist, per_title };
}

/**
 * Compute the full Rating Personality view model from the user's own ratings
 * and the community payload. Pure — no side effects, no I/O.
 */
export function computeRatingPersonality(
  ratings: UserRating[],
  community: CommunityPayload
): RatingPersonality {
  const values = ratings.map((r) => r.rating);
  const rated = values.length;

  const yourAvg = round1(mean(values));
  const communityAvg = round1(community.community_avg ?? 0);
  const delta = round1(yourAvg - communityAvg);

  const highCount = values.filter((v) => v >= HIGH_RATING_FLOOR).length;
  const pctHigh = rated === 0 ? 0 : Math.round((highCount / rated) * 100);

  const verdict = verdictFor(delta);
  const blurb = blurbFor(verdict, delta);

  // Clamp marker positions to [0,1] (a 0..10 avg maps directly onto the scale).
  const position = Math.min(1, Math.max(0, yourAvg / 10));
  const communityMarker = Math.min(1, Math.max(0, communityAvg / 10));

  const distYou = histogram(values);
  const distCommunity = community.community_dist.slice(0, 10);
  while (distCommunity.length < 10) distCommunity.push(0);

  // Divergence: only titles the user rated AND that the RPC returned a
  // community average for (rater_count >= 2). you = the user's own score,
  // crowd = the public community average for that title.
  const perTitleByTmdb = new Map<number, CommunityPerTitle>();
  for (const p of community.per_title) perTitleByTmdb.set(p.tmdb_id, p);

  // A user may have rated the same tmdb_id more than once (rewatch takes) —
  // use their most recent-ish first match; ratings arrive newest-first from the
  // hook, so the first occurrence wins.
  const seen = new Set<number>();
  const rows: (DivergenceRow & { absDelta: number; signed: number })[] = [];
  for (const r of ratings) {
    if (seen.has(r.tmdbId)) continue;
    const community_pt = perTitleByTmdb.get(r.tmdbId);
    if (!community_pt) continue;
    seen.add(r.tmdbId);
    const you = round1(r.rating);
    const crowd = round1(community_pt.community_avg);
    const signed = round1(you - crowd);
    if (signed === 0) continue; // a dead-on match belongs to neither list
    rows.push({
      tmdbId: r.tmdbId,
      title: r.title,
      year: r.year ?? null,
      you,
      crowd,
      poster: r.posterPath,
      absDelta: Math.abs(signed),
      signed,
    });
  }

  rows.sort((a, b) => b.absDelta - a.absDelta);

  const strip = ({ absDelta: _a, signed: _s, ...row }: (typeof rows)[number]): DivergenceRow => row;
  const generous = rows.filter((r) => r.signed > 0).slice(0, DIVERGENCE_TOP_N).map(strip);
  const tougher = rows.filter((r) => r.signed < 0).slice(0, DIVERGENCE_TOP_N).map(strip);

  return {
    yourAvg,
    communityAvg,
    delta,
    rated,
    pctHigh,
    verdict,
    position,
    communityMarker,
    blurb,
    dist: { you: distYou, community: distCommunity },
    generous,
    tougher,
    hasDivergenceData: generous.length > 0 || tougher.length > 0,
  };
}
