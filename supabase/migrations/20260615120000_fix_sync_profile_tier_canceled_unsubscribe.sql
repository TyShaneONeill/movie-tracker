-- #539 — A canceled-but-not-expired subscription (auto-renew off / UNSUBSCRIBE)
-- still entitles the user to premium until expires_at. The previous
-- sync_profile_tier (migration 20260605062224) granted premium only for
-- status IN ('active','grace_period'), so an UNSUBSCRIBE downgraded the user to
-- 'free' immediately — losing paid premium (Apple-guideline + refund risk).
-- Found during the #537 entitlement-propagation verification.
--
-- Refund safety: RevenueCat sends a refund as CANCELLATION with cancel_reason
-- 'CUSTOMER_SUPPORT' (vs 'UNSUBSCRIBE' = the user just turned off auto-renew and
-- is still entitled). We therefore treat a 'canceled' sub as premium-eligible
-- ONLY when cancel_reason = 'UNSUBSCRIBE', and ALWAYS gate on expires_at > now().
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
  -- Map an active 'plus' entitlement to the 'premium' account_tier.
  SELECT 'premium', expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND entitlement_id = 'plus'
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      status IN ('active', 'grace_period')
      OR (status = 'canceled' AND coalesce(raw_event->>'cancel_reason', '') = 'UNSUBSCRIBE')
    )
  ORDER BY expires_at DESC NULLS LAST
  LIMIT 1;

  -- Never downgrade dev accounts.
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
