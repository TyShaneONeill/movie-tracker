-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role (required by Supabase)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create cleanup function with secure search_path
CREATE OR REPLACE FUNCTION public.cleanup_stale_movie_cache()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.movies m
  WHERE m.tmdb_fetched_at < NOW() - INTERVAL '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_movies um WHERE um.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_movie_likes uml WHERE uml.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.list_movies lm WHERE lm.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.first_takes ft WHERE ft.tmdb_id = m.tmdb_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.theater_visits tv WHERE tv.tmdb_id = m.tmdb_id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE LOG '[movies-cache-cleanup] Deleted % stale movie cache entries', deleted_count;

  RETURN deleted_count;
END;
$$;

-- Schedule daily cleanup at 3:00 AM UTC
SELECT cron.schedule(
  'cleanup-stale-movie-cache',
  '0 3 * * *',
  $$SELECT public.cleanup_stale_movie_cache()$$
);
