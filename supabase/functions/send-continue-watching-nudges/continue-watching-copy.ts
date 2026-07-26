/**
 * Pure helpers for the send-continue-watching-nudges consumer.
 *
 * Two roles:
 *   1. The push copy + payload builder actually used by index.ts.
 *   2. Executable-spec reference implementations of the recipient rules that
 *      the SQL RPC (get_continue_watching_nudge_candidates) enforces —
 *      next-unwatched-episode selection, the once-a-day + 2-strike caps, and
 *      the allowlist/preference gate. These mirror the SQL so the rules are
 *      unit-tested without a live database (the RPC is the source of truth at
 *      runtime; keep the two in sync). The selection mirror also matches the
 *      client's lib/episode-room-logic.ts resolveNextUpEpisode.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/
 * (mirrors weekly-recap-copy.ts).
 *
 * DRAFT COPY — FOR CONTENT QUEUE REVIEW (2026-07-21). Voice is warm cinephile
 * / company brand (never solo-dev); exact wording not final. The machinery
 * ships regardless — no cron is armed until copy is approved.
 */

export interface ContinueWatchingCandidate {
  user_id: string;
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  show_name: string;
  /** TMDB episode title, when the catalog has one. */
  episode_name: string | null;
}

export interface ContinueWatchingPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    // Stays /tv/{id} — this server payload reaches EVERY installed binary,
    // including bundles that predate the Debrief (Episode) Room route. The
    // client push-tap handler upgrades to /episode-room/{tmdb}-{season}-{episode}
    // when the episode_rooms flag is on, using these season/episode fields.
    url: string;
    tmdb_id: number;
    season: number;
    episode: number;
    feature: 'continue_watching';
  };
  feature: 'continue_watching';
  channel_id: 'reminders';
}

/**
 * Body copy for one candidate. Warm, brand-voiced, varied by a stable hash of
 * the (show, season, episode) so a user doesn't see the identical sentence on a
 * re-nudge, but the copy for a given episode is deterministic (testable).
 *
 * Example (from the brief): "Ready for The Office S2E5? 👀"
 */
export function buildContinueWatchingBody(
  candidate: ContinueWatchingCandidate
): string {
  const label = `S${candidate.season_number}E${candidate.episode_number}`;
  const show = candidate.show_name;
  const variants = [
    `Ready for ${show} ${label}? 👀`,
    `${show} ${label} is queued up whenever you are. 🍿`,
    `Pick ${show} back up — ${label} is waiting. 📺`,
    `Your next ${show}: ${label}. Roll it? 🎬`,
  ];
  const idx =
    Math.abs(
      hashKey(`${candidate.tmdb_id}-${candidate.season_number}-${candidate.episode_number}`)
    ) % variants.length;
  return variants[idx];
}

/** Small deterministic string hash (djb2) — stable across Deno + Node. */
function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h | 0;
}

export function buildContinueWatchingPayloads(
  candidates: readonly ContinueWatchingCandidate[]
): ContinueWatchingPayload[] {
  return candidates.map((c) => ({
    user_ids: [c.user_id],
    title: '🎬 PocketStubs',
    body: buildContinueWatchingBody(c),
    data: {
      url: `/tv/${c.tmdb_id}`,
      tmdb_id: c.tmdb_id,
      season: c.season_number,
      episode: c.episode_number,
      feature: 'continue_watching',
    },
    feature: 'continue_watching',
    channel_id: 'reminders',
  }));
}

// ── Executable-spec mirrors of the SQL recipient rules (unit-tested) ─────────

export interface EpisodeCatalogEntry {
  season: number;
  episode: number;
  /** TMDB air date `YYYY-MM-DD`, or null when TMDB has none. */
  airDate: string | null;
}

export interface NextUnwatched {
  season: number;
  episode: number;
}

