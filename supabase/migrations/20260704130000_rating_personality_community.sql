-- Rating Personality (stats "Going deeper" deep-dive, vault PS-22) — the
-- community aggregate layer.
--
-- The "crowd" for Rating Personality is the PocketStubs community's OWN ratings
-- (NOT TMDB): we aggregate `first_takes.rating` (1–10 scale) over all PUBLIC
-- movie takes. Movies only — TV shows (media_type = 'tv_show') are excluded.
--
-- Privacy model:
--   * Only rows with visibility = 'public' are aggregated. The visibility
--     column is CHECK-constrained to ('public','followers_only','private')
--     (see 20260525063629_remote_schema.sql:1674); only 'public' is treated as
--     public here. A user's own public rating counts toward the community
--     aggregates too — that's expected and harmless.
--   * The function NEVER returns individual rows or user identities. It returns
--     global aggregates + per-title averages, and per-title data is only
--     emitted for titles with >= 2 distinct raters (a meaningfulness +
--     k-anonymity floor). Titles with a single rater are omitted entirely.
--
-- Security:
--   * SECURITY DEFINER + pinned search_path so it can read across users'
--     public takes regardless of the caller's RLS. Following the July 2026
--     security-audit lane (20260703093000), a client-called definer RPC binds
--     to auth.uid() and ignores the caller-supplied p_user_id, so it can't be
--     used as an IDOR oracle for *which titles another user rated*. p_user_id
--     is kept in the signature for client/type-gen compatibility but is unused.
--   * EXECUTE granted to `authenticated` only; revoked from `anon`.

CREATE OR REPLACE FUNCTION public.get_rating_personality(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();  -- bind to the caller; p_user_id is ignored
  v_community_avg numeric;
  v_community_dist int[];
  v_per_title json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Global PocketStubs average over all PUBLIC movie ratings.
  SELECT round(avg(rating)::numeric, 2)
    INTO v_community_avg
  FROM first_takes
  WHERE visibility = 'public'
    AND media_type <> 'tv_show'
    AND rating IS NOT NULL;

  -- Global distribution histogram, length 10, bucketed by round(rating) and
  -- clamped into 1..10. LEFT JOIN off generate_series guarantees a value for
  -- every score even when a bucket is empty (0), so the array is always len 10
  -- in score order 1→10.
  SELECT array_agg(COALESCE(d.cnt, 0)::int ORDER BY g.bucket)
    INTO v_community_dist
  FROM generate_series(1, 10) AS g(bucket)
  LEFT JOIN (
    SELECT LEAST(10, GREATEST(1, round(rating)::int)) AS bucket, count(*) AS cnt
    FROM first_takes
    WHERE visibility = 'public'
      AND media_type <> 'tv_show'
      AND rating IS NOT NULL
    GROUP BY 1
  ) d ON d.bucket = g.bucket;

  -- Per-title community average for the titles THIS user has rated, computed
  -- over all PUBLIC raters of that title, but only where >= 2 distinct raters
  -- exist (privacy + consensus floor). The user's rated-title set is read via
  -- the definer (their own rows) regardless of visibility; the community avg
  -- itself only ever counts PUBLIC ratings. No user_id / identity is returned.
  SELECT COALESCE(json_agg(json_build_object(
           'tmdb_id', t.tmdb_id,
           'community_avg', t.community_avg,
           'rater_count', t.rater_count
         )), '[]'::json)
    INTO v_per_title
  FROM (
    SELECT ft.tmdb_id,
           round(avg(ft.rating)::numeric, 2) AS community_avg,
           count(DISTINCT ft.user_id) AS rater_count
    FROM first_takes ft
    WHERE ft.visibility = 'public'
      AND ft.media_type <> 'tv_show'
      AND ft.rating IS NOT NULL
      AND ft.tmdb_id IN (
        SELECT DISTINCT tmdb_id
        FROM first_takes
        WHERE user_id = v_user_id
          AND media_type <> 'tv_show'
          AND rating IS NOT NULL
      )
    GROUP BY ft.tmdb_id
    HAVING count(DISTINCT ft.user_id) >= 2
  ) t;

  RETURN json_build_object(
    'community_avg', v_community_avg,
    'community_dist', v_community_dist,
    'per_title', v_per_title
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_rating_personality(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_rating_personality(uuid) TO authenticated;
