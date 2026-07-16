-- TV Time import deck (PR 4) — follow-up: keep quiet ratings out of the weekly
-- recap, and correct the reviews.source column comment.
--
-- Two source-blind consumers slipped past the 20260715090000 sweep:
--   1. get_weekly_recap_candidates.reviews_count counted ALL reviews in the
--      trailing 7 days, so inking N stubs would make Sunday's recap claim
--      "N reviews" this week. (The achievements Critic count is fixed in the
--      check-achievements edge fn in the same PR.)
--   2. The 20260715090000 column comment wrongly implied quiet ratings feed
--      get_rating_personality. They do not — that RPC (and the personality
--      hook's own read) aggregate first_takes.rating, NOT reviews. So NEITHER
--      organic review-ratings NOR quiet deck ratings feed rating personality;
--      quiet ratings have exact stats PARITY with organic review-ratings. The
--      real per-title value is on the movie/show detail ("your rating").
--
-- This CREATE OR REPLACE is the current deployed definition
-- (20260714120000_tvtime_import_source_provenance.sql) with a single change:
-- `AND r.source = 'manual'` added to the reviews_count subquery. Every other
-- signal already carries its source filter from #683. DEFINER / search_path /
-- grants posture preserved verbatim.

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

COMMENT ON FUNCTION "public"."get_weekly_recap_candidates"() IS 'Returns per-user weekly activity aggregates for users with a push token, in their Sunday 5-7pm local window (or the Sunday 23:00 UTC fallback for null timezone), with >=1 qualifying activity in the trailing 7 days, and no weekly_recap push sent in the last 6 days. Excludes source=tvtime_import rows (movies, episodes) AND source<>manual reviews so imported history / quiet deck ratings never trigger a recap. Internal use only — called by send-weekly-recap edge function.';

REVOKE ALL ON FUNCTION "public"."get_weekly_recap_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_weekly_recap_candidates"() TO "service_role";

-- Correct the deployed reviews.source comment (20260715090000 overclaimed that
-- quiet ratings feed rating personality — they don't; parity, not participation).
COMMENT ON COLUMN "public"."reviews"."source" IS
  'Provenance of the rating/review. ''manual'' = organically authored in-app '
  '(fans out follower notifications + shows in the feed). ''tvtime_import'' = '
  'a quiet rating inked from the TV Time import deck: excluded from the '
  'notify_followers_on_full_review fan-out, the activity feed, the profile '
  'Reviews tab/count, the weekly-recap reviews_count, and the Critic '
  'achievement count. Rating personality reads first_takes (not reviews), so '
  'quiet ratings have exact stats PARITY with organic review-ratings; their '
  'per-title value shows as "your rating" on the movie/show detail.';
