-- Fix notification dedup: match TERMINAL-SUCCESS states, not only 'sent'.
--
-- BUG (found in production 2026-07-12, first weekly-recap Sunday): the three
-- candidate RPCs dedup on `pnl.status = 'sent'`, but check-push-receipts
-- promotes rows sent -> 'delivered' within ~15 minutes. Any send window longer
-- than receipt latency therefore re-qualifies the user on the next hourly tick:
-- Ty received the weekly recap TWICE (00:00 and 01:00 UTC ticks of his
-- 5-7pm local window; the 00:00 row read 'delivered' by 01:00). day2-bridge
-- shares the pattern (nightly, 2h windows); streak-at-risk shares it (cron not
-- yet armed).
--
-- FIX: dedup on status IN ('sent','delivered'). 'failed' still allows a retry,
-- preserving the original intent (a transient Expo failure must not burn the
-- window). Function bodies below are byte-identical to their originating
-- migrations except for that one predicate per function; grants unchanged
-- (CREATE OR REPLACE preserves ACLs; REVOKE/GRANT re-stated for safety).
--
-- Lesson (banked): equality-based dedup breaks against a status-mutating
-- pipeline — dedup must match the SET of terminal-success states.

-- ===== from supabase/migrations/20260706140000_day2_bridge_candidates_rpc.sql (dedup predicate fixed) =====
CREATE OR REPLACE FUNCTION "public"."get_pending_day2_bridge_candidates"()
    RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT DISTINCT p.id AS user_id
  FROM public.profiles p
  JOIN public.push_tokens pt ON pt.user_id = p.id
  WHERE p.created_at <= now() - interval '24 hours'
    AND p.created_at > now() - interval '48 hours'
    AND (
      CASE
        WHEN p.timezone IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
          )
        THEN EXTRACT(HOUR FROM (now() AT TIME ZONE p.timezone)) BETWEEN 17 AND 18
        ELSE EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) = 23
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.push_notification_log pnl
      WHERE pnl.feature = 'day2_bridge'
        AND pnl.user_id = p.id
        AND pnl.status IN ('sent', 'delivered')
    );
$$;

ALTER FUNCTION "public"."get_pending_day2_bridge_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_pending_day2_bridge_candidates"() IS 'Returns users whose profile is 24-48h old, has a push token, is in their 5-7pm local window (or the 23:00 UTC fallback for null timezone), and has never received a day2_bridge push. Internal use only — called by send-day2-bridge edge function.';

REVOKE ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() TO "service_role";

-- ===== from supabase/migrations/20260707100000_weekly_recap_candidates_rpc.sql (dedup predicate fixed) =====
CREATE OR REPLACE FUNCTION "public"."get_weekly_recap_candidates"()
    RETURNS TABLE(
        "user_id" "uuid",
        "films_watched" bigint,
        "episodes_logged" bigint,
        "first_takes_count" bigint,
        "reviews_count" bigint,
        "top_genre" "text"
    )
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH eligible_users AS (
    SELECT DISTINCT p.id AS user_id
    FROM public.profiles p
    JOIN public.push_tokens pt ON pt.user_id = p.id
    WHERE (
      CASE
        WHEN p.timezone IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
          )
        THEN EXTRACT(DOW FROM (now() AT TIME ZONE p.timezone)) = 0
          AND EXTRACT(HOUR FROM (now() AT TIME ZONE p.timezone)) BETWEEN 17 AND 18
        ELSE EXTRACT(DOW FROM (now() AT TIME ZONE 'UTC')) = 0
          AND EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) = 23
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.push_notification_log pnl
      WHERE pnl.feature = 'weekly_recap'
        AND pnl.user_id = p.id
        AND pnl.status IN ('sent', 'delivered')
        AND pnl.sent_at >= now() - interval '6 days'
    )
  ),
  activity AS (
    SELECT
      u.user_id,
      (
        SELECT count(*) FROM public.user_movies um
        WHERE um.user_id = u.user_id
          AND um.status = 'watched'
          AND um.watched_at >= now() - interval '7 days'
      ) AS films_watched,
      (
        SELECT count(*) FROM public.user_movies um
        WHERE um.user_id = u.user_id
          AND um.added_at >= now() - interval '7 days'
      ) AS watchlist_adds,
      (
        SELECT count(*) FROM public.user_episode_watches uew
        WHERE uew.user_id = u.user_id
          AND uew.created_at >= now() - interval '7 days'
      ) AS episodes_logged,
      (
        SELECT count(*) FROM public.first_takes ft
        WHERE ft.user_id = u.user_id
          AND ft.created_at >= now() - interval '7 days'
      ) AS first_takes_count,
      (
        SELECT count(*) FROM public.reviews r
        WHERE r.user_id = u.user_id
          AND r.created_at >= now() - interval '7 days'
      ) AS reviews_count,
      (
        SELECT count(*) FROM public.review_comments rc
        WHERE rc.user_id = u.user_id
          AND rc.created_at >= now() - interval '7 days'
      ) AS comments_created,
      (
        SELECT count(*) FROM public.ticket_scans ts
        WHERE ts.user_id = u.user_id
          AND ts.created_at >= now() - interval '7 days'
      ) AS scans,
      (
        SELECT g.name
        FROM public.user_movies um
        CROSS JOIN LATERAL unnest(um.genre_ids) AS genre_id
        JOIN public.genres g ON g.id = genre_id
        WHERE um.user_id = u.user_id
          AND (
            um.added_at >= now() - interval '7 days'
            OR um.watched_at >= now() - interval '7 days'
          )
        GROUP BY g.name
        ORDER BY count(*) DESC, g.name ASC
        LIMIT 1
      ) AS top_genre
    FROM eligible_users u
  )
  SELECT a.user_id, a.films_watched, a.episodes_logged, a.first_takes_count, a.reviews_count, a.top_genre
  FROM activity a
  WHERE a.films_watched > 0
     OR a.watchlist_adds > 0
     OR a.episodes_logged > 0
     OR a.first_takes_count > 0
     OR a.reviews_count > 0
     OR a.comments_created > 0
     OR a.scans > 0;
