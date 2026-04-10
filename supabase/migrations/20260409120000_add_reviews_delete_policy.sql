-- Add DELETE RLS policy to reviews table so only the owner can delete their own reviews.
-- The table already has a SELECT policy; INSERT/UPDATE work via authenticated client.

CREATE POLICY "Users can delete own reviews"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