/**
 * Reference implementation of the RPC's next-unwatched-aired-episode selection,
 * mirroring lib/episode-room-logic.ts resolveNextUpEpisode against the shared
 * tv_show_episodes catalog.
 *
 * @param lastWatchedSeason  user_tv_shows.current_season (last watched)
 * @param lastWatchedEpisode user_tv_shows.current_episode (last watched)
 * @param catalog            all catalog rows for the show (any season)
 * @param today              user-LOCAL YYYY-MM-DD
 *
 * Rules:
 *  - Specials excluded: lastWatchedSeason must be >= 1, else null.
 *  - Same-season step: if (S, E+1) EXISTS in the catalog, that's the next-up.
 *    Return it only when it has aired (airDate != null && airDate <= today);
 *    if it exists but hasn't aired, the viewer is caught up → null (never
 *    leapfrog to a later season).
 *  - Boundary step: only when (S, E+1) is ABSENT from the catalog does it cross
 *    to (S+1, 1), returned only if that premiere has aired.
 */
export function selectNextUnwatchedEpisode(
  lastWatchedSeason: number,
  lastWatchedEpisode: number,
  catalog: readonly EpisodeCatalogEntry[],
  today: string
): NextUnwatched | null {
  if (lastWatchedSeason < 1) return null;

  const nextInSeason = lastWatchedEpisode + 1;
  const sameSeason = catalog.find(
    (e) => e.season === lastWatchedSeason && e.episode === nextInSeason
  );
  if (sameSeason) {
    return isAired(sameSeason, today)
      ? { season: lastWatchedSeason, episode: nextInSeason }
      : null;
  }

  const premiere = catalog.find(
    (e) => e.season === lastWatchedSeason + 1 && e.episode === 1
  );
  if (premiere && isAired(premiere, today)) {
    return { season: lastWatchedSeason + 1, episode: 1 };
  }
  return null;
}

function isAired(entry: EpisodeCatalogEntry, today: string): boolean {
  return entry.airDate != null && entry.airDate <= today;
}

export interface PriorNudge {
  season: number;
  episode: number;
  /** push_notification_log.status */
  status: string;
  /** ISO timestamp of push_notification_log.sent_at */
  sentAt: string;
}

/** Terminal-success states — matches the SQL `status IN ('sent','delivered')`. */
export const TERMINAL_SUCCESS_STATUSES = ['sent', 'delivered'] as const;

function isTerminalSuccess(status: string): boolean {
  return (TERMINAL_SUCCESS_STATUSES as readonly string[]).includes(status);
}

/**
 * Reference implementation of the two caps (mirrors the SQL):
 *  - Once-a-day: no continue_watching push in terminal-success state within the
 *    last 20 hours (covers the two hourly ticks of the local send window).
 *  - 2-strike: fewer than 2 terminal-success sends for THIS exact
 *    (season, episode).
 *
 * @param priorNudges all prior continue_watching log rows for this user
 * @param candidate   the episode we're about to nudge
 * @param now         current time (Date)
 */
export function passesCaps(
  priorNudges: readonly PriorNudge[],
  candidate: NextUnwatched,
  now: Date = new Date()
): boolean {
  const successes = priorNudges.filter((n) => isTerminalSuccess(n.status));

  const twentyHoursAgo = now.getTime() - 20 * 60 * 60 * 1000;
  const sentToday = successes.some(
    (n) => new Date(n.sentAt).getTime() >= twentyHoursAgo
  );
  if (sentToday) return false;

  const strikes = successes.filter(
    (n) => n.season === candidate.season && n.episode === candidate.episode
  ).length;
  return strikes < 2;
}

/**
 * Reference implementation of the founder allowlist + opt-out preference gate
 * (mirrors the SQL). A user qualifies when their email is in the allowlist AND
 * they have NOT explicitly disabled the continue_watching_nudges preference
 * (absent row = enabled).
 */
export const FOUNDER_ALLOWLIST = [
  'tyshaneoneill@gmail.com',
  'tyoneill97@gmail.com',
  'g@g.g',
] as const;

export function passesGate(params: {
  email: string | null;
  /** notification_preferences.enabled for continue_watching_nudges, or
   *  null/undefined when there is no row (absent = enabled). */
  preferenceEnabled: boolean | null | undefined;
}): boolean {
  const { email, preferenceEnabled } = params;
  if (!email) return false;
  if (!(FOUNDER_ALLOWLIST as readonly string[]).includes(email.toLowerCase())) {
    return false;
  }
  // Absent row (null/undefined) = enabled; only an explicit false opts out.
  return preferenceEnabled !== false;
}
