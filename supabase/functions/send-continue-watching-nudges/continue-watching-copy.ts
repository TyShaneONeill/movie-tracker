/**
 * Pure helpers for the send-continue-watching-nudges consumer.
 *
 * Two roles:
 *   1. The push copy + payload builder actually used by index.ts.
 *   2. Executable-spec reference implementations of the recipient rules that
 *      the SQL RPC (get_continue_watching_nudge_candidates) enforces —
 *      next-unwatched-episode selection, the once-a-day + 2-strike caps, and
 *      the preference gate. These mirror the SQL so the rules are unit-tested
 *      without a live database (the RPC is the source of truth at runtime;
 *      keep the two in sync). The selection mirror also matches the client's
 *      lib/episode-room-logic.ts resolveNextUpEpisode.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/
 * (mirrors weekly-recap-copy.ts).
 *
 * REVIEWED COPY — voice-reviewed in the #829 cold review (verdict: on-brand,
 * no nag); the variety itself was requested by Ty 2026-08-15. Supersedes the
 * DRAFT / Content-Queue-review-pending marker this file carried from 2026-07-21.
 * Voice is warm cinephile / company brand (never solo-dev).
 */

export interface ContinueWatchingCandidate {
  user_id: string;
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  show_name: string;
  /**
   * TMDB episode title, when the catalog has one. DELIBERATELY never rendered
   * into copy — episode titles spoil ("The One Where Everybody Finds Out"). It
   * rides along only so logs and callers can identify the episode; don't put it
   * in a variant.
   */
  episode_name: string | null;
  /**
   * The recipient's local date (`YYYY-MM-DD`) at send time — the RPC's
   * `local_today` column. The copy rotation keys on this, never on the server's
   * UTC date; see selectContinueWatchingVariant.
   */
  local_today: string;
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
    /** Copy variant id — lands in push_notification_log.data so open rates can
     *  be attributed per variant (the client forwards it on the tap event). */
    variant: string;
    feature: 'continue_watching';
  };
  feature: 'continue_watching';
  channel_id: 'reminders';
}

export interface ContinueWatchingCopy {
  title: string;
  body: string;
  /** Stable id of the chosen variant (analytics + tests). */
  variant: string;
}

interface CopyVariant {
  id: string;
  render: (show: string, label: string) => { title: string; body: string };
}

const BRAND_TITLE = '🎬 PocketStubs';

/**
 * The variant pool. Each entry names the show and the SxEy label and nothing
 * else — deliberately no episode TITLE, which would spoil, and no other user
 * data.
 *
 * INVARIANT (enforced by test): the BODY alone identifies the episode — it
 * always carries both the show name and the SxEy label. Titles are short and
 * fixed-length, never `${show}`-anchored. A long show name in the title is the
 * one thing that reliably truncates in the notification shade, and a variant
 * whose only identifying text lived there ("Unfinished business. 👀" under a
 * cut-off title) would degrade to gibberish for exactly the users with the
 * longest titles — and would bias the variant experiment against itself.
 */
export const CONTINUE_WATCHING_VARIANTS: readonly CopyVariant[] = [
  {
    id: 'ready',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `Ready for ${show} ${label}? 👀`,
    }),
  },
  {
    id: 'queued',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `${show} ${label} is queued up whenever you are. 🍿`,
    }),
  },
  {
    id: 'pick_back_up',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `Pick ${show} back up — ${label} is waiting. 📺`,
    }),
  },
  {
    id: 'roll_it',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `Your next ${show}: ${label}. Roll it? 🎬`,
    }),
  },
  {
    id: 'ready_when_you_are',
    render: (show, label) => ({
      title: '📺 Next episode',
      body: `${show} ${label} — ready when you are.`,
    }),
  },
  {
    id: 'still_watching',
    render: (show, label) => ({
      title: '🍿 Still watching?',
      body: `${show} left off right where you did. ${label} is next.`,
    }),
  },
  {
    id: 'one_tap',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `Still thinking about ${show}? ${label} is one tap away.`,
    }),
  },
  {
    id: 'tonight',
    render: (show, label) => ({
      title: '🍿 Tonight?',
      body: `${show} ${label} has been sitting in your queue.`,
    }),
  },
  {
    id: 'save_the_stub',
    render: (show, label) => ({
      title: '🎟️ Next up',
      body: `${show} ${label} — press play, we'll save the stub.`,
    }),
  },
  {
    id: 'couch_free',
    render: (show, label) => ({
      title: '🍿 Next up',
      body: `${show} ${label}, whenever the couch is free.`,
    }),
  },
  {
    id: 'one_more',
    render: (show, label) => ({
      title: BRAND_TITLE,
      body: `One more ${show}? ${label} is cued and waiting.`,
    }),
  },
  {
    id: 'unfinished',
    render: (show, label) => ({
      title: '👀 Unfinished business',
      body: `${show} ${label} is still waiting.`,
    }),
  },
] as const;

