-- Atomic accept_follow_request RPC (audit finding #4 / D).
--
-- Root cause: acceptFollowRequest (lib/follow-request-service.ts) was a
-- non-atomic client-side delete-then-insert. If the client died (or the
-- follows insert errored) between the two calls, the follow_requests row was
-- destroyed with no follows row created — "accept did nothing", the request
-- gone forever. This RPC does both in one transaction.
--
-- Wrong-party notification fix: accepting used to notify (only implicitly, via
-- the on_new_follow trigger) the TARGET — the person who just tapped Accept and
-- already knows. The party who actually wants to hear is the REQUESTER. So we:
--   1. delete the follows-insert-generated 'follow' card addressed to the
--      target (the wrong-party card), and
--   2. write a 'follow_accepted' card to the requester (actor = target).
--
-- Reconciliation design decision (delete-the-trigger-card vs. accept-aware
-- trigger): we DELETE the card the on_new_follow trigger writes, rather than
-- making create_follow_notification accept-aware via a session GUC. Rationale:
-- on_new_follow / create_follow_notification is shared by the plain-follow path
-- and lives in the base schema; teaching it to suppress on a session flag is a
-- more invasive change to shared behavior. Deleting within THIS transaction is
-- localized and atomic — the AFTER INSERT trigger fires as part of the follows
-- INSERT, so by the time the DELETE below runs the card exists; both happen in
-- one transaction, so no external reader ever observes the intermediate card.
-- Tradeoff: one redundant write+delete of a row, in exchange for not touching a
-- shared trigger.
--
-- Notification type decision: the notifications UI (components/social/
-- NotificationItem.tsx) has no dedicated "request accepted" case. Using 'follow'
-- for the requester would render "target followed you" — false (the requester
-- follows the target, not vice-versa). We introduce type 'follow_accepted' with
-- actor_id = target: the UI's default branch renders a non-misleading
-- "<target> interacted with you" and its default onPress navigates to
-- /user/<actor_id> = the target's profile (whom the requester now follows) —
-- correct and renderable today, and forward-compatible with a dedicated UI case.
--
-- Block gate: this fn is SECURITY DEFINER and bypasses RLS, so it checks
-- blocked_users itself, BOTH directions — a separate agent adds RLS-level block
-- gating but that does not protect a DEFINER fn.

CREATE OR REPLACE FUNCTION "public"."accept_follow_request"("p_request_id" "uuid")
RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_requester_id uuid;
  v_target_id uuid;
BEGIN
  -- Load the request row; it must exist.
  SELECT requester_id, target_id
    INTO v_requester_id, v_target_id
    FROM public.follow_requests
   WHERE id = p_request_id;

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

ALTER FUNCTION "public"."accept_follow_request"("uuid") OWNER TO "postgres";

-- Grant hygiene per 20260710093000: revoke PUBLIC + anon + authenticated
-- (anon inherits PUBLIC, so revoking anon alone is a no-op), then grant only
-- authenticated. This is a client-JWT RPC (the target calls it); no service_role.
REVOKE ALL ON FUNCTION "public"."accept_follow_request"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."accept_follow_request"("uuid") TO "authenticated";
