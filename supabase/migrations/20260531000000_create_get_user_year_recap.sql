-- "Your Year at the Movies" recap aggregation.
-- One JSON payload per (user, year), bucketed in the caller's local timezone.
-- SECURITY DEFINER + search_path='' per project convention; filters on auth.uid().
--
-- DEVIATION FROM ORIGINAL SPEC: runtime_minutes does NOT live on public.user_movies.
-- It lives on public.movies (the TMDB metadata cache, keyed by a UNIQUE tmdb_id).
-- We LEFT JOIN public.movies on tmdb_id to source runtime so hours_watched aggregates
-- correctly. theater_visits.show_date is type `date`, so theaters are year-filtered with a
-- plain EXTRACT(YEAR ...) (no AT TIME ZONE).

CREATE OR REPLACE FUNCTION public.get_user_year_recap(
  p_year int,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tz  text := p_timezone;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_user_year_recap: not authenticated';
  END IF;

  IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;

  WITH movies AS (
    SELECT um.tmdb_id, um.title, um.genre_ids, m.runtime_minutes, um.watch_format,
           um.theater_chain,
           (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz) AS local_ts
    FROM public.user_movies um
    LEFT JOIN public.movies m ON m.tmdb_id = um.tmdb_id
    WHERE um.user_id = v_uid
      AND um.status = 'watched'
      AND EXTRACT(YEAR FROM (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz)) = p_year
  ),
  genre_counts AS (
    SELECT gid AS genre_id, COUNT(*)::int AS count
    FROM movies m, LATERAL unnest(COALESCE(m.genre_ids, ARRAY[]::integer[])) AS gid
    GROUP BY gid
    ORDER BY count DESC, genre_id ASC
    LIMIT 5
  ),
  episodes AS (
    SELECT ew.episode_runtime
    FROM public.user_episode_watches ew
    WHERE ew.user_id = v_uid
      AND ew.watched_at IS NOT NULL
      AND EXTRACT(YEAR FROM (ew.watched_at AT TIME ZONE v_tz)) = p_year
  ),
  movie_formats AS (
    SELECT lower(m.watch_format) AS format
    FROM movies m
    WHERE m.watch_format IS NOT NULL AND lower(m.watch_format) <> 'standard'
  ),
  theater_rows AS (
    SELECT tv.theater_name, tv.theater_chain, lower(tv.format) AS format
    FROM public.theater_visits tv
    WHERE tv.user_id = v_uid
      AND tv.show_date IS NOT NULL
      AND EXTRACT(YEAR FROM tv.show_date) = p_year   -- show_date is type `date` (see Step 1)
  ),
  theater_formats AS (
    SELECT format FROM theater_rows
    WHERE format IS NOT NULL AND format <> 'standard'
  ),
  all_formats AS (
    SELECT format, COUNT(*)::int AS count
    FROM (SELECT format FROM movie_formats UNION ALL SELECT format FROM theater_formats) f
    GROUP BY format
    ORDER BY count DESC, format ASC
  ),
  bookends AS (
    SELECT
      (SELECT to_jsonb(j) FROM (
         SELECT title, local_ts::date AS date FROM movies ORDER BY local_ts ASC, title ASC LIMIT 1
       ) j) AS first_film,
      (SELECT to_jsonb(j) FROM (
         SELECT title, local_ts::date AS date FROM movies ORDER BY local_ts DESC, title ASC LIMIT 1
       ) j) AS last_film
  ),
  years AS (
    SELECT DISTINCT EXTRACT(YEAR FROM (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz))::int AS y
    FROM public.user_movies um
    WHERE um.user_id = v_uid AND um.status = 'watched'
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'films_seen', (SELECT COUNT(*)::int FROM movies),
    'hours_watched', (SELECT COALESCE(SUM(runtime_minutes), 0)::numeric FROM movies),
    'genres', (SELECT COALESCE(jsonb_agg(jsonb_build_object('genre_id', genre_id, 'count', count)), '[]'::jsonb) FROM genre_counts),
    'tv_shows', (
      SELECT COUNT(DISTINCT ew.tmdb_show_id)::int
      FROM public.user_episode_watches ew
      WHERE ew.user_id = v_uid AND ew.watched_at IS NOT NULL
        AND EXTRACT(YEAR FROM (ew.watched_at AT TIME ZONE v_tz)) = p_year
    ),
    'episodes_watched', (SELECT COUNT(*)::int FROM episodes),
    'tv_hours', (SELECT COALESCE(SUM(episode_runtime), 0)::numeric FROM episodes),
    'formats', (SELECT COALESCE(jsonb_agg(jsonb_build_object('format', format, 'count', count)), '[]'::jsonb) FROM all_formats),
    'theaters_count', (SELECT COUNT(DISTINCT theater_name)::int FROM theater_rows WHERE theater_name IS NOT NULL),
    'chains_count', (SELECT COUNT(DISTINCT theater_chain)::int FROM theater_rows WHERE theater_chain IS NOT NULL),
    'first_film', (SELECT COALESCE(first_film, 'null'::jsonb) FROM bookends),
    'last_film', (SELECT COALESCE(last_film, 'null'::jsonb) FROM bookends),
    'available_years', (SELECT COALESCE(jsonb_agg(y ORDER BY y DESC), '[]'::jsonb) FROM years)
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_user_year_recap(int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_year_recap(int, text) TO authenticated;
COMMENT ON FUNCTION public.get_user_year_recap(int, text) IS
  'Year-in-review aggregation for the Year at the Movies recap. Scoped to auth.uid(); buckets dates in p_timezone (UTC fallback).';
