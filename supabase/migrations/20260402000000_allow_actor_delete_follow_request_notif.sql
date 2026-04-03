-- Allow the requester (actor) to delete follow_request notifications they
-- created on the target's behalf. This enables cleanup when a follow request
-- is cancelled. Scoped to follow_request type only for safety.
CREATE POLICY "actor_can_delete_own_follow_request_notif"
  ON public.notifications
  FOR DELETE
  USING (
    actor_id = (SELECT auth.uid())
    AND type = 'follow_request'
  );

-- Allow the recipient (user_id) to delete their own notifications.
-- Required so accept/decline actions can remove the follow_request
-- notification from the recipient's inbox after it's been acted upon.
CREATE POLICY "user_can_delete_own_notifications"
  ON public.notifications
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
  );
