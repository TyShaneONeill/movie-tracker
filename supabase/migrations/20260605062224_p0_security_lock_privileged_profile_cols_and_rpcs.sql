-- =====================================================================
-- P0 SECURITY FIXES (2026-06-04 post-launch readiness review)
-- Applied to prod via Supabase MCP. NOTE: the column/role REVOKEs in this
-- migration were no-ops (see correction migration 20260605062443) — kept here
-- to preserve applied history. The effective fixes are: the policy WITH CHECK,
-- the two function rewrites, plus the trigger + PUBLIC-revokes in the correction.
-- =====================================================================

-- P0.1 — Self-service tier escalation.
-- The profiles UPDATE policy had USING but no WITH CHECK, and account_tier /
-- tier_expires_at / rewarded_ad_credits / id were client-writable. Any logged-in
-- user could self-grant premium/dev or arbitrary ad credits via PostgREST.
REVOKE UPDATE (account_tier, tier_expires_at, rewarded_ad_credits, id)
  ON public.profiles FROM anon, authenticated;

ALTER POLICY "Users can update their own profile" ON public.profiles
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

-- P0.2 — increment_bonus_scans trusted caller-supplied p_user_id (no auth.uid()
-- check). Bind to auth.uid() (keep the signature so the existing client call keeps
-- working — param ignored), pin search_path, revoke EXECUTE from anon.
CREATE OR REPLACE FUNCTION public.increment_bonus_scans(p_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();   -- bind to the caller; ignore p_user_id
  v_today date := CURRENT_DATE;
  v_record scan_usage%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO scan_usage (user_id, daily_count, last_scan_date, lifetime_scans, bonus_scans)
  VALUES (v_user_id, 0, v_today, 0, 0)
  ON CONFLICT (user_id) DO UPDATE
  SET
    daily_count = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.daily_count END,
    bonus_scans = CASE WHEN scan_usage.last_scan_date < v_today THEN 0 ELSE scan_usage.bonus_scans END,
    last_scan_date = v_today;

  UPDATE scan_usage SET bonus_scans = COALESCE(bonus_scans, 0) + 1, updated_at = now() WHERE user_id = v_user_id;

  SELECT * INTO v_record FROM scan_usage WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'bonus_scans', v_record.bonus_scans,
    'scans_remaining', GREATEST(0, (3 + v_record.bonus_scans) - v_record.daily_count)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.increment_bonus_scans(uuid) FROM anon;

-- P1.1 — sync_profile_tier wrote account_tier='plus', which violates the
-- profiles_account_tier_check constraint (free|premium|dev) -> the function threw
-- on every active subscription, so paying users were never upgraded server-side.
-- Write 'premium' (entitlement_id stays 'plus' = RevenueCat's entitlement name),
-- pin search_path, revoke EXECUTE from client roles.
CREATE OR REPLACE FUNCTION public.sync_profile_tier(p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_expires timestamptz;
BEGIN
  -- Map an active 'plus' entitlement to the 'premium' account_tier
  SELECT 'premium', expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND entitlement_id = 'plus'
    AND status IN ('active', 'grace_period')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC NULLS LAST
  LIMIT 1;

  -- Never downgrade dev accounts
  IF (SELECT account_tier FROM profiles WHERE id = p_user_id) = 'dev' THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET account_tier = COALESCE(v_tier, 'free'),
      tier_expires_at = v_expires,
      updated_at = now()
  WHERE id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_tier(uuid) FROM anon, authenticated;
