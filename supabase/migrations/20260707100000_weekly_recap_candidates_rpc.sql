-- PS-15 PR 2 — component A: weekly recap push ("Your week in film"), the
-- cheapest retention hook (Strava/Apple Fitness-style digest). Ships DARK in
-- this PR: no cron scheduling, no migration application — HQ schedules the
-- cron in DB after the DRAFT copy in weekly-recap-copy.ts clears Content
-- Queue review.
--
-- Audience: users with a push token, in their Sunday 5-7pm local-time window
-- (via profiles.timezone, PR 0) — or, for users with no synced timezone yet,
-- the Sunday 23:00 UTC fallback tick — with >=1 qualifying activity in the
-- trailing 7 days, and not already sent a weekly_recap push in the last 6
-- days (one send per user per calendar week).
--
-- Qualifying activity (any of): watched a movie, added to watchlist, logged
-- a TV episode, created a first take/review, commented, or scanned a ticket.
-- "Rated" is not a separate signal here — ratings live on first_takes.rating
-- / reviews.rating, so a rating always co-occurs with a first-take/review
-- creation already counted in first_takes_count/reviews_count.
--
-- episodes_logged counts user_episode_watches rows (watch-events), not
-- distinct episodes — a re-watch logged this week counts again. Intentional:
-- "logged" tracks activity, matching total_episodes_watched's semantics in
-- get_user_stats_summary, not a unique-episode tally.
--
-- first_takes_count and reviews_count are returned separately (not summed)
-- so the edge function can render "N first takes" / "N reviews" copy
-- correctly for a reviews-only user — a combined count previously
-- mislabeled every candidate's activity as "first takes" regardless of
-- which one they actually created (code review, 2026-07-07, pre-apply).
--
-- Mirrors get_pending_day2_bridge_candidates's hardening pattern exactly
-- (20260706140000_day2_bridge_candidates_rpc.sql):
--   1. Dedup requires pnl.status = 'sent' — a transient Expo delivery
--      failure (status='failed') must not permanently burn the week's slot.
--   2. The local-time predicate is a CASE, not a plain OR/AND — Postgres does
--      not guarantee short-circuit evaluation, so `now() AT TIME ZONE
--      p.timezone` could still be evaluated (and raise) for a malformed/
--      non-IANA timezone string if it weren't gated behind a CASE WHEN. The
--      pg_catalog.pg_timezone_names EXISTS check guards validity before
--      AT TIME ZONE ever touches the value.
--   3. SECURITY DEFINER with SET search_path = '' and every relation
--      schema-qualified (including pg_catalog.pg_timezone_names), so the
--      function can't be tricked by a caller-controlled search_path.
--      REVOKE PUBLIC / GRANT service_role only — internal use, called by the
--      send-weekly-recap edge function alone.
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
