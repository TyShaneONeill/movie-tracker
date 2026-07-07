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
--
-- Code-review fixes (2026-07-06, pre-apply — migration was still unapplied):
--   1. Dedup now requires pnl.status = 'sent'. Without this, a transient
--      Expo delivery failure (status='failed') would permanently burn the
--      one-shot bridge for that user with no retry. A 'sent' log row still
--      blocks forever, matching "one send per user, ever"; the user's 24-48h
--      eligibility window self-limits how many retry ticks a failure gets.
--   2. The local-time predicate is now a CASE, not a plain OR. Postgres does
--      NOT guarantee short-circuit evaluation of OR — `now() AT TIME ZONE
--      p.timezone` could still be evaluated (and raise) for a row where
--      p.timezone is non-NULL but malformed/non-IANA, aborting the whole
--      set-returning query (no per-row isolation in a SQL-language RPC).
--      CASE WHEN guarantees the ELSE branch only runs when the WHEN is
--      false, and the pg_timezone_names EXISTS check guards against a bad
--      timezone string before AT TIME ZONE ever touches it.
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
      CASE
        WHEN p.timezone IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
          )
        THEN EXTRACT(HOUR FROM (now() AT TIME ZONE p.timezone)) BETWEEN 17 AND 18
        ELSE EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC')) = 23
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.push_notification_log pnl
      WHERE pnl.feature = 'day2_bridge'
        AND pnl.user_id = p.id
        AND pnl.status = 'sent'
    );
$$;

ALTER FUNCTION "public"."get_pending_day2_bridge_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_pending_day2_bridge_candidates"() IS 'Returns users whose profile is 24-48h old, has a push token, is in their 5-7pm local window (or the 23:00 UTC fallback for null timezone), and has never received a day2_bridge push. Internal use only — called by send-day2-bridge edge function.';

REVOKE ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_day2_bridge_candidates"() TO "service_role";
