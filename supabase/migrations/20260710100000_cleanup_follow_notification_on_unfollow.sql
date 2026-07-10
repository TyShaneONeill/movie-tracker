-- Dangling "X followed you" notifications on unfollow.
--
-- on_new_follow (AFTER INSERT ON follows) writes a type='follow' notification
-- to the followed user. Unfollowing only runs update_follow_counts (count
-- maintenance) — the notification was never cleaned up, so the target keeps a
-- stale "A followed you" card, and a follow/unfollow/refollow loop stacks
-- duplicates. Part of the "follow/unfollow weirdness" reported by Ty.
--
-- Server-side guarantee, mirroring the follow_requests cleanup pattern
-- (20260703070000): whenever a follows row is deleted (unfollow, from ANY
-- client version), drop the matching follow notification for that pair.
--
-- Grants: intentionally NOT revoked/granted, matching
-- cleanup_follow_request_notifications exactly. This RETURNS trigger
-- function can only be invoked as a trigger — Postgres rejects direct calls
-- ("trigger functions can only be called as triggers"), so it is not
-- reachable via PostgREST /rpc regardless of role grants. See
-- 20260710093000_definer_fn_grant_hardening.sql, which explicitly omits
-- trigger fns from its REVOKE sweep for the same reason.

CREATE OR REPLACE FUNCTION "public"."cleanup_follow_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type = 'follow'
     AND actor_id = OLD.follower_id
     AND user_id = OLD.following_id;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_follow_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_follows_cleanup_notifications" ON "public"."follows";
CREATE TRIGGER "trg_follows_cleanup_notifications"
AFTER DELETE ON "public"."follows"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_follow_notifications"();

-- One-time cleanup: remove already-orphaned follow notifications (no
-- matching follows row for the actor→user pair — the unfollow happened
-- before this trigger existed). NOTE: `data` on follow notifications is
-- always '{}' (see create_follow_notification), so this can only match
-- type='follow' rows against the current follows table by actor_id/user_id —
-- it cannot false-positive against follow_request notifications (different
-- type) or any other notification type.
DELETE FROM "public"."notifications" n
 WHERE n.type = 'follow'
   AND NOT EXISTS (
     SELECT 1 FROM "public"."follows" f
      WHERE f.follower_id = n.actor_id
        AND f.following_id = n.user_id
   );
