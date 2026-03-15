-- Fix check_rate_limit RPC: profiles.is_dev_tier does not exist.
-- The correct column is profiles.account_tier (text: 'free'|'plus'|'dev').
-- This bug caused every rate limit check to fail, and fail-closed endpoints
-- (like generate-journey-art) returned 503 on every request.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
  v_is_dev boolean;
  v_reset_at timestamptz;
BEGIN
  -- Check if user is a dev-tier user (unlimited)
  SELECT (account_tier = 'dev') INTO v_is_dev
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_dev = true THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', p_max_requests,
      'limit', p_max_requests,
      'reset_at', (v_now + (p_window_seconds || ' seconds')::interval)::text
    );
  END IF;

  -- Upsert rate limit row, resetting if window expired
  INSERT INTO public.rate_limits (user_id, action, window_count, window_start)
  VALUES (p_user_id, p_action, 1, v_now)
  ON CONFLICT (user_id, action) DO UPDATE
  SET
    window_count = CASE
      WHEN public.rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN 1
      ELSE public.rate_limits.window_count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start + (p_window_seconds || ' seconds')::interval < v_now
      THEN v_now
      ELSE public.rate_limits.window_start
    END
  RETURNING window_count, window_start INTO v_count, v_window_start;

  v_reset_at := v_window_start + (p_window_seconds || ' seconds')::interval;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_count),
    'limit', p_max_requests,
    'reset_at', v_reset_at::text
  );
END;
$$;
