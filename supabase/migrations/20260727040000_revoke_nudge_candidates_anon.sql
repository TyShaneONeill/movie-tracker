-- SECURITY: close anon EXECUTE on get_continue_watching_nudge_candidates().
--
-- The drift guard caught this on 2026-07-27: prod ACL read
--   postgres=X | anon=X | authenticated=X | service_role=X
-- on a SECURITY DEFINER function. anon EXECUTE on a DEFINER fn means anyone
-- can POST /rpc/ unauthenticated with the public anon key and run it with the
-- owner's privileges, bypassing RLS. This one returns nudge candidates (user
-- rows), so it is a data exposure, live since #744 shipped 2026-07-22.
--
-- ROOT CAUSE — the same footgun for the THIRD time (burned 2026-06-05,
-- 2026-07-03). The original migration (20260721090000, line 232) did:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
-- Revoking PUBLIC alone is a NO-OP for anon: Supabase's default privileges
-- GRANT EXECUTE to anon/authenticated directly, which is a separate grant, not
-- something inherited from PUBLIC. All three roles must be named explicitly --
-- see 20260710093000_definer_fn_grant_hardening.sql for the correct pattern.
--
-- Only caller is the cron edge fn send-continue-watching-nudges
-- (supabase/functions/send-continue-watching-nudges/index.ts:43), which uses
-- service_role. Nothing client-side calls this, so service_role is sufficient.
REVOKE ALL ON FUNCTION "public"."get_continue_watching_nudge_candidates"()
  FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_continue_watching_nudge_candidates"()
  TO "service_role";
