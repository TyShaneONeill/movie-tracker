-- Notification & social-graph audit (2026-07-10), finding #6: block-gate the
-- social-graph write paths.
--
-- Root cause: public.blocked_users (blocker_id, blocked_id) exists and the
-- client exposes block/unblock, but NOTHING on the write side ever consults it.
-- A blocked user can still directly INSERT a follow row or a follow_request
-- against the person who blocked them — the block only hides content
-- (can_view_user_content()), it never stops the edge from being created.
--
-- Fix (server-side, RLS only): append a bidirectional block check to the
-- WITH CHECK of all three social-graph INSERT policies. If EITHER party has
-- blocked the other, the insert is denied.
--
-- Why a SECURITY DEFINER helper is REQUIRED (the trap):
--   RLS policy expressions execute as the invoking role, and a subquery against
--   blocked_users is itself subject to blocked_users' RLS. Its SELECT policy is
--   blocker-only ("Users can view their own blocks", USING auth.uid() =
--   blocker_id). So a plain inline
--     NOT EXISTS (SELECT 1 FROM blocked_users
--                 WHERE blocker_id = following_id AND blocked_id = follower_id)
--   evaluated by the *follower* (the person trying to follow) sees ZERO rows —
--   the row where the target blocked the follower is invisible to the follower —
--   and the check silently passes in exactly the direction that matters. Routing
--   the lookup through a SECURITY DEFINER helper (owner = postgres) makes the
--   read bypass blocked_users' RLS so both directions are actually visible.
--
-- can_view_user_content() is the only existing DEFINER social helper; it covers
-- follow/privacy visibility and never touches blocked_users, so it does not fit.
-- A new minimal helper is introduced.

-- ── Helper: true if either (a,b) or (b,a) is a block pair ──
CREATE OR REPLACE FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid")
    RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

ALTER FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") IS 'Returns true if either user has blocked the other (checks both directions of public.blocked_users). SECURITY DEFINER so RLS WITH CHECK expressions can see the block row regardless of which party is invoking — blocked_users'' own SELECT policy is blocker-only. Social-graph audit 2026-07-10, finding #6.';

-- Grant hygiene per house rule (ref 20260710093000_definer_fn_grant_hardening):
-- REVOKE from PUBLIC, anon, AND authenticated — revoking anon without PUBLIC is
-- a no-op because anon inherits PUBLIC. Then GRANT EXECUTE back to authenticated
-- only: the three policies evaluate as the calling (authenticated) role, so it
-- must remain executable there; anon has no legitimate social-graph insert.
REVOKE ALL ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_blocked_between"("a" "uuid", "b" "uuid") TO "authenticated";

-- ── Append block-gating to the three INSERT policies ──
-- ALTER POLICY REPLACES the WITH CHECK (it does not append), so each existing
-- auth.uid() clause is restated verbatim from prod and the block check is ANDed
-- on. Roles are unchanged by ALTER POLICY and preserved as-is.

-- follows: a user follows someone (public profile / auto-accept path).
--   before: ((SELECT auth.uid()) = follower_id)
ALTER POLICY "Users can follow others" ON "public"."follows"
  WITH CHECK (
    (( SELECT "auth"."uid"() AS "uid") = "follower_id")
    AND NOT "public"."is_blocked_between"("follower_id", "following_id")
  );

-- follows: the target accepts an incoming request by inserting the edge.
--   before: (following_id = auth.uid())
ALTER POLICY "target_can_accept_follows" ON "public"."follows"
  WITH CHECK (
    ("following_id" = "auth"."uid"())
    AND NOT "public"."is_blocked_between"("follower_id", "following_id")
  );

-- follow_requests: a user requests to follow a private profile.
--   before: (requester_id = (SELECT auth.uid()))
ALTER POLICY "Users can create follow requests" ON "public"."follow_requests"
  WITH CHECK (
    ("requester_id" = ( SELECT "auth"."uid"() AS "uid"))
    AND NOT "public"."is_blocked_between"("requester_id", "target_id")
  );
