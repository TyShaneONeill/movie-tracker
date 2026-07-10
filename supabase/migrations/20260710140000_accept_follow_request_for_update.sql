-- Race-hardening for accept_follow_request (independent review of batch 2A,
-- finding P2): the initial SELECT did not lock the request row, so a
-- concurrent DELETE (requester cancels, or target declines/accepts on another
-- device) between the read and this function's own DELETE produced:
--   - accept racing cancel/decline → the DELETE silently hit 0 rows but the
--     follows INSERT still ran: a follow edge existed even though the request
--     was cancelled/declined.
--   - double-accept (two devices / retry) → the loser's INSERT no-opped on
--     conflict but it still wrote a SECOND 'follow_accepted' card.
--
-- Fix: SELECT ... FOR UPDATE. A concurrent deleter blocks until this
-- transaction commits; a second accept (or an accept after cancel/decline)
-- re-resolves to NOT FOUND and raises cleanly. Single-winner semantics.
--
-- Body is otherwise identical to 20260710120000.

CREATE OR REPLACE FUNCTION "public"."accept_follow_request"("p_request_id" "uuid")
RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_requester_id uuid;
  v_target_id uuid;
BEGIN
  -- Load AND LOCK the request row; it must exist. FOR UPDATE serializes
  -- against concurrent accept/decline/cancel deletes of the same row.
  SELECT requester_id, target_id
    INTO v_requester_id, v_target_id
    FROM public.follow_requests
   WHERE id = p_request_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'follow request not found';
  END IF;

  -- Only the target of the request may accept it.
  IF v_target_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized to accept this follow request';
  END IF;

  -- Block gate, both directions (DEFINER bypasses RLS — must check explicitly).
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
     WHERE (blocker_id = v_requester_id AND blocked_id = v_target_id)
        OR (blocker_id = v_target_id AND blocked_id = v_requester_id)
  ) THEN
    RAISE EXCEPTION 'cannot accept follow request: block in effect';
  END IF;

  -- Atomic accept. Deleting the request fires
  -- cleanup_follow_request_notifications (AFTER DELETE), which removes the
  -- requester->target 'follow_request' card.
  DELETE FROM public.follow_requests WHERE id = p_request_id;

  -- Create the follow. This fires on_new_follow (create_follow_notification),
  -- which writes a 'follow' card to the target — reconciled below.
  INSERT INTO public.follows (follower_id, following_id)
  VALUES (v_requester_id, v_target_id)
  ON CONFLICT ON CONSTRAINT "follows_follower_id_following_id_key" DO NOTHING;

  -- Remove the wrong-party 'follow' card the trigger just wrote to the target.
  DELETE FROM public.notifications
   WHERE type = 'follow'
     AND actor_id = v_requester_id
     AND user_id = v_target_id;

  -- Notify the requester that their request was accepted (actor = target,
  -- mirroring create_follow_notification's actor_id convention).
  INSERT INTO public.notifications (user_id, type, actor_id, data)
  VALUES (v_requester_id, 'follow_accepted', v_target_id, '{}');
END;
$$;

-- CREATE OR REPLACE preserves ownership and grants; restated for drift-guard
-- explicitness (same posture as 20260710120000).
ALTER FUNCTION "public"."accept_follow_request"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."accept_follow_request"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."accept_follow_request"("uuid") TO "authenticated";
