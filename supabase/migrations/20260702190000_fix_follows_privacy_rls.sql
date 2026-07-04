-- Fix privacy leak: follows rows were publicly readable (USING (true)), which
-- exposed private profiles' follower AND following lists to anyone, including
-- unauthenticated callers. The 2026-03-08 privacy infrastructure guarded
-- first_takes/reviews/user_movies/user_lists but missed the follows table.
--
-- New rule — a follows row is visible iff:
--   (a) the viewer is a party to the row (their own follower/following graph), or
--   (b) BOTH endpoints' profiles are viewable to the viewer.
-- can_view_user_content(uid, 'public') already encodes "public profile, or the
-- viewer is an accepted follower of the private profile" and is SECURITY
-- DEFINER, so it bypasses this table's RLS (no recursion).
--
-- Product semantics ("private stays private"): a private account's graph rows
-- disappear from ALL list surfaces for strangers — their own followers and
-- following lists, and their appearances inside public users' lists.
-- Denormalized profiles.followers_count / following_count are unaffected.

DROP POLICY IF EXISTS "Follows are publicly readable" ON "public"."follows";

CREATE POLICY "follows_select_privacy_aware" ON "public"."follows"
  FOR SELECT USING (
    (SELECT "auth"."uid"()) = "follower_id"
    OR (SELECT "auth"."uid"()) = "following_id"
    OR (
      "public"."can_view_user_content"("follower_id", 'public'::"text")
      AND "public"."can_view_user_content"("following_id", 'public'::"text")
    )
  );
