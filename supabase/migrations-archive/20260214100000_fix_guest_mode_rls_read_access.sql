-- ============================================================================
-- Fix guest/anon read access for public data
--
-- Guest mode (Apple App Store compliance) requires browsing without auth.
-- Three SELECT policies currently restrict reads to {authenticated} role,
-- blocking guests from seeing the activity feed, user profiles, and follow
-- relationships. Change these to {public} so the anon role can read them.
--
-- Write policies are NOT changed — all remain gated by auth.uid().
-- ============================================================================

-- 1. Profiles: allow guest browsing of user profiles
DROP POLICY "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Profiles are publicly readable"
  ON public.profiles FOR SELECT
  TO public
  USING (true);

-- 2. First Takes: allow guest browsing of activity feed
DROP POLICY "Authenticated users can view all first takes" ON public.first_takes;
CREATE POLICY "First takes are publicly readable"
  ON public.first_takes FOR SELECT
  TO public
  USING (true);

-- 3. Follows: allow guest browsing of follow relationships / counts
DROP POLICY "Follows are viewable by everyone" ON public.follows;
CREATE POLICY "Follows are publicly readable"
  ON public.follows FOR SELECT
  TO public
  USING (true);
