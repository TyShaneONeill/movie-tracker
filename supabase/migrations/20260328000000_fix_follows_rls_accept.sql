-- ============================================================================
-- Fix RLS on follows table to allow the target user to insert follow rows
-- when accepting a follow request.
--
-- Root cause: acceptFollowRequest and acceptAllPendingRequests call
--   supabase.from('follows').insert({ follower_id, following_id })
-- from the client as auth.uid() = following_id (the target/acceptor).
-- The existing INSERT policy requires follower_id = auth.uid(), so the
-- insert is rejected with an RLS violation when target_id != requester_id.
--
-- Fix: add a second INSERT policy that allows following_id = auth.uid(),
-- covering the accept-a-request case without removing the original policy.
-- ============================================================================

CREATE POLICY "target_can_accept_follows" ON public.follows
  FOR INSERT WITH CHECK (following_id = auth.uid());
