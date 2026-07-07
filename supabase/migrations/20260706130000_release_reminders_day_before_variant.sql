-- PS-15 PR 1 — component C: "opens tomorrow" day-before nudge.
--
-- Extends get_pending_release_reminders() with a p_days_before parameter
-- (0 = day-of, existing behavior; 1 = the new day-before variant) instead of
-- duplicating the function. Because adding a parameter changes the function's
-- signature, CREATE OR REPLACE cannot reuse the existing zero-arg overload
-- in place (it would coexist as an ambiguous second overload for a
-- zero-argument call) — DROP + CREATE instead.
--
-- Dedup: still keyed off push_notification_log with feature='release_reminders'
-- (reuses the existing `release_reminders` preference — see brief PS-15 PR 1),
-- but now also disambiguates by a `variant` value written into `data`. Rows
-- logged before this migration have no `data.variant` key; COALESCE(...,
-- 'day_of') treats that historical NULL as 'day_of' so already-sent day-of
-- reminders are NOT re-sent post-migration. New day_before sends always write
-- an explicit variant, so they're never confused with day_of.
DROP FUNCTION IF EXISTS "public"."get_pending_release_reminders"();

CREATE FUNCTION "public"."get_pending_release_reminders"("p_days_before" integer DEFAULT 0)
    RETURNS TABLE("user_id" "uuid", "tmdb_id" integer, "category" "text", "title" "text", "variant" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.category,
    MIN(eligible.title) AS title,
    eligible.variant
  FROM (
    SELECT
      um.user_id,
      rc.tmdb_id,
      CASE
        WHEN rc.release_type IN (1, 2, 3) THEN 'theatrical'
        ELSE 'streaming'
      END AS category,
      rc.title,
      CASE WHEN p_days_before = 0 THEN 'day_of' ELSE 'day_before' END AS variant
    FROM public.release_calendar rc
    JOIN public.user_movies um
      ON um.tmdb_id = rc.tmdb_id
      AND um.status = 'watchlist'
    WHERE rc.region = 'US'
      AND rc.release_date = CURRENT_DATE + p_days_before
      AND rc.release_type IN (1, 2, 3, 6)
      AND rc.title IS NOT NULL
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.push_notification_log pnl
    WHERE pnl.feature = 'release_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND pnl.data->>'category' = eligible.category
      AND COALESCE(pnl.data->>'variant', 'day_of') = eligible.variant
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.category, eligible.variant;
$$;

ALTER FUNCTION "public"."get_pending_release_reminders"(integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_pending_release_reminders"(integer) IS 'Returns watchlisted movies releasing today (p_days_before=0) or tomorrow (p_days_before=1) in US region, deduped against push_notification_log per (tmdb_id, category, variant). Internal use only — called by send-release-reminders edge function.';

REVOKE ALL ON FUNCTION "public"."get_pending_release_reminders"(integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_release_reminders"(integer) TO "service_role";
