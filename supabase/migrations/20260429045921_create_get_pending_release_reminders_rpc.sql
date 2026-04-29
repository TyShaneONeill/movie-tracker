-- supabase/migrations/20260429045921_create_get_pending_release_reminders_rpc.sql
-- Returns watchlisted movies whose release_date is today (US region) and which
-- the user has not yet been notified about for the same (tmdb_id, category).
-- Categories: 'theatrical' (release_type 1,2,3), 'streaming' (release_type 6).
-- SECURITY DEFINER + GRANT-to-service_role-only so only the daily cron can call it.

CREATE OR REPLACE FUNCTION public.get_pending_release_reminders()
RETURNS TABLE (
  user_id UUID,
  tmdb_id INTEGER,
  category TEXT,
  title TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.category,
    MIN(eligible.title) AS title
  FROM (
    SELECT
      um.user_id,
      rc.tmdb_id,
      CASE
        WHEN rc.release_type IN (1, 2, 3) THEN 'theatrical'
        ELSE 'streaming'
      END AS category,
      rc.title
    FROM release_calendar rc
    JOIN user_movies um
      ON um.tmdb_id = rc.tmdb_id
      AND um.status = 'watchlist'
    WHERE rc.region = 'US'
      AND rc.release_date = CURRENT_DATE
      AND rc.release_type IN (1, 2, 3, 6)
      AND rc.title IS NOT NULL
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM push_notification_log pnl
    WHERE pnl.feature = 'release_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND pnl.data->>'category' = eligible.category
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.category;
$$;

-- REVOKE FROM PUBLIC covers future roles; also explicitly revoke from Supabase
-- default roles that inherit PUBLIC grants at function-creation time.
REVOKE EXECUTE ON FUNCTION public.get_pending_release_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_release_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_release_reminders() TO service_role;

COMMENT ON FUNCTION public.get_pending_release_reminders() IS
  'Returns watchlisted movies releasing today in US region, deduped against push_notification_log. Internal use only — called by send-release-reminders edge function.';
