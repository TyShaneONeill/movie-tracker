-- Trigger-owned follow_request notification (audit finding #7 / E).
--
-- Root cause: the 'follow_request' in-app card was written by the
-- send-follow-request edge function, decoupled from the follow_requests row
-- insert (the client inserts the row, then fire-and-forgets the edge call). On
-- web a JWT race can 401 the edge call, so the row exists but the target never
-- gets a card — the request is invisible.
--
-- Fix, mirroring batch 1's model (the DB trigger is the SOLE in-app writer;
-- edge functions are push-only): an AFTER INSERT trigger on follow_requests
-- writes the card in the same statement that creates the row. The edge fn's
-- in-app insert is removed in the same PR (send-follow-request becomes
-- push-only, like notify-follow).
--
-- Field-by-field parity with the removed edge-fn insert (send-follow-request
-- index.ts, the `.from('notifications').insert({...})` call):
--   user_id  : target_id       == edge target_id            (identical)
--   actor_id : requester_id     == edge user.id (=requester) (identical)
--   type     : 'follow_request' == edge 'follow_request'     (identical)
--   read     : false            == edge read: false          (identical)
--   data.requester_id     : NEW.requester_id == edge user.id (identical)
--   data.follow_request_id: NEW.id           == edge followRequest?.id
--        (STRENGTHENED: the edge fn re-queried the row and could store null on a
--         lookup race; the trigger has NEW.id in hand, so it is always the real
--         row id.)
--   created_at: DEFAULT now()   == edge (unset -> DEFAULT)   (identical)
--
-- Grants: this is a RETURNS trigger function; Postgres rejects direct /rpc
-- calls ("trigger functions can only be called as triggers"), so it is
-- unreachable via PostgREST regardless of role grants — intentionally NOT
-- revoked/granted, matching cleanup_follow_request_notifications and
-- cleanup_follow_notifications, and the trigger-fn carve-out documented in
-- 20260710093000_definer_fn_grant_hardening.sql.

CREATE OR REPLACE FUNCTION "public"."create_follow_request_notification"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, actor_id, data, read)
  VALUES (
    NEW.target_id,     -- notify the target (the person asked to approve)
    'follow_request',
    NEW.requester_id,  -- who is requesting
    jsonb_build_object(
      'requester_id', NEW.requester_id,
      'follow_request_id', NEW.id
    ),
    false
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_follow_request_notification"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_follow_requests_create_notification" ON "public"."follow_requests";
CREATE TRIGGER "trg_follow_requests_create_notification"
AFTER INSERT ON "public"."follow_requests"
FOR EACH ROW EXECUTE FUNCTION "public"."create_follow_request_notification"();
