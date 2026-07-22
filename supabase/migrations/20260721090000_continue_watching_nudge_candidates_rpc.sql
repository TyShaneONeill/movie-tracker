-- Continue-watching nudge (retention experiment, founder-only) — candidate RPC.
--
-- Fills the gap left by send-tv-episode-reminders: that cron only fires when a
-- BRAND-NEW episode AIRS. A user bingeing a completed show (e.g. The Office)
-- with unwatched, already-aired episodes gets ZERO notifications — yet that
-- binger (a TV Time refugee) is exactly the retention target. This RPC returns,
-- per qualifying user, the ONE show + next-unwatched-aired episode to nudge them
-- back to, deep-linking (client-side) to that episode's Debrief Room.
--
-- Ships DARK-ish: founder-only via the auth.users email allowlist below (server
-- cron can't read client PostHog flags, so the gate lives in SQL). No cron is
-- scheduled by this migration — HQ arms the hourly heartbeat in the DB vault
-- after the DRAFT copy in continue-watching-copy.ts clears review, exactly like
-- send-weekly-recap.
--
-- ── Next-up semantics (MUST match the client) ────────────────────────────────
-- Mirrors lib/episode-room-logic.ts resolveNextUpEpisode + hooks/
-- use-next-episode-up.ts, evaluated server-side against the shared
-- tv_show_episodes catalog:
--   * user_tv_shows.current_season / current_episode is the LAST WATCHED episode
--     (mark_episode_watched recomputes it as ORDER BY season DESC, episode DESC).
--   * Same-season step: next = (S, E+1) when episode E+1 EXISTS in the season
--     catalog. If E+1 exists but has NOT aired, the viewer is "caught up" → no
--     nudge (an unaired later-season premiere must never leapfrog an unaired
--     same-season episode).
--   * Boundary step: only when E+1 does NOT exist in the season catalog does it
--     cross to (S+1, 1), and only if that premiere has aired.
--   * aired = air_date IS NOT NULL AND air_date <= the user's LOCAL today
--     (now() AT TIME ZONE eff_tz), matching client localDateString(); NOT the
--     server CURRENT_DATE, so a US-evening user isn't shown tomorrow's episode
--     a few hours early.
--   * Specials are excluded from the chain: current_season >= 1 required, and
--     the boundary never crosses out of season 0.
--
-- ── Caps / anti-nag (the push_notification_log dedup lessons) ─────────────────
--   1. Max ONE continue_watching nudge per user per day: NOT EXISTS a
--      continue_watching push with status IN ('sent','delivered') in the last
--      20 hours. The status SET (not '= sent') is mandatory — check-push-
--      receipts promotes sent -> delivered within ~15 min, and the send window
--      spans two hourly ticks (17:00 + 18:00 local); an equality dedup would
--      re-fire on the second tick (burned weekly_recap twice: 07-12, 07-19).
--   2. 2-strike per episode: never nudge the same (user, show, season, episode)
--      more than twice total. Counts terminal-success rows in the SET, keyed on
--      the data->>{tmdb_id,season,episode} the payload writes.
--   3. Never nudge an already-watched episode (re-checked at candidate time):
--      the next episode is unwatched by construction (derived from the last
--      watched coordinate), but a NOT EXISTS user_episode_watches guard also
--      covers non-contiguous watch history / stale current_episode.
--
-- ── Preference (opt-out) ─────────────────────────────────────────────────────
-- Respects notification_preferences.feature = 'continue_watching_nudges'
-- (default TRUE, absent row = enabled — matches NOTIFICATION_FEATURE_DEFAULTS).
-- Enforced HERE as an opt-out NOT EXISTS (enabled = false) because the shared
-- send-push-notification opt-out check keys on the payload `feature`
-- ('continue_watching'), a different string chosen so the log/dedup key stays
-- 'continue_watching'. Gating the preference in the RPC (like streak_at_risk,
-- but opt-out vs opt-in) keeps UI, candidates, and delivery in agreement.
--
-- Hardening posture mirrors the sibling candidate RPCs exactly: SECURITY
-- DEFINER, SET search_path = '', every relation schema-qualified (incl.
-- pg_catalog.pg_timezone_names and auth.users), REVOKE PUBLIC / GRANT
-- service_role only — internal use, called by send-continue-watching-nudges.
CREATE OR REPLACE FUNCTION "public"."get_continue_watching_nudge_candidates"()
    RETURNS TABLE(
        "user_id" "uuid",
        "tmdb_id" integer,
        "season_number" integer,
        "episode_number" integer,
        "show_name" "text",
        "episode_name" "text"
    )
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH founders AS (
    -- Founder allowlist for the experiment. Lift this CTE (or widen to all
    -- push-token holders) to graduate the experiment.
    SELECT au.id AS user_id
    FROM auth.users au
    WHERE lower(au.email) IN (
      'tyshaneoneill@gmail.com',
      'tyoneill97@gmail.com',
      'g@g.g'
    )
  ),
  eligible_users AS (
    SELECT
      p.id AS user_id,
      CASE
        WHEN p.timezone IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
        ) THEN p.timezone
        ELSE 'UTC'
      END AS eff_tz
    FROM founders f
    JOIN public.profiles p ON p.id = f.user_id
    JOIN public.push_tokens pt ON pt.user_id = p.id
    WHERE (
      -- Early-evening local send (prime TV time); 23:00 UTC fallback for a
      -- user with no synced timezone. Mirrors send-weekly-recap / send-day2.
      CASE
        WHEN p.timezone IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
        )
        THEN EXTRACT(HOUR FROM (now() AT TIME ZONE p.timezone)) BETWEEN 17 AND 18
        ELSE EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) = 23
      END
    )
    -- Preference opt-out (default TRUE, absent row = enabled).
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_preferences np
      WHERE np.user_id = p.id
        AND np.feature = 'continue_watching_nudges'
        AND np.enabled = false
    )
    -- Cap 1: at most one continue_watching nudge per user per day.
    AND NOT EXISTS (
      SELECT 1 FROM public.push_notification_log pnl
      WHERE pnl.feature = 'continue_watching'
        AND pnl.user_id = p.id
        AND pnl.status IN ('sent', 'delivered')
        AND pnl.sent_at >= now() - interval '20 hours'
    )
    GROUP BY p.id, p.timezone
  ),
  watching_shows AS (
    SELECT
      eu.user_id,
      uts.tmdb_id,
      uts.name AS show_name,
      uts.current_season,
      uts.current_episode,
      uts.updated_at,
      (now() AT TIME ZONE eu.eff_tz)::date AS local_today
    FROM eligible_users eu
    JOIN public.user_tv_shows uts
      ON uts.user_id = eu.user_id
      AND uts.status = 'watching'
    WHERE uts.current_season IS NOT NULL
      AND uts.current_episode IS NOT NULL
      AND uts.current_season >= 1
  ),
  next_up AS (
    -- One row per show: the next-up episode (same-season E+1 if it exists in the
    -- catalog, else the S+1 premiere), with its air date + name. LEFT JOIN so a
    -- caught-up show yields NULL and is filtered below.
    SELECT
      ws.user_id,
      ws.tmdb_id,
      ws.show_name,
      ws.updated_at,
      ws.local_today,
      ne.season_number AS next_season,
      ne.episode_number AS next_episode,
      ne.name AS next_episode_name,
      ne.air_date AS next_air_date
    FROM watching_shows ws
    LEFT JOIN LATERAL (
      SELECT tse.season_number, tse.episode_number, tse.name, tse.air_date
      FROM public.tv_show_episodes tse
      WHERE tse.tmdb_show_id = ws.tmdb_id
        AND (
          -- Same-season next episode.
          (tse.season_number = ws.current_season
            AND tse.episode_number = ws.current_episode + 1)
          -- Season boundary: only when the same-season next episode is ABSENT
          -- from the catalog (matches client "existsInSeason" → cross).
          OR (
            tse.season_number = ws.current_season + 1
            AND tse.episode_number = 1
            AND NOT EXISTS (
              SELECT 1 FROM public.tv_show_episodes t2
              WHERE t2.tmdb_show_id = ws.tmdb_id
                AND t2.season_number = ws.current_season
                AND t2.episode_number = ws.current_episode + 1
            )
          )
        )
      ORDER BY tse.season_number ASC, tse.episode_number ASC
      LIMIT 1
    ) ne ON true
  ),
  qualified AS (
    SELECT
      nu.user_id,
      nu.tmdb_id,
      nu.show_name,
      nu.updated_at,
      nu.next_season,
      nu.next_episode,
      nu.next_episode_name
    FROM next_up nu
    WHERE nu.next_season IS NOT NULL
      AND nu.next_air_date IS NOT NULL
      AND nu.next_air_date <= nu.local_today   -- aired (user-local)
      -- Cap 2: 2-strike per (user, show, season, episode).
      AND (
        SELECT count(*) FROM public.push_notification_log pnl
        WHERE pnl.feature = 'continue_watching'
          AND pnl.user_id = nu.user_id
          AND pnl.status IN ('sent', 'delivered')
          AND pnl.data->>'tmdb_id' = nu.tmdb_id::text
          AND (pnl.data->>'season')::int = nu.next_season
          AND (pnl.data->>'episode')::int = nu.next_episode
      ) < 2
      -- Cap 3: never nudge an episode already watched.
      AND NOT EXISTS (
        SELECT 1 FROM public.user_episode_watches uew
        WHERE uew.user_id = nu.user_id
          AND uew.tmdb_show_id = nu.tmdb_id
          AND uew.season_number = nu.next_season
          AND uew.episode_number = nu.next_episode
      )
  )
  -- One nudge per user per day: pick the most-recently-watched qualifying show
  -- (user_tv_shows.updated_at is bumped by mark_episode_watched).
  SELECT DISTINCT ON (q.user_id)
    q.user_id,
    q.tmdb_id,
    q.next_season AS season_number,
    q.next_episode AS episode_number,
    q.show_name,
    q.next_episode_name AS episode_name
  FROM qualified q
  ORDER BY q.user_id, q.updated_at DESC NULLS LAST;
$$;

ALTER FUNCTION "public"."get_continue_watching_nudge_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_continue_watching_nudge_candidates"() IS 'Returns, per founder-allowlisted user with a push token in their 5-7pm local window (or 23:00 UTC fallback), the most-recently-watched status=watching show that has a next UNWATCHED, AIRED episode (next-up semantics mirror lib/episode-room-logic.ts against tv_show_episodes; aired uses user-local today). Caps: <=1 continue_watching push/user/20h, <=2 sent/delivered strikes per (user,show,season,episode), never an already-watched episode. Respects notification_preferences continue_watching_nudges opt-out (absent = enabled). Internal use only — called by send-continue-watching-nudges edge function.';

REVOKE ALL ON FUNCTION "public"."get_continue_watching_nudge_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_continue_watching_nudge_candidates"() TO "service_role";
