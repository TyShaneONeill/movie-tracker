-- Refund a scan charged by check_and_increment_scan when the scan never
-- delivered value (Gemini/upstream failure AFTER the quota was charged).
--
-- Why: check_and_increment_scan charges atomically BEFORE the Gemini call
-- (deliberately — prevents parallel-scan quota races). On 2026-07-01 a lapsed
-- GCP bill made every Gemini call fail; retries burned the full daily quota
-- with zero tickets read. scan-ticket now refunds on its upstream-failure
-- paths so a backend outage can never consume user quota.
--
-- Security: callable by service_role ONLY. A user who could call this
-- directly could reset their own daily count and bypass the rate limit, so
-- PUBLIC/anon/authenticated are explicitly revoked (function EXECUTE defaults
-- to PUBLIC — see feedback_postgres_revoke_gotchas).

CREATE OR REPLACE FUNCTION public.refund_scan(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only refund against today's counter; a row from a previous day means the
  -- charge being refunded already expired with the daily reset.
  UPDATE scan_usage
  SET daily_count = GREATEST(daily_count - 1, 0),
      lifetime_scans = GREATEST(COALESCE(lifetime_scans, 0) - 1, 0),
      updated_at = now()
  WHERE user_id = p_user_id
    AND last_scan_date = CURRENT_DATE;

  RETURN jsonb_build_object('refunded', FOUND);
END;
$$;

ALTER FUNCTION public.refund_scan(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.refund_scan(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_scan(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refund_scan(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_scan(uuid) TO service_role;
