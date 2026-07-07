/**
 * Pure helper for the send-day2-bridge consumer.
 * Selects one of three contextual copy variants per eligible user (nearest
 * watchlisted release within 30 days / watchlist-anchored / brand-generic),
 * then groups users sharing identical push content into payloads suitable
 * for posting to the internal `send-push-notification` edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it
 * directly, and is also Jest-testable via relative path from
 * __tests__/edge-functions/ (mirrors build-reminder-payload.ts).
 *
 * DRAFT COPY — FOR CONTENT QUEUE REVIEW (PS-15 PR 1, 2026-07-06). Voice
 * (cinephile-dry) and exact wording are not final; the machinery ships dark
 * regardless (no cron scheduled until copy is approved).
 */

export type Day2BridgeVariant = 'near_release' | 'watchlist_anchored' | 'generic';

export interface NearRelease {
  tmdb_id: number;
  title: string;
  release_date: string; // 'YYYY-MM-DD'
  category: 'theatrical' | 'streaming';
}

export interface Day2BridgeCandidate {
  user_id: string;
  has_watchlist: boolean;
  /** Present only when the user has a watchlisted title releasing within 30 days. */
  near_release?: NearRelease;
}

export interface Day2BridgePayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    feature: 'day2_bridge';
    variant: Day2BridgeVariant;
    tmdb_id?: number;
  };
  feature: 'day2_bridge';
  channel_id: 'default';
}

const PUSH_TITLE = '🎬 PocketStubs';

// DRAFT — Content Queue review pending.
const WATCHLIST_ANCHORED_BODY =
  "Your watchlist's been waiting. Pick up where you left off.";
const GENERIC_BODY =
  "Your watchlist isn't going to watch itself — see what's new.";

/** Formats an ISO release date as "Month Day" (UTC, matching release_calendar's date-only column). */
export function formatReleaseWhen(releaseDateISO: string): string {
  const d = new Date(`${releaseDateISO}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function buildNearReleaseBody(near: NearRelease): string {
  const venue = near.category === 'theatrical' ? 'theaters' : 'streaming';
  return `«${near.title}» hits ${venue} ${formatReleaseWhen(near.release_date)} — it's on your watchlist.`;
}

export function buildDay2BridgePayloads(
  candidates: readonly Day2BridgeCandidate[]
): Day2BridgePayload[] {
  const byKey = new Map<string, Day2BridgePayload>();

  for (const c of candidates) {
    let key: string;
    let body: string;
    let variant: Day2BridgeVariant;
    let url = '/watchlist';
    let tmdb_id: number | undefined;

    if (c.near_release) {
      variant = 'near_release';
      key = `near|${c.near_release.tmdb_id}|${c.near_release.category}`;
      body = buildNearReleaseBody(c.near_release);
      url = `/movie/${c.near_release.tmdb_id}`;
      tmdb_id = c.near_release.tmdb_id;
    } else if (c.has_watchlist) {
      variant = 'watchlist_anchored';
      key = 'watchlist_anchored';
      body = WATCHLIST_ANCHORED_BODY;
    } else {
      variant = 'generic';
      key = 'generic';
      body = GENERIC_BODY;
    }

    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title: PUSH_TITLE,
        body,
        data: {
          url,
          feature: 'day2_bridge',
          variant,
          ...(tmdb_id !== undefined ? { tmdb_id } : {}),
        },
        feature: 'day2_bridge',
        channel_id: 'default',
      };
      byKey.set(key, payload);
    }
    payload.user_ids.push(c.user_id);
  }

  return Array.from(byKey.values());
}
