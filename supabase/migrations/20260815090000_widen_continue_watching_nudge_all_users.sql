-- Graduate the continue-watching nudge from the founder allowlist to ALL users.
--
-- The experiment shipped founder-only in #744 (2026-07-22): the RPC opened with
-- a `founders` CTE selecting three auth.users emails, and every downstream CTE
-- hung off it. Ty has received it daily since and approved widening
-- (2026-08-15). This migration removes ONLY that CTE — eligible_users now draws
-- straight from profiles ⋈ push_tokens. Every other clause is unchanged.
--
-- The caps that make this non-naggy are DELIBERATELY untouched and still carry
-- the whole burden now that the population is everyone:
--   * send window: 17:00-18:00 user-local (23:00 UTC fallback when no synced tz)
--   * <= 1 continue_watching push per user per 20h (status IN ('sent','delivered')
--     — the terminal-success SET, never '= sent'; check-push-receipts promotes
--     sent -> delivered and the window spans two hourly ticks)
--   * <= 2 strikes per (user, show, season, episode)
--   * never an already-watched episode
--   * notification_preferences 'continue_watching_nudges' opt-out (absent row =
--     enabled). The settings toggle that writes that row was itself hidden
--     behind the episode_rooms flag; the same PR ungates it, so every user who
--     can now RECEIVE the nudge can also turn it off in-app.
--
-- ── ACL posture ──────────────────────────────────────────────────────────────
-- CREATE OR REPLACE PRESERVES the existing ACL, so the anon/authenticated
-- revoke from 20260727040000 survives this migration. The grants are re-asserted
-- below anyway (idempotent) because the blast radius of an anon-executable
-- SECURITY DEFINER changed with this widen: it used to leak three founder rows,
-- it would now leak nudge candidates for the entire user base. All THREE of
-- PUBLIC, anon and authenticated must be named — revoking PUBLIC alone is a
-- no-op against Supabase's default privileges (burned 06-05, 07-03, 07-22).
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
  WITH eligible_users AS (
    SELECT
      p.id AS user_id,
      CASE
        WHEN p.timezone IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
        ) THEN p.timezone
        ELSE 'UTC'
      END AS eff_tz
    FROM public.profiles p
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

COMMENT ON FUNCTION "public"."get_continue_watching_nudge_candidates"() IS 'Returns, per user with a push token in their 5-7pm local window (or 23:00 UTC fallback), the most-recently-watched status=watching show that has a next UNWATCHED, AIRED episode (next-up semantics mirror lib/episode-room-logic.ts against tv_show_episodes; aired uses user-local today). Caps: <=1 continue_watching push/user/20h, <=2 sent/delivered strikes per (user,show,season,episode), never an already-watched episode. Respects notification_preferences continue_watching_nudges opt-out (absent = enabled). Widened from the founder allowlist to all users 2026-08-15. Internal use only — called by send-continue-watching-nudges edge function.';

REVOKE ALL ON FUNCTION "public"."get_continue_watching_nudge_candidates"()
  FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_continue_watching_nudge_candidates"()
  TO "service_role";
