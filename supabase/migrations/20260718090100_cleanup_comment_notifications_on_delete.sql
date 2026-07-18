-- Orphaned "commented on your post" notifications (issue #709).
--
-- deleteComment (lib/comment-service.ts) is a direct RLS-gated DELETE against
-- review_comments with no server-side notification cleanup, so the
-- recipient's 'comment' / 'comment_first_take' / 'comment_reply' card
-- survives the comment it describes — same orphan class as the legacy
-- follow_request cards (#644/#646 era), just on the comment delete surface
-- instead of follow_requests.
--
-- All three notification types carry the deleted row's id as data.comment_id
-- (see supabase/functions/add-comment/index.ts), so a single trigger on
-- review_comments covers all three regardless of type. Row-level AFTER
-- DELETE triggers also fire on FK-cascaded deletes (e.g. a parent comment's
-- ON DELETE CASCADE removing its replies, or a review's cascade removing its
-- comments), so deleting a review or first_take cleans up the comment
-- notifications for its comments through this same trigger — no separate
-- handling needed for that path.
--
-- Mirrors the follow_requests/follows cleanup pattern exactly
-- (20260703070000, 20260710100000): SECURITY DEFINER trigger fn + AFTER
-- DELETE trigger + one-time sweep. Grants intentionally NOT touched — a
-- RETURNS trigger function can only be invoked as a trigger, so it is not
-- reachable via PostgREST /rpc regardless of role grants.

CREATE OR REPLACE FUNCTION "public"."cleanup_comment_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type IN ('comment', 'comment_first_take', 'comment_reply')
     AND data->>'comment_id' = OLD.id::text;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_comment_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_review_comments_cleanup_notifications" ON "public"."review_comments";
CREATE TRIGGER "trg_review_comments_cleanup_notifications"
AFTER DELETE ON "public"."review_comments"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_comment_notifications"();

-- One-time cleanup: remove already-orphaned comment notifications (comment
-- deleted before this trigger existed, so no cleanup ran at delete time).
DELETE FROM "public"."notifications" n
 WHERE n.type IN ('comment', 'comment_first_take', 'comment_reply')
   AND NOT EXISTS (
     SELECT 1 FROM "public"."review_comments" rc
      WHERE rc.id::text = n.data->>'comment_id'
   );
