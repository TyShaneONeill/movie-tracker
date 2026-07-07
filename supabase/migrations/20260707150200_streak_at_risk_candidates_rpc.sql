-- PS-15 PR 3 — punch-card streak spine, part 3/3: at-risk push candidates +
-- nightly reconciliation. Both service-role-only, mirroring the day2/recap
-- candidate RPCs (REVOKE PUBLIC / GRANT service_role; SET search_path = '' with
-- every relation schema-qualified).
--
-- get_streak_at_risk_candidates(): who should get the gentle evening "your
-- streak's about to lapse" nudge right now.
--
-- OPT-IN ENFORCEMENT (streak_at_risk is default OFF, per Ty 2026-07-06): unlike
-- day2/recap — which rely on send-push-notification's absent-row = enabled
-- default — this RPC requires an EXPLICIT notification_preferences row with
-- enabled = true. That makes the push genuinely opt-in without changing the
-- shared delivery function's generic absent = enabled semantics: only users who
-- toggled it on are ever returned here, and a toggled-off (enabled = false) row
-- is excluded here AND downstream, so UI, candidates, and delivery all agree.
--
-- Timezone: eff_tz is the validated profiles.timezone or 'UTC' for null/non-IANA
-- (same guard as day2/recap). Because eff_tz is pre-validated, the hour/date
-- extractions can't raise inside AT TIME ZONE, so no CASE-around-AT-TIME-ZONE is
-- needed. Evening window is 5-7pm local (hour 17-18); null-tz users fall back to
-- the 23:00 UTC tick, matching day2/recap.
--
-- Eligibility (all must hold, evaluated against the user's local "today"):
--   * current_streak >= 3 (only streaks worth saving)
--   * opted in (explicit enabled = true row, see above)
--   * has a push token
--   * no qualifying activity yet today (no user_activity_days row for local_today)
--   * streak is still continuable today: the days missed before today can be
--     covered by banked rain checks — (local_today - last_activity_date) - 1
--     <= rain_checks. A streak already beyond saving is not "at risk", it's gone.
--   * in the evening send window
--   * not already sent a streak_at_risk push in the trailing 22h (once per local
--     day: the 2-hour window can't recur within 22h, so this dedups per day
--     without per-row local-date arithmetic; status = 'sent' only, so a failed
--     delivery doesn't burn the day — mirrors day2/recap).
-- rain_check_pending tells the copy layer whether keeping the streak will spend
-- a rain check (a gap day exists before today), so the nudge can say so honestly.
CREATE OR REPLACE FUNCTION "public"."get_streak_at_risk_candidates"()
    RETURNS TABLE("user_id" "uuid", "current_streak" integer, "rain_check_pending" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH base AS (
    SELECT
      s.user_id,
      s.current_streak,
      s.last_activity_date,
      s.rain_checks,
      (p.timezone IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
      )) AS is_valid_tz,
      CASE
        WHEN p.timezone IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
        ) THEN p.timezone
        ELSE 'UTC'
      END AS eff_tz
    FROM public.user_streaks s
    JOIN public.profiles p ON p.id = s.user_id
    JOIN public.push_tokens pt ON pt.user_id = s.user_id
    WHERE s.current_streak >= 3
      AND s.last_activity_date IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = s.user_id
          AND np.feature = 'streak_at_risk'
          AND np.enabled = true
      )
  ),
  windowed AS (
    SELECT
      b.user_id,
      b.current_streak,
      b.last_activity_date,
      b.rain_checks,
      b.is_valid_tz,
      (now() AT TIME ZONE b.eff_tz)::date AS local_today,
      EXTRACT(HOUR FROM (now() AT TIME ZONE b.eff_tz)) AS local_hour
    FROM base b
  )
  SELECT DISTINCT
    w.user_id,
    w.current_streak,
    ((w.local_today - w.last_activity_date) > 1) AS rain_check_pending
  FROM windowed w
  WHERE w.last_activity_date < w.local_today
    AND ((w.local_today - w.last_activity_date) - 1) <= w.rain_checks
    AND (
      (w.is_valid_tz AND w.local_hour BETWEEN 17 AND 18)
      OR (NOT w.is_valid_tz AND w.local_hour = 23)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_activity_days uad
      WHERE uad.user_id = w.user_id AND uad.local_date = w.local_today
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.push_notification_log pnl
      WHERE pnl.feature = 'streak_at_risk'
        AND pnl.user_id = w.user_id
        AND pnl.status = 'sent'
        AND pnl.sent_at >= now() - interval '22 hours'
    );
$$;

ALTER FUNCTION "public"."get_streak_at_risk_candidates"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_streak_at_risk_candidates"() IS 'Returns opted-in users (explicit streak_at_risk pref enabled) with a push token, a current streak >= 3 still continuable today, no activity yet today, in their 5-7pm local window (or 23:00 UTC fallback), not already sent today. Internal use only — called by send-streak-at-risk edge function. PS-15 PR 3.';

REVOKE ALL ON FUNCTION "public"."get_streak_at_risk_candidates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_streak_at_risk_candidates"() TO "service_role";

-- ── reconcile_user_streaks(): nightly honesty pass ───────────────────────────
-- Cheap single-statement sweep: zero out streaks that are definitively dead as
-- of the user's local today — i.e. even acting right now couldn't bridge the
-- gap ((local_today - last_activity_date) - 1 > rain_checks). This keeps the
-- card honest for users who never open the app, WITHOUT recomputing per read.
-- Uses the exact same liveness criterion as record_user_activity's reset branch,
-- so a reconciled (zeroed) streak and a live one never disagree. HQ schedules
-- this on a daily cron in DB at deploy (schedule lives in the DB vault, not git).
CREATE OR REPLACE FUNCTION "public"."reconcile_user_streaks"()
    RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH dead AS (
    UPDATE public.user_streaks s
    SET current_streak = 0, updated_at = now()
    FROM (
      SELECT
        p.id AS user_id,
        (now() AT TIME ZONE (
          CASE
            WHEN p.timezone IS NOT NULL AND EXISTS (
              SELECT 1 FROM pg_catalog.pg_timezone_names tz WHERE tz.name = p.timezone
            ) THEN p.timezone
            ELSE 'UTC'
          END
        ))::date AS local_today
      FROM public.profiles p
    ) d
    WHERE d.user_id = s.user_id
      AND s.current_streak > 0
      AND s.last_activity_date IS NOT NULL
      AND s.last_activity_date < d.local_today
      AND ((d.local_today - s.last_activity_date) - 1) > s.rain_checks
    RETURNING 1
  )
  SELECT count(*)::integer FROM dead;
$$;

ALTER FUNCTION "public"."reconcile_user_streaks"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reconcile_user_streaks"() IS 'Zeroes streaks that can no longer be continued as of the user local today (same criterion as record_user_activity''s reset branch). Returns the count broken. Internal use only — daily cron. PS-15 PR 3.';

REVOKE ALL ON FUNCTION "public"."reconcile_user_streaks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_user_streaks"() TO "service_role";
