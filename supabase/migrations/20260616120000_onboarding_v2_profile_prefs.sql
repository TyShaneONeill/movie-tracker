-- =====================================================================
-- Onboarding v2 — profile preference columns
-- Captured by the new cinematic onboarding flow (genres / eras / where-you-watch).
--
-- SAFETY NOTE (re: 20260605062443 privileged-col trigger):
--   protect_profile_privileged_cols() is a DENYLIST — it only pins
--   account_tier / tier_expires_at / rewarded_ad_credits / id back to OLD
--   for the 'authenticated'/'anon' roles. New columns are NOT in that set,
--   so they are freely self-writable by the owner under the existing
--   "Users can update their own profile" policy (WITH CHECK auth.uid() = id).
--   DO NOT add these columns to that trigger.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_genres text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_eras   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS viewing_pref    text;

-- viewing_pref is a single-select; constrain to the three known values (nullable
-- = not answered yet). Matches OnboardingV2 WhereYouWatch step.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_viewing_pref_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_viewing_pref_check
  CHECK (viewing_pref IS NULL OR viewing_pref IN ('theater', 'streaming', 'both'));

COMMENT ON COLUMN public.profiles.favorite_genres IS 'Onboarding v2: selected genre slugs (e.g. {sci-fi,drama}). Seeds home feed / recs.';
COMMENT ON COLUMN public.profiles.favorite_eras   IS 'Onboarding v2: selected decade slugs (e.g. {1970s,1990s}). Empty array = "across all eras".';
COMMENT ON COLUMN public.profiles.viewing_pref     IS 'Onboarding v2: theater | streaming | both. Decides which tools surface first.';
