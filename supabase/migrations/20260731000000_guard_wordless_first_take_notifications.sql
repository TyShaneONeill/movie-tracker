-- Wordless first takes never render on public surfaces (Ty, 2026-07-31) — so
-- they must never fan out a follower notification either.
--
-- `trg_notify_followers_first_take` (AFTER INSERT ON first_takes, installed in
-- 20260525063629_remote_schema.sql) calls notify_followers_on_review(), which
-- inserts a 'friend_reviewed' notification for every follower who also has the
-- title in their library. It has no quote_text guard. With the client render
-- filter in place that produces the worst kind of notification: "X reviewed Y"
-- taps through to a screen with nothing on it. The 'friend_reviewed' handler in
-- app/notifications.tsx only routes on data.review_id, and this trigger writes
-- data.first_take_id, so the tap falls through to /movie/{tmdb_id} — a movie
-- page with no take in sight.
--
-- Same shape as the guard added to the sibling trigger function in
-- 20260715090000_tvtime_deck_quiet_ratings.sql (quiet TV Time ratings): body
-- preserved verbatim from remote_schema, only the early return is new.
--
-- Consequence worth knowing: the trigger is AFTER INSERT only. A take posted
-- wordless and later edited to add words fans out to nobody. That matches the
-- invariant (it wasn't public when it was posted) and matches today's behaviour
-- for every other edit, which also fans out to nobody. Revisit only if the
-- edit-to-add-words path becomes common.
CREATE OR REPLACE FUNCTION "public"."notify_followers_on_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  follower_record RECORD;
BEGIN
  -- Wordless path: a rating-only take renders on no public surface, so it
  -- notifies nobody. The rating is still recorded and still feeds the owner's
  -- stats — this suppresses the fan-out only.
  IF NEW.quote_text IS NULL OR trim(NEW.quote_text) = '' THEN
    RETURN NEW;
  END IF;

  -- Find followers of the reviewer who also have this movie in user_movies (any status)
  FOR follower_record IN
    SELECT f.follower_id
    FROM follows f
    INNER JOIN user_movies um ON um.user_id = f.follower_id AND um.tmdb_id = NEW.tmdb_id
    WHERE f.following_id = NEW.user_id
      AND f.follower_id != NEW.user_id  -- Don't notify self
  LOOP
    -- Insert notification, skip duplicates silently
    INSERT INTO notifications (user_id, actor_id, type, data, read)
    VALUES (
      follower_record.follower_id,
      NEW.user_id,
      'friend_reviewed',
      jsonb_build_object(
        'tmdb_id', NEW.tmdb_id,
        'movie_title', NEW.movie_title,
        'first_take_id', NEW.id
      ),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."notify_followers_on_review"() OWNER TO "postgres";

-- Grants posture (house rule, reached prod three times: 2026-06-05 / 07-03 /
-- 07-22). CREATE OR REPLACE PRESERVES the existing ACL, and remote_schema
-- granted ALL to anon AND authenticated on this function (lines 4298-4299), so
-- without these REVOKEs those grants survive untouched. Revoking PUBLIC alone
-- is a no-op for anon — all three principals must be named.
--
-- This is a trigger function: it is invoked by the first_takes AFTER INSERT
-- trigger, never directly by a client, and Postgres does not check EXECUTE for
-- trigger invocation. So service_role is the only grantee it needs and the
-- trigger keeps firing for everyone.
REVOKE ALL ON FUNCTION "public"."notify_followers_on_review"() FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."notify_followers_on_review"() TO "service_role";
