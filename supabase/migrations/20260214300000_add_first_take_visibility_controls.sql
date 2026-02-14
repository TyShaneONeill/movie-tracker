-- Per-review visibility on first_takes
ALTER TABLE public.first_takes
  ADD COLUMN visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'followers_only', 'private'));

-- Default review visibility preference on profiles
ALTER TABLE public.profiles
  ADD COLUMN review_visibility text NOT NULL DEFAULT 'public'
  CHECK (review_visibility IN ('public', 'followers_only', 'private'));

-- Index to help the RLS policy filter efficiently
CREATE INDEX idx_first_takes_visibility ON public.first_takes (visibility);

-- Replace the blanket public-readable policy with visibility-aware policy
DROP POLICY "First takes are publicly readable" ON public.first_takes;

CREATE POLICY "First takes visible based on privacy setting"
  ON public.first_takes FOR SELECT
  TO public
  USING (
    visibility = 'public'
    OR user_id = (select auth.uid())
    OR (
      visibility = 'followers_only'
      AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (select auth.uid())
        AND following_id = first_takes.user_id
      )
    )
  );
