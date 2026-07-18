-- Extends the #709 orphaned-notification fix to the rest of the audited
-- social_editing delete surface: reviews, first_takes, review_likes, and
-- comment_likes all write a notification on insert (friend_reviewed,
-- like_review, like_first_take, comment_like) with no delete-side cleanup —
-- same orphan class as review_comments (20260718090000), just on different
-- source tables.
--
-- review_likes and comment_likes need actor_id in the match (unlike the
-- follow/comment triggers) because multiple users can like the same review/
-- first_take/comment, each producing its own notification row for the same
-- target id — deleting one like must only remove that liker's notification,
-- not everyone's.

-- reviews -> 'friend_reviewed' (data->>'review_id')
CREATE OR REPLACE FUNCTION "public"."cleanup_review_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type = 'friend_reviewed'
     AND data->>'review_id' = OLD.id::text;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_review_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_reviews_cleanup_notifications" ON "public"."reviews";
CREATE TRIGGER "trg_reviews_cleanup_notifications"
AFTER DELETE ON "public"."reviews"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_review_notifications"();

DELETE FROM "public"."notifications" n
 WHERE n.type = 'friend_reviewed'
   AND n.data ? 'review_id'
   AND NOT EXISTS (
     SELECT 1 FROM "public"."reviews" r WHERE r.id::text = n.data->>'review_id'
   );

-- first_takes -> 'friend_reviewed' (data->>'first_take_id')
CREATE OR REPLACE FUNCTION "public"."cleanup_first_take_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type = 'friend_reviewed'
     AND data->>'first_take_id' = OLD.id::text;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_first_take_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_first_takes_cleanup_notifications" ON "public"."first_takes";
CREATE TRIGGER "trg_first_takes_cleanup_notifications"
AFTER DELETE ON "public"."first_takes"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_first_take_notifications"();

DELETE FROM "public"."notifications" n
 WHERE n.type = 'friend_reviewed'
   AND n.data ? 'first_take_id'
   AND NOT EXISTS (
     SELECT 1 FROM "public"."first_takes" ft WHERE ft.id::text = n.data->>'first_take_id'
   );

-- review_likes -> 'like_review' / 'like_first_take' (data->>'review_id' or
-- 'first_take_id', scoped to the unliking actor)
CREATE OR REPLACE FUNCTION "public"."cleanup_review_like_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type IN ('like_review', 'like_first_take')
     AND actor_id = OLD.user_id
     AND (
       (OLD.review_id IS NOT NULL AND data->>'review_id' = OLD.review_id::text)
       OR (OLD.first_take_id IS NOT NULL AND data->>'first_take_id' = OLD.first_take_id::text)
     );
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_review_like_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_review_likes_cleanup_notifications" ON "public"."review_likes";
CREATE TRIGGER "trg_review_likes_cleanup_notifications"
AFTER DELETE ON "public"."review_likes"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_review_like_notifications"();

DELETE FROM "public"."notifications" n
 WHERE n.type IN ('like_review', 'like_first_take')
   AND NOT EXISTS (
     SELECT 1 FROM "public"."review_likes" rl
      WHERE rl.user_id = n.actor_id
        AND (
          (n.data ? 'review_id' AND rl.review_id::text = n.data->>'review_id')
          OR (n.data ? 'first_take_id' AND rl.first_take_id::text = n.data->>'first_take_id')
        )
   );

-- comment_likes -> 'comment_like' (data->>'comment_id', scoped to the
-- unliking actor)
CREATE OR REPLACE FUNCTION "public"."cleanup_comment_like_notifications"()
RETURNS trigger
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE type = 'comment_like'
     AND actor_id = OLD.user_id
     AND data->>'comment_id' = OLD.comment_id::text;
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."cleanup_comment_like_notifications"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_comment_likes_cleanup_notifications" ON "public"."comment_likes";
CREATE TRIGGER "trg_comment_likes_cleanup_notifications"
AFTER DELETE ON "public"."comment_likes"
FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_comment_like_notifications"();

DELETE FROM "public"."notifications" n
 WHERE n.type = 'comment_like'
   AND NOT EXISTS (
     SELECT 1 FROM "public"."comment_likes" cl
      WHERE cl.user_id = n.actor_id
        AND cl.comment_id::text = n.data->>'comment_id'
   );
