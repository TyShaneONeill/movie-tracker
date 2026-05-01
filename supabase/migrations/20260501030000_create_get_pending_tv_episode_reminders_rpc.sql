-- supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql
-- Returns episodes airing today for TV shows users have status='watching',
-- deduped against push_notification_log so each user gets at most one push
-- per (tmdb_id, season, episode) tuple, ever.
-- SECURITY DEFINER + GRANT-to-service_role-only so only the daily cron can call it.

CREATE OR REPLACE FUNCTION public.get_pending_tv_episode_reminders()
RETURNS TABLE (
  user_id UUID,
  tmdb_id INTEGER,
  season_number INTEGER,
  episode_number INTEGER,
  show_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.season_number,
    eligible.episode_number,
    MIN(eligible.show_name) AS show_name
  FROM (
    SELECT
      uts.user_id,
      uts.tmdb_id,
      tse.season_number,
      tse.episode_number,
      uts.name AS show_name
    FROM public.tv_show_episodes tse
    JOIN public.user_tv_shows uts
      ON uts.tmdb_id = tse.tmdb_show_id
      AND uts.status = 'watching'
    WHERE tse.air_date IS NOT NULL
      AND tse.air_date = CURRENT_DATE
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.push_notification_log pnl
    WHERE pnl.feature = 'tv_episode_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND (pnl.data->>'season')::int = eligible.season_number
      AND (pnl.data->>'episode')::int = eligible.episode_number
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.season_number, eligible.episode_number;
$$;

-- REVOKE FROM PUBLIC covers future roles; also explicitly revoke from Supabase
-- default roles that inherit PUBLIC grants at function-creation time.
REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() TO service_role;

COMMENT ON FUNCTION public.get_pending_tv_episode_reminders() IS
  'Returns episodes airing today for shows users have status=watching, deduped against push_notification_log. Internal use only — called by send-tv-episode-reminders edge function.';
