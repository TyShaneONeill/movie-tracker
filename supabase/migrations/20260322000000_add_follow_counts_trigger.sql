-- Migration: Add trigger to maintain followers_count and following_count on profiles
--
-- The follows table uses follower_id (the person who follows) and following_id
-- (the person being followed). When a follow is created or deleted, we update:
--   profiles.following_count  for the follower_id user
--   profiles.followers_count  for the following_id user
--
-- This trigger already exists in production (applied manually). This migration
-- captures it so new environments can be spun up from migrations alone.
-- Uses CREATE OR REPLACE / IF NOT EXISTS to be idempotent.

CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Follower gains +1 following
    UPDATE public.profiles
    SET following_count = COALESCE(following_count, 0) + 1
    WHERE id = NEW.follower_id;

    -- Followee gains +1 follower
    UPDATE public.profiles
    SET followers_count = COALESCE(followers_count, 0) + 1
    WHERE id = NEW.following_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Follower loses 1 following (floor at 0)
    UPDATE public.profiles
    SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0)
    WHERE id = OLD.follower_id;

    -- Followee loses 1 follower (floor at 0)
    UPDATE public.profiles
    SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop and recreate trigger to ensure correct definition
DROP TRIGGER IF EXISTS on_follow_change ON public.follows;

CREATE TRIGGER on_follow_change
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_follow_counts();

-- Backfill: recompute counts from current follows data in case of any drift
-- (safe to run even if counts are already correct)
UPDATE public.profiles p
SET
  followers_count = (
    SELECT COUNT(*) FROM public.follows WHERE following_id = p.id
  ),
  following_count = (
    SELECT COUNT(*) FROM public.follows WHERE follower_id = p.id
  );
