-- AI usage cost tracking table
CREATE TABLE public.ai_usage_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  model text NOT NULL,
  estimated_cost_usd numeric(10, 6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for daily spend aggregation queries
CREATE INDEX idx_ai_usage_costs_created_at
  ON public.ai_usage_costs (created_at);

-- Index on user_id foreign key for CASCADE deletes and per-user queries
CREATE INDEX idx_ai_usage_costs_user_id
  ON public.ai_usage_costs (user_id);

-- RLS enabled but no public policies — only service_role can access
ALTER TABLE public.ai_usage_costs ENABLE ROW LEVEL SECURITY;

-- RPC to check current daily AI spend (platform-wide)
CREATE OR REPLACE FUNCTION public.check_daily_ai_spend(
  p_daily_limit_usd numeric DEFAULT 10.0
)
RETURNS jsonb
LANGUAGE plpgsql
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
