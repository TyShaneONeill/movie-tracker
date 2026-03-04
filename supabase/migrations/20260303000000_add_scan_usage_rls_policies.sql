-- Add missing RLS policies to scan_usage table
-- The table has RLS enabled but no SELECT/UPDATE policies for authenticated users,
-- causing 401 errors when the client queries scan status.

CREATE POLICY "Users can view their own scan usage"
  ON public.scan_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own scan usage"
  ON public.scan_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
