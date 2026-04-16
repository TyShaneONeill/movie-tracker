-- Allow users to read their own AI usage cost records.
-- The client needs this to determine whether the free trial has been used,
-- matching the same check the generate-journey-art edge function performs.
CREATE POLICY "Users can read own ai_usage_costs"
  ON public.ai_usage_costs
  FOR SELECT
  USING (auth.uid() = user_id);