/** Small deterministic string hash (djb2) — stable across Deno + Node. */
function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h | 0;
}

/** Whole days since the epoch for a `YYYY-MM-DD` date (0 if unparseable). */
function dayIndex(localDate: string): number {
  const ms = Date.parse(`${localDate}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 86_400_000);
}

/**
 * Picks the variant for one candidate: a per-user starting offset (hash of the
 * user id, so two users nudged the same evening rarely read the same line) plus
 * the day number, so the index advances by exactly one each day. That makes a
 * repeat on consecutive days impossible — which a plain `hash % N` could not
 * guarantee — while staying fully deterministic, and therefore testable.
 *
 * `localDate` MUST be the recipient's own calendar date (the RPC's
 * `local_today`), never the server's UTC date. The send goes out at 17:00-18:00
 * local, so for a western-hemisphere user two consecutive local evenings can
 * land on the same UTC date (23:00Z then 00:00Z in UTC-6) — and on a
 * spring-forward date they always do (America/Denver, 2026-03-07 17:00 MST =
 * 2026-03-08 00:00Z, 2026-03-08 17:00 MDT = 2026-03-08 23:00Z). Keyed on UTC,
 * those users get the identical message two nights running, which is precisely
 * the no-consecutive-repeat guarantee this function exists to make. Keyed on the
 * user's local date, the invariant holds in the calendar they actually live in.
 */
export function selectContinueWatchingVariant(
  userId: string,
  localDate: string
): CopyVariant {
  const n = CONTINUE_WATCHING_VARIANTS.length;
  const offset = ((hashKey(userId) % n) + n) % n;
  return CONTINUE_WATCHING_VARIANTS[(offset + dayIndex(localDate)) % n];
}

/** Title + body for one candidate, from the rotating variant pool. */
export function buildContinueWatchingCopy(
  candidate: ContinueWatchingCandidate
): ContinueWatchingCopy {
  const variant = selectContinueWatchingVariant(
    candidate.user_id,
    candidate.local_today
  );
  const label = `S${candidate.season_number}E${candidate.episode_number}`;
  const { title, body } = variant.render(candidate.show_name, label);
  return { title, body, variant: variant.id };
}

export function buildContinueWatchingPayloads(
  candidates: readonly ContinueWatchingCandidate[]
): ContinueWatchingPayload[] {
  return candidates.map((c) => {
    const copy = buildContinueWatchingCopy(c);
    return {
      user_ids: [c.user_id],
      title: copy.title,
      body: copy.body,
      data: {
        url: `/tv/${c.tmdb_id}`,
        tmdb_id: c.tmdb_id,
        season: c.season_number,
        episode: c.episode_number,
        variant: copy.variant,
        feature: 'continue_watching',
      },
      feature: 'continue_watching',
      channel_id: 'reminders',
    };
  });
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
 * Reference implementation of the opt-out preference gate (mirrors the SQL).
 * Since the 2026-08-15 widen there is no allowlist: every user with a push
 * token qualifies unless they have explicitly disabled the
 * continue_watching_nudges preference (absent row = enabled).
 */
export function passesGate(params: {
  /** notification_preferences.enabled for continue_watching_nudges, or
   *  null/undefined when there is no row (absent = enabled). */
  preferenceEnabled: boolean | null | undefined;
}): boolean {
  // Absent row (null/undefined) = enabled; only an explicit false opts out.
  return params.preferenceEnabled !== false;
}
