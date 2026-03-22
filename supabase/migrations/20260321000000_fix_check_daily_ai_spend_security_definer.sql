-- Fix: add SECURITY DEFINER to check_daily_ai_spend()
--
-- Without SECURITY DEFINER, this function runs in the caller's security context.
-- ai_usage_costs has RLS enabled with no user-level policies (service_role only).
-- If called via RPC with a user JWT, the function reads 0 rows and returns
-- { allowed: true } — bypassing the daily AI spend limit entirely.
--
-- SECURITY DEFINER makes it run as the function owner (postgres/service role),
-- which can read ai_usage_costs regardless of the caller's RLS context.

CREATE OR REPLACE FUNCTION public.check_daily_ai_spend(
  p_daily_limit_usd numeric DEFAULT 10.0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total_today numeric;
BEGIN
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  INTO v_total_today
  FROM public.ai_usage_costs
  WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');

  RETURN jsonb_build_object(
    'allowed', v_total_today < p_daily_limit_usd,
    'total_today_usd', v_total_today,
    'daily_limit_usd', p_daily_limit_usd
  );
END;
$$;
