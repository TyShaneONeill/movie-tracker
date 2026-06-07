-- supabase/migrations/20260607220702_ticket_photos_private_owner_only.sql
-- Security P2: ticket photos are personal (a ticket stub can leak a user's
-- location), so make the bucket PRIVATE and restrict reads to the owner.
--
-- INSERT/UPDATE policies are already owner-scoped (foldername[1] = auth.uid()).
-- Only the SELECT was a blanket public read that let any client enumerate every
-- user's ticket photos. The app mints short-lived signed URLs at render time
-- (PR #525) so display still works against the private bucket.
--
-- Applied to prod via Supabase MCP 2026-06-07 (verified behaviorally: owner sees
-- own = 6, non-owner sees any = 0, bucket public = false). Idempotent for fresh DBs.

UPDATE storage.buckets SET public = false WHERE id = 'ticket-photos';

DROP POLICY IF EXISTS "Ticket photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own ticket photos" ON storage.objects;

CREATE POLICY "Users can read their own ticket photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
