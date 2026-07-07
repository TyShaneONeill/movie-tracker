/**
 * Pure helper for the send-weekly-recap consumer.
 * Builds one personalized push payload per candidate — unlike
 * send-day2-bridge, weekly recap bodies are numeric and per-user, so grouping
 * into shared payloads by identical content would rarely collapse anything.
 * One payload per user also gives true per-user send isolation: a bad body
 * for one user can't fail the HTTP round trip for a whole group.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it
 * directly, and is also Jest-testable via relative path from
 * __tests__/edge-functions/ (mirrors day2-bridge-copy.ts).
 *
 * DRAFT COPY — FOR CONTENT QUEUE REVIEW (PS-15 PR 2, 2026-07-07). Voice
 * (cinephile-dry, no exclamation-mark cheer) and exact wording are not
 * final; the machinery ships dark regardless (no cron scheduled until copy
 * is approved).
 */

export interface WeeklyRecapCandidate {
  user_id: string;
  films_watched: number;
  episodes_logged: number;
  /** First takes and reviews are counted separately, not summed — a
   * reviews-only user must see "N reviews", not be mislabeled "N first
   * takes" (code review, 2026-07-07). */
  first_takes_count: number;
  reviews_count: number;
  /** Present only when the trailing-7-day activity has an identifiable top genre. */
  top_genre: string | null;
}

export interface WeeklyRecapPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    feature: 'weekly_recap';
  };
  feature: 'weekly_recap';
  channel_id: 'digest';
}

const PUSH_TITLE = '🎬 PocketStubs';
const STATS_URL = '/analytics';

// DRAFT — Content Queue review pending.
const EMPTY_WITH_GENRE_BODY = (genre: string) =>
  `Another week deep in ${genre} — your week in film.`;
const EMPTY_GENERIC_BODY = 'Your week in film — see the recap.';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Builds the personalized recap body for one candidate. */
export function buildWeeklyRecapBody(candidate: WeeklyRecapCandidate): string {
  const parts: string[] = [];
  if (candidate.films_watched > 0) parts.push(pluralize(candidate.films_watched, 'film'));
  if (candidate.episodes_logged > 0) parts.push(pluralize(candidate.episodes_logged, 'episode'));
  if (candidate.first_takes_count > 0) parts.push(pluralize(candidate.first_takes_count, 'first take'));
  if (candidate.reviews_count > 0) parts.push(pluralize(candidate.reviews_count, 'review'));

  if (parts.length === 0) {
    return candidate.top_genre
      ? EMPTY_WITH_GENRE_BODY(candidate.top_genre)
      : EMPTY_GENERIC_BODY;
  }

  const genreSuffix = candidate.top_genre ? ` Mostly ${candidate.top_genre}.` : '';
  return `${parts.join(', ')} — your week in film.${genreSuffix}`;
}

export function buildWeeklyRecapPayloads(
  candidates: readonly WeeklyRecapCandidate[]
): WeeklyRecapPayload[] {
  return candidates.map((candidate) => ({
    user_ids: [candidate.user_id],
    title: PUSH_TITLE,
    body: buildWeeklyRecapBody(candidate),
    data: {
      url: STATS_URL,
      feature: 'weekly_recap',
    },
    feature: 'weekly_recap',
    channel_id: 'digest',
  }));
}
