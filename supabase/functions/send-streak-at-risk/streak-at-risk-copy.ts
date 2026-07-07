/**
 * Pure helper for the send-streak-at-risk consumer.
 * Builds one push payload per at-risk user (per-user send isolation, like
 * send-weekly-recap). Copy is diary-framed and cinephile-dry; when a rain
 * check will be spent to keep the streak, the body says so honestly.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is Jest-testable via relative path from __tests__/edge-functions/
 * (mirrors day2-bridge-copy.ts / weekly-recap-copy.ts).
 *
 * DRAFT COPY — FOR CONTENT QUEUE REVIEW (PS-15 PR 3, 2026-07-07). Voice and
 * exact wording are not final; the machinery ships dark regardless (no cron
 * scheduled, streak_at_risk pref default OFF, until copy is approved).
 */

export interface StreakAtRiskCandidate {
  user_id: string;
  current_streak: number;
  /** True when keeping the streak alive today will consume a banked rain check. */
  rain_check_pending: boolean;
}

export interface StreakAtRiskPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    feature: 'streak_at_risk';
    current_streak: number;
    rain_check_pending: boolean;
  };
  feature: 'streak_at_risk';
  channel_id: 'default';
}

const PUSH_TITLE = '🎬 PocketStubs';

// DRAFT — Content Queue review pending.
function buildBody(candidate: StreakAtRiskCandidate): string {
  const day = `Day ${candidate.current_streak}`;
  if (candidate.rain_check_pending) {
    return `${day}, and a rain check's already in play. One scene tonight keeps the reel running.`;
  }
  return `${day} and counting. Log one thing before the credits roll on today.`;
}

export function buildStreakAtRiskPayloads(
  candidates: readonly StreakAtRiskCandidate[]
): StreakAtRiskPayload[] {
  return candidates.map((c) => ({
    user_ids: [c.user_id],
    title: PUSH_TITLE,
    body: buildBody(c),
    data: {
      url: '/',
      feature: 'streak_at_risk',
      current_streak: c.current_streak,
      rain_check_pending: c.rain_check_pending,
    },
    feature: 'streak_at_risk',
    channel_id: 'default',
  }));
}
