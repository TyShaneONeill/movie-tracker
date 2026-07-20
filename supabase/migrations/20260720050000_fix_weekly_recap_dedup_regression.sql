-- Fix weekly-recap duplicate sends: restore the terminal-success dedup set.
--
-- BUG (production 2026-07-19, second live recap Sunday): real user
-- adnanalfarsi@icloud.com received the weekly recap TWICE — once at the 17:00
-- tick and again at the 18:00 tick of his Asia/Muscat 5-7pm window (test acct
-- g@g.g fanned out worse: 4 push tokens x 2 ticks x two windows after its
-- profile timezone was toggled Asia/Shanghai -> America/Los_Angeles mid-day).
--
-- ROOT CAUSE: a regression, not a new bug. 20260713060000 fixed the dedup
-- predicate in get_weekly_recap_candidates from `pnl.status = 'sent'` to
-- `pnl.status IN ('sent','delivered')`, because check-push-receipts promotes
-- sent -> 'delivered' within ~15 min and any send window longer than receipt
-- latency (the recap window is 2 hourly ticks) therefore re-qualifies the user
-- on the next tick. But 20260714120000 (TV Time import provenance, #683)
-- rebuilt this function via CREATE OR REPLACE starting from the STALE
-- 20260707100000 base — which still had `= 'sent'` — silently reverting the
-- 13060000 fix. 20260716100000 (quiet-ratings) carried the regression forward.
-- day2_bridge and streak_at_risk were NOT rebuilt post-13060000 and still hold
-- the correct predicate in prod (verified 2026-07-20).
--
-- FIX: restore `status IN ('sent','delivered')`. 'failed' still allows a retry
-- within the window, preserving the original intent (a transient Expo failure
-- must not burn the week's slot). This is the byte-for-byte
-- 20260716100000 definition (all source<>'tvtime_import' / source='manual'
-- content filters preserved) with only that one predicate changed. DEFINER /
-- search_path / grants posture preserved verbatim.
--
-- NOTE (not a bug): the "fired on the wrong day" report was a false alarm.
-- 2026-07-19 is a SUNDAY (confirmed via Postgres to_char + system date); every
-- send landed in the user's local Sunday 17:00-18:59 window. The DOW=0 (Sunday)
-- predicate is correct and is unchanged here.
--
-- Lesson (re-banked): a CREATE OR REPLACE that starts from an origin migration
-- rather than the CURRENT deployed definition silently reverts every fix
-- applied in between. Always diff against pg_get_functiondef before replacing.

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
          AND r.source = 'manual'
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

COMMENT ON FUNCTION "public"."get_weekly_recap_candidates"() IS 'Returns per-user weekly activity aggregates for users with a push token, in their Sunday 5-7pm local window (or the Sunday 23:00 UTC fallback for null timezone), with >=1 qualifying activity in the trailing 7 days, and no weekly_recap push already sent OR delivered in the last 6 days (dedup matches the terminal-success SET, not only ''sent'', because check-push-receipts promotes sent->delivered mid-window). Excludes source=tvtime_import rows (movies, episodes) AND source<>manual reviews so imported history / quiet deck ratings never trigger a recap. Internal use only — called by send-weekly-recap edge function.';

REVOKE ALL ON FUNCTION "public"."get_weekly_recap_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_weekly_recap_candidates"() TO "service_role";
