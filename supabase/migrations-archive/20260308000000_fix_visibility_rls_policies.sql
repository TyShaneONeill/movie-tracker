-- ============================================================================
-- Phase 1: Fix critical visibility RLS bugs
--
-- Three tables have visibility/privacy columns but no RLS enforcement:
--   1. reviews     — has visibility column, no SELECT policy
--   2. user_lists  — has is_public column, no SELECT policy
--   3. user_movies — no privacy controls, no RLS at all
--
-- This migration adds RLS policies to enforce existing visibility settings.
-- No UI changes required — these policies work with the existing app code.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Reviews: enforce visibility column via RLS
--    Same pattern as first_takes (migration 20260214300000)
-- --------------------------------------------------------------------------

-- Safety: drop if exists to avoid conflicts on re-run
DROP POLICY IF EXISTS "Reviews visible based on privacy setting" ON public.reviews;

CREATE POLICY "Reviews visible based on privacy setting"
  ON public.reviews FOR SELECT
  TO public
  USING (
    visibility = 'public'
    OR user_id = (SELECT auth.uid())
    OR (
      visibility = 'followers_only'
      AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (SELECT auth.uid())
          AND following_id = reviews.user_id
      )
    )
  );

-- --------------------------------------------------------------------------
-- 2. User Lists: enforce is_public column via RLS
--    Public lists visible to all, private lists visible to owner only
-- --------------------------------------------------------------------------

-- Ensure RLS is enabled on user_lists (idempotent)
ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lists visible based on privacy setting" ON public.user_lists;

CREATE POLICY "Lists visible based on privacy setting"
  ON public.user_lists FOR SELECT
  TO public
  USING (
    is_public = true
    OR user_id = (SELECT auth.uid())
  );

-- --------------------------------------------------------------------------
-- 3. User Movies: enable RLS with publicly readable policy
--    For now, keep user_movies publicly readable (no profile privacy yet).
--    This will be updated in Phase 2 when profile privacy is added.
-- --------------------------------------------------------------------------

-- Ensure RLS is enabled on user_movies (idempotent)
ALTER TABLE public.user_movies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User movies are publicly readable" ON public.user_movies;

CREATE POLICY "User movies are publicly readable"
  ON public.user_movies FOR SELECT
  TO public
  USING (true);
