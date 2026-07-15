-- TV Time import (PR 2) — bulk-write provenance.
--
-- Adds a `source` column to the two tables the importer writes to so that
-- imported historical rows can be told apart from organic activity. This is
-- load-bearing for the weekly-recap push: user_movies.added_at and
-- user_episode_watches.created_at both DEFAULT now(), so a backfill of years
-- of TV Time history would otherwise land with "this week" timestamps and
-- spam every importing user with a bogus "Your week in film" recap. The
-- get_weekly_recap_candidates RPC below is updated (CREATE OR REPLACE) to
-- exclude source='tvtime_import' rows from every activity signal it counts.
--
-- watched_at (movies) and watched_at (episodes) carry the real historical
-- date from the payload where TV Time provides one, but the recap's movie and
-- episode signals key off added_at / created_at (which we cannot backdate
-- without breaking the "recently added" surfaces), hence the source filter.

-- ---------------------------------------------------------------------------
-- 1. Provenance columns (NOT NULL DEFAULT 'manual' — every existing row is
--    organic; only the import path writes 'tvtime_import').
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."user_movies"
  ADD COLUMN "source" "text" NOT NULL DEFAULT 'manual'
  CHECK ("source" IN ('manual', 'tvtime_import'));

ALTER TABLE "public"."user_episode_watches"
  ADD COLUMN "source" "text" NOT NULL DEFAULT 'manual'
  CHECK ("source" IN ('manual', 'tvtime_import'));

-- ---------------------------------------------------------------------------
-- 2. Weekly-recap candidates RPC — exclude imported rows from every signal.
--
-- Identical to 20260707100000_weekly_recap_candidates_rpc.sql except each
-- user_movies / user_episode_watches subquery now adds
-- `AND <alias>.source <> 'tvtime_import'`. Filtering ALL of them (not just
-- the two headline counts) matters: watchlist_adds and top_genre both key off
-- added_at (= import time) and would pollute the recap's genre pick and the
-- ">=1 qualifying activity" gate. source is NOT NULL so `<> 'tvtime_import'`
-- never drops a row on a NULL comparison.
--
-- SECURITY DEFINER / SET search_path = '' / REVOKE-PUBLIC-GRANT-service_role
-- posture is preserved verbatim.
-- ---------------------------------------------------------------------------
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
        AND pnl.status = 'sent'
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
          AND um.source <> 'tvtime_import'
      ) AS films_watched,
      (
        SELECT count(*) FROM public.user_movies um
        WHERE um.user_id = u.user_id
          AND um.added_at >= now() - interval '7 days'
          AND um.source <> 'tvtime_import'
      ) AS watchlist_adds,
      (
        SELECT count(*) FROM public.user_episode_watches uew
        WHERE uew.user_id = u.user_id
          AND uew.created_at >= now() - interval '7 days'
          AND uew.source <> 'tvtime_import'
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
          AND um.source <> 'tvtime_import'
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

COMMENT ON FUNCTION "public"."get_weekly_recap_candidates"() IS 'Returns per-user weekly activity aggregates for users with a push token, in their Sunday 5-7pm local window (or the Sunday 23:00 UTC fallback for null timezone), with >=1 qualifying activity in the trailing 7 days, and no weekly_recap push sent in the last 6 days. Excludes source=tvtime_import rows so imported history never triggers a recap. Internal use only — called by send-weekly-recap edge function.';

REVOKE ALL ON FUNCTION "public"."get_weekly_recap_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_weekly_recap_candidates"() TO "service_role";
