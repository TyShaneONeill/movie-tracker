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
 * Voice is warm cinephile / company brand (never solo-dev).
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
 * data. Titles alternate between the brand line and a show-anchored line
 * (the latter mirrors send-tv-episode-reminders).
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
      title: `📺 ${show} — ${label}`,
      body: "Next episode's ready when you are.",
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
      title: `📺 ${show}`,
      body: `${label} has been sitting in your queue. Tonight?`,
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
      title: `📺 ${show} — ${label}`,
      body: 'Unfinished business. 👀',
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
function dayIndex(today: string): number {
  const ms = Date.parse(`${today}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 86_400_000);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Picks the variant for one candidate: a per-user starting offset (hash of the
 * user id, so two users nudged the same evening rarely read the same line) plus
 * the day number, so the index advances by exactly one each day. That makes a
 * repeat on consecutive days impossible — which a plain `hash % N` could not
 * guarantee — while staying fully deterministic, and therefore testable.
 *
 * `today` is the UTC date. The send window is 17:00-18:00 local, so a user's
 * nudges can straddle a UTC boundary; that only shifts which variant they get,
 * never repeats one, because the offset is per-user and the step is per-day.
 */
export function selectContinueWatchingVariant(
  userId: string,
  today: string = todayUTC()
): CopyVariant {
  const n = CONTINUE_WATCHING_VARIANTS.length;
  const offset = ((hashKey(userId) % n) + n) % n;
  return CONTINUE_WATCHING_VARIANTS[(offset + dayIndex(today)) % n];
}

/** Title + body for one candidate, from the rotating variant pool. */
export function buildContinueWatchingCopy(
  candidate: ContinueWatchingCandidate,
  today: string = todayUTC()
): ContinueWatchingCopy {
  const variant = selectContinueWatchingVariant(candidate.user_id, today);
  const label = `S${candidate.season_number}E${candidate.episode_number}`;
  const { title, body } = variant.render(candidate.show_name, label);
  return { title, body, variant: variant.id };
}

export function buildContinueWatchingPayloads(
  candidates: readonly ContinueWatchingCandidate[],
  today: string = todayUTC()
): ContinueWatchingPayload[] {
  return candidates.map((c) => {
    const copy = buildContinueWatchingCopy(c, today);
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
