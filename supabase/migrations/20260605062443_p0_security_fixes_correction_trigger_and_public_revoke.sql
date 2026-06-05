-- =====================================================================
-- P0 SECURITY FIXES — correction
-- The column/role REVOKEs in 20260605062224 were no-ops:
--   * REVOKE UPDATE(cols) can't carve out a subset of a TABLE-level UPDATE grant.
--   * Function EXECUTE is GRANTed to PUBLIC by default, so revoking from anon
--     alone is ineffective.
-- This migration applies the effective fixes. Verified behaviorally on prod:
--   - authenticated UPDATE account_tier -> silently reverted (escalation blocked)
--   - service_role UPDATE account_tier -> succeeds (premium sync intact)
--   - anon EXECUTE on both RPCs -> denied
-- =====================================================================

-- P0.1 (corrected): BEFORE UPDATE trigger pins server-authoritative columns for
-- the client roles only. service_role (edge functions) and SECURITY DEFINER RPCs
-- owned by postgres run under other roles and are unaffected.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.account_tier        := OLD.account_tier;
    NEW.tier_expires_at     := OLD.tier_expires_at;
    NEW.rewarded_ad_credits := OLD.rewarded_ad_credits;
    NEW.id                  := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_cols ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_cols();

-- P0.2 / P1.1 (corrected): revoke function EXECUTE from PUBLIC, then grant only to
-- the roles that must call each function.
REVOKE EXECUTE ON FUNCTION public.increment_bonus_scans(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_bonus_scans(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sync_profile_tier(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_profile_tier(uuid) TO service_role;
