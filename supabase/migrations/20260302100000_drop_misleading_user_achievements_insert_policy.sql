-- H6: Drop the misleading "Service role can insert user achievements" INSERT policy.
-- This policy had with_check = false (deny all inserts via RLS), but service_role
-- bypasses RLS entirely, making the policy redundant. With RLS enabled and no
-- INSERT policy, inserts are blocked by default for all roles except service_role,
-- which is the intended behavior.
DROP POLICY IF EXISTS "Service role can insert user achievements" ON public.user_achievements;
