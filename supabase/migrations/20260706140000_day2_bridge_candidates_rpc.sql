-- PS-15 PR 1 — component B: day-2 bridge push, the metric-mover for
-- D1->D2 return of new external cohorts.
--
-- Audience: profiles created 24-48h ago, with at least one push token, in
-- their 5-7pm local-time window (via profiles.timezone, PR 0) — or, for
-- users with no synced timezone yet, the 23:00 UTC fallback tick — and never
-- sent a day2_bridge push before (one send per user, ever).
--
-- No preference filter here by design: mirrors get_pending_release_reminders,
-- which also does not check notification_preferences directly — that check
-- happens downstream in send-push-notification via the `feature` field
-- (absent row = enabled, matching NOTIFICATION_FEATURE_DEFAULTS.day2_bridge).
--
-- Personalization (nearest-release / watchlist-anchored / generic copy) is
-- computed in the edge function from a separate query, not here — this RPC
-- only decides *who* is eligible right now.
CREATE OR REPLACE FUNCTION "public"."get_pending_day2_bridge_candidates"()
    RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT DISTINCT p.id AS user_id
  FROM public.profiles p
  JOIN public.push_tokens pt ON pt.user_id = p.id
  WHERE p.created_at <= now() - interval '24 hours'
    AND p.created_at > now() - interval '48 hours'
    AND (
      (p.timezone IS NOT NULL
        AND EXTRACT(HOUR FROM (now() AT TIME ZONE p.timezone)) BETWEEN 17 AND 18)
      OR
      (p.timezone IS NULL
        AND EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) = 23)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.push_notification_log pnl
      WHERE pnl.feature = 'day2_bridge'
        AND pnl.user_id = p.id
    );
$$;

ALTER FUNCTION "public"."get_pending_day2_bridge_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_pending_day2_bridge_candidates"() IS 'Returns users whose profile is 24-48h old, has a push token, is in their 5-7pm local window (or the 23:00 UTC fallback for null timezone), and has never received a day2_bridge push. Internal use only — called by send-day2-bridge edge function.';

REVOKE ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() TO "service_role";
