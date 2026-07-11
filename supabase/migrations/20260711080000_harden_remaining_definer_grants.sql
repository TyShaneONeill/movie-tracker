-- Harden the two SECURITY DEFINER functions the new drift-guard DEFINER audit
-- found anon-executable on STAGING (prod already locked — evidently by an
-- earlier hand-applied revoke that never reached staging). Codifying here makes
-- both databases converge from migrations alone and keeps the new guard green.
--
-- House rule (twice burned: 2026-06-05, 2026-07-03): revoke PUBLIC + anon +
-- authenticated ALL THREE (anon inherits PUBLIC, so revoking anon alone is a
-- no-op), then grant back only the roles that must call the function. See
-- 20260710093000_definer_fn_grant_hardening.sql.
--
-- Idempotent: re-applying on prod re-affirms the existing grants.

-- Cron/edge-function helper — service-role only, never client-callable.
REVOKE ALL ON FUNCTION public.get_pending_tv_episode_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() TO service_role;

-- Client RPC (bug-report/feature-request submission) — authenticated users only.
REVOKE ALL ON FUNCTION public.submit_feature_request(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feature_request(text, text, text, text, text, text) TO authenticated, service_role;