$$;

ALTER FUNCTION "public"."get_weekly_recap_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_weekly_recap_candidates"() IS 'Returns per-user weekly activity aggregates for users with a push token, in their Sunday 5-7pm local window (or the Sunday 23:00 UTC fallback for null timezone), with >=1 qualifying activity in the trailing 7 days, and no weekly_recap push sent in the last 6 days. Internal use only — called by send-weekly-recap edge function.';

REVOKE ALL ON FUNCTION "public"."get_weekly_recap_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_weekly_recap_candidates"() TO "service_role";

-- ===== from supabase/migrations/20260707150200_streak_at_risk_candidates_rpc.sql (dedup predicate fixed) =====
CREATE OR REPLACE FUNCTION "public"."get_streak_at_risk_candidates"()
    RETURNS TABLE("user_id" "uuid", "current_streak" integer, "rain_check_pending" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH base AS (
    SELECT
      s.user_id,
      s.current_streak,
      s.last_activity_date,
      s.rain_checks,
      (p.timezone IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
      )) AS is_valid_tz,
      CASE
        WHEN p.timezone IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
        ) THEN p.timezone
        ELSE 'UTC'
      END AS eff_tz
    FROM public.user_streaks s
    JOIN public.profiles p ON p.id = s.user_id
    JOIN public.push_tokens pt ON pt.user_id = s.user_id
    WHERE s.current_streak >= 3
      AND s.last_activity_date IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = s.user_id
          AND np.feature = 'streak_at_risk'
          AND np.enabled = true
      )
  ),
  windowed AS (
    SELECT
      b.user_id,
      b.current_streak,
      b.last_activity_date,
      b.rain_checks,
      b.is_valid_tz,
      (now() AT TIME ZONE b.eff_tz)::date AS local_today,
      EXTRACT(HOUR FROM (now() AT TIME ZONE b.eff_tz)) AS local_hour
    FROM base b
  )
  SELECT DISTINCT
    w.user_id,
    w.current_streak,
    ((w.local_today - w.last_activity_date) > 1) AS rain_check_pending
  FROM windowed w
  WHERE w.last_activity_date < w.local_today
    AND ((w.local_today - w.last_activity_date) - 1) <= w.rain_checks
    AND (
      (w.is_valid_tz AND w.local_hour BETWEEN 17 AND 18)
      OR (NOT w.is_valid_tz AND w.local_hour = 23)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_activity_days uad
      WHERE uad.user_id = w.user_id AND uad.local_date = w.local_today
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.push_notification_log pnl
      WHERE pnl.feature = 'streak_at_risk'
        AND pnl.user_id = w.user_id
        AND pnl.status IN ('sent', 'delivered')
        AND pnl.sent_at >= now() - interval '22 hours'
    );
$$;

ALTER FUNCTION "public"."get_streak_at_risk_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_streak_at_risk_candidates"() IS 'Returns opted-in users (explicit streak_at_risk pref enabled) with a push token, a current streak >= 3 still continuable today, no activity yet today, in their 5-7pm local window (or 23:00 UTC fallback), not already sent today. Internal use only — called by send-streak-at-risk edge function. PS-15 PR 3.';

REVOKE ALL ON FUNCTION "public"."get_streak_at_risk_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streak_at_risk_candidates"() TO "service_role";

-- ── reconcile_user_streaks(): nightly honesty pass ───────────────────────────
-- Cheap single-statement sweep: zero out streaks that are definitively dead as
-- of the user's local today — i.e. even acting right now couldn't bridge the
-- gap ((local_today - last_activity_date) - 1 > rain_checks). This keeps the
-- card honest for users who never open the app, WITHOUT recomputing per read.
-- Uses the exact same liveness criterion as record_user_activity's reset branch,
-- so a reconciled (zeroed) streak and a live one never disagree. HQ schedules
-- this on a daily cron in DB at deploy (schedule lives in the DB vault, not git).
CREATE OR REPLACE FUNCTION "public"."reconcile_user_streaks"()
    RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH dead AS (
    UPDATE public.user_streaks s
    SET current_streak = 0, updated_at = now()
    FROM (
      SELECT
        p.id AS user_id,
        (now() AT TIME ZONE (
          CASE
            WHEN p.timezone IS NOT NULL AND EXISTS (
              SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
            ) THEN p.timezone
            ELSE 'UTC'
          END
        ))::date AS local_today
      FROM public.profiles p
    ) d
    WHERE d.user_id = s.user_id
      AND s.current_streak > 0
      AND s.last_activity_date IS NOT NULL
      AND s.last_activity_date < d.local_today
      AND ((d.local_today - s.last_activity_date) - 1) > s.rain_checks
    RETURNING 1
  )
  SELECT count(*)::integer FROM dead;
$$;

ALTER FUNCTION "public"."reconcile_user_streaks"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reconcile_user_streaks"() IS 'Zeroes streaks that can no longer be continued as of the user local today (same criterion as record_user_activity''s reset branch). Returns the count broken. Internal use only — daily cron. PS-15 PR 3.';

REVOKE ALL ON FUNCTION "public"."reconcile_user_streaks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_user_streaks"() TO "service_role";

