-- ============================================================================
-- Phase 2: Profile privacy infrastructure
--
-- Adds profile-level privacy with the "ceiling rule": the more restrictive
-- of profile privacy and content visibility always wins.
--
-- Changes:
--   1. profiles.is_private column (default false)
--   2. profiles.pending_followers_count column (default 0)
--   3. follow_requests table with RLS
--   4. can_view_user_content() helper function
--   5. Updated RLS policies on first_takes, reviews, user_movies, user_lists
--   6. Performance indexes
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Add is_private column to profiles
-- --------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN is_private boolean NOT NULL DEFAULT false;

-- --------------------------------------------------------------------------
-- 2. Add pending_followers_count column to profiles (for UI display)
-- --------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN pending_followers_count integer NOT NULL DEFAULT 0;

-- --------------------------------------------------------------------------
-- 3. Create follow_requests table
-- --------------------------------------------------------------------------

CREATE TABLE public.follow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, target_id)
);

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

-- Users can see requests they sent or received
CREATE POLICY "Users can view their own follow requests"
  ON public.follow_requests FOR SELECT
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    OR target_id = (SELECT auth.uid())
  );

-- Users can create follow requests (must be the requester)
CREATE POLICY "Users can create follow requests"
  ON public.follow_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (SELECT auth.uid()));

-- Requester can cancel, target can decline
CREATE POLICY "Users can delete their own follow requests"
  ON public.follow_requests FOR DELETE
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    OR target_id = (SELECT auth.uid())
  );

-- --------------------------------------------------------------------------
-- 4. Create can_view_user_content() helper function
--
-- Implements the ceiling rule:
--   - Owner always sees own content
--   - Private content is always owner-only
--   - Private profile caps all content to followers-only
--   - Public profile respects content visibility as-is
--
-- SECURITY DEFINER: runs with the function owner's privileges so it can
--   query profiles and follows regardless of the caller's RLS context.
-- STABLE: tells the query planner this function returns the same result
--   for the same inputs within a single statement (optimization hint).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_user_content(
  content_user_id uuid,
  content_visibility text DEFAULT 'public'
) RETURNS boolean AS $$
DECLARE
  profile_private boolean;
  viewer_id uuid;
  is_follower boolean;
BEGIN
  viewer_id := (SELECT auth.uid());

  -- Owner always sees own content
  IF viewer_id = content_user_id THEN
    RETURN true;
  END IF;

  -- Private content is always owner-only (already handled above)
  IF content_visibility = 'private' THEN
    RETURN false;
  END IF;

  -- Check if the content owner's profile is private
  SELECT is_private INTO profile_private
    FROM public.profiles
    WHERE id = content_user_id;

  -- Check if the viewer follows the content owner
  SELECT EXISTS(
    SELECT 1 FROM public.follows
    WHERE follower_id = viewer_id
      AND following_id = content_user_id
  ) INTO is_follower;

  -- Private profile: all non-private content requires follower status
  -- (ceiling rule: profile privacy caps content visibility)
  IF profile_private THEN
    RETURN is_follower;
  END IF;

  -- Public profile: respect content visibility setting
  IF content_visibility = 'public' THEN
    RETURN true;
  END IF;

  IF content_visibility = 'followers_only' THEN
    RETURN is_follower;
  END IF;

  -- Fallback: deny access for unknown visibility values
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- --------------------------------------------------------------------------
-- 5. Update RLS policies to use can_view_user_content()
-- --------------------------------------------------------------------------

-- 5A. First Takes: replace existing visibility policy with profile-aware policy
DROP POLICY IF EXISTS "First takes visible based on privacy setting" ON public.first_takes;

CREATE POLICY "First takes visible with profile privacy"
  ON public.first_takes FOR SELECT
  TO public
  USING (public.can_view_user_content(user_id, visibility));

-- 5B. Reviews: replace Phase 1 policy with profile-aware policy
DROP POLICY IF EXISTS "Reviews visible based on privacy setting" ON public.reviews;

CREATE POLICY "Reviews visible with profile privacy"
  ON public.reviews FOR SELECT
  TO public
  USING (public.can_view_user_content(user_id, visibility));

-- 5C. User Movies: replace Phase 1 policy with profile-aware policy
--     user_movies has no per-item visibility, so pass 'public' as default
DROP POLICY IF EXISTS "User movies are publicly readable" ON public.user_movies;

CREATE POLICY "User movies visible with profile privacy"
  ON public.user_movies FOR SELECT
  TO public
  USING (public.can_view_user_content(user_id, 'public'));

-- 5D. User Lists: replace Phase 1 policy with profile-aware policy
--     Convert is_public boolean to visibility string for the function
DROP POLICY IF EXISTS "Lists visible based on privacy setting" ON public.user_lists;

CREATE POLICY "Lists visible with profile privacy"
  ON public.user_lists FOR SELECT
  TO public
  USING (
    public.can_view_user_content(
      user_id,
      CASE WHEN is_public THEN 'public' ELSE 'private' END
    )
  );

-- --------------------------------------------------------------------------
-- 6. Performance indexes
-- --------------------------------------------------------------------------

-- follows(follower_id, following_id) — already covered by UNIQUE constraint
-- follows_follower_id_following_id_key, so no additional index needed.

-- Partial index on private profiles (small subset, fast lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_is_private
  ON public.profiles (is_private)
  WHERE is_private = true;

-- Follow requests: lookup by target (pending requests for a user)
CREATE INDEX IF NOT EXISTS idx_follow_requests_target_id
  ON public.follow_requests (target_id, created_at DESC);

-- Follow requests: lookup by requester (sent requests)
CREATE INDEX IF NOT EXISTS idx_follow_requests_requester_id
  ON public.follow_requests (requester_id, created_at DESC);
