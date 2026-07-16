-- TV Time import — blank-stubs rating deck (PR 4): quiet-rating provenance.
--
-- The deck lets a user backfill ratings for their imported library ("ink your
-- blank stubs"). A heavy user inking hundreds of movies must NOT fan out
-- hundreds of follower notifications (nor flood the activity feed) the way an
-- organic review does. Ratings are stored as `reviews` rows, and the
-- AFTER INSERT trigger `trg_notify_followers_review` fans out a
-- 'friend_reviewed' notification per eligible follower on every insert — with
-- no condition to suppress it.
--
-- Fix, mirroring the #683 source-provenance pattern on user_movies/
-- user_episode_watches: tag deck-written ratings with reviews.source =
-- 'tvtime_import' and teach the notification trigger to skip them. The feed
-- (lib/feed-service.ts), the profile Reviews tab + count, and the import are
-- filtered on the client for the same provenance value; the row stays private
-- to the community. (Stats note: rating personality reads first_takes, NOT
-- reviews, so quiet ratings have exact PARITY with organic review-ratings —
-- neither feeds personality; the per-title value is "your rating" on the
-- title detail. The weekly-recap reviews_count + Critic count also exclude
-- source='tvtime_import' — see 20260716100000 + the check-achievements fn.)

-- 1) Provenance column. NOT NULL DEFAULT 'manual' backfills every existing row
--    as organically authored; only the deck write-path sets 'tvtime_import'.
ALTER TABLE "public"."reviews"
  ADD COLUMN IF NOT EXISTS "source" "text" NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_source_check'
  ) THEN
    ALTER TABLE "public"."reviews"
      ADD CONSTRAINT "reviews_source_check"
      CHECK ("source" = ANY (ARRAY['manual'::"text", 'tvtime_import'::"text"]));
  END IF;
END $$;

COMMENT ON COLUMN "public"."reviews"."source" IS
  'Provenance of the rating/review. ''manual'' = organically authored in-app '
  '(fans out follower notifications + shows in the feed). ''tvtime_import'' = '
  'a quiet rating inked from the TV Time import deck: excluded from the '
  'notify_followers_on_full_review fan-out and from the activity feed / '
  'profile Reviews tab. Rating personality reads first_takes (not reviews), so '
  'quiet ratings have stats parity with organic review-ratings.';

-- 2) Teach the follower-notification trigger to skip quiet (imported) ratings.
--    Body is preserved verbatim from 20260525063629_remote_schema.sql; only the
--    early-return guard is added.
CREATE OR REPLACE FUNCTION "public"."notify_followers_on_full_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  follower_record RECORD;
BEGIN
  -- Quiet path: ratings inked from the TV Time import deck never notify
  -- followers (a 600-item backfill must not spam). Organic reviews are unaffected.
  IF NEW.source = 'tvtime_import' THEN
    RETURN NEW;
  END IF;

  FOR follower_record IN
    SELECT f.follower_id
    FROM follows f
    INNER JOIN user_movies um ON um.user_id = f.follower_id AND um.tmdb_id = NEW.tmdb_id
    WHERE f.following_id = NEW.user_id
      AND f.follower_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, data, read)
    VALUES (
      follower_record.follower_id,
      NEW.user_id,
      'friend_reviewed',
      jsonb_build_object(
        'tmdb_id', NEW.tmdb_id,
        'movie_title', NEW.movie_title,
        'review_id', NEW.id
      ),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_followers_on_full_review"() OWNER TO "postgres";

-- Grants posture (house rule, twice burned 2026-06-05 / 2026-07-03): revoke
-- PUBLIC + anon + authenticated all three, then grant back only what must call
-- it. This is a trigger function — invoked by the reviews AFTER INSERT trigger,
-- never directly by a client — so service_role is the only grantee. (Postgres
-- does not check EXECUTE for trigger invocation, so the trigger keeps firing.)
REVOKE ALL ON FUNCTION "public"."notify_followers_on_full_review"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."notify_followers_on_full_review"() TO "service_role";
