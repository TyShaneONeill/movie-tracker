-- Zombie follow-request notifications (issue #588).
--
-- Request → cancel → re-request deletes and recreates the follow_requests row
-- (the unique constraint only blocks concurrent pendings), and every request
-- fires a new 'follow_request' notification. Cleanup of the old notification
-- was client-side only (cancelFollowRequest), so older app builds left the
-- target with duplicate "wants to follow you" cards whose stored
-- follow_request_id points at a deleted row — accepting them fails.
--
-- Server-side guarantee: whenever a follow_requests row is deleted (cancel,
-- accept, or decline, from ANY client version), drop every matching
-- follow_request notification for that requester→target pair.

CREATE OR REPLACE FUNCTION "public"."cleanup_follow_request_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type = 'follow_request'
     AND actor_id = OLD.requester_id
     AND user_id = OLD.target_id;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_follow_request_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_follow_requests_cleanup_notifications" ON "public"."follow_requests";
CREATE TRIGGER "trg_follow_requests_cleanup_notifications"
AFTER DELETE ON "public"."follow_requests"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_follow_request_notifications"();

-- One-time cleanup: remove already-orphaned follow_request notifications
-- (no pending request row for the pair — the request was cancelled,
-- accepted, or declined before this trigger existed).
DELETE FROM "public"."notifications" n
 WHERE n.type = 'follow_request'
   AND NOT EXISTS (
     SELECT 1 FROM "public"."follow_requests" fr
      WHERE fr.requester_id = n.actor_id
        AND fr.target_id = n.user_id
   );
