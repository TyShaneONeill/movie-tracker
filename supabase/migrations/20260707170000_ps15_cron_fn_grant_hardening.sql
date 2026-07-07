-- PS-15 cron-fn grant hardening — caught by the PR 3 deploy runbook's
-- behavioral EXECUTE probes (2026-07-07).
--
-- THE FOOTGUN: Supabase projects carry ALTER DEFAULT PRIVILEGES that grant
-- EXECUTE on every new public function to anon, authenticated, and
-- service_role as EXPLICIT per-role grants at CREATE time. The day2/recap
-- migration pattern (`REVOKE ALL ... FROM PUBLIC; GRANT ... TO service_role`)
-- only removes the PUBLIC pseudo-role grant — the explicit anon/authenticated
-- grants survive it. Result: every "service-role-only" candidate RPC shipped
-- since PR 1 was callable by anon (whose key ships in the client bundle).
-- `get_pending_tv_episode_reminders` shows the correct end state (locked by
-- the 2026-07-03 lockdown); this migration brings its siblings in line.
--
-- Behavioral proof required (deploy runbook): after applying, an anon- and an
-- authenticated-role EXECUTE of each function below must be DENIED.
-- These fns are called only by cron-fired edge functions using the service
-- role key — verified zero client `.rpc()` call sites at merge time.

-- PR 1 (2026-07-06) — was anon-executable in prod until this migration.
REVOKE EXECUTE ON FUNCTION "public"."get_pending_day2_bridge_candidates"() FROM "anon", "authenticated";

-- PR 2 (2026-07-07) — was anon-executable in prod until this migration.
REVOKE EXECUTE ON FUNCTION "public"."get_weekly_recap_candidates"() FROM "anon", "authenticated";

-- PR 3 (2026-07-07) — caught on staging before prod apply.
REVOKE EXECUTE ON FUNCTION "public"."get_streak_at_risk_candidates"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."reconcile_user_streaks"() FROM "anon", "authenticated";

-- SP1-era sibling with the same shape (cron-only, service-role caller).
REVOKE EXECUTE ON FUNCTION "public"."get_pending_release_reminders"() FROM "anon", "authenticated";
