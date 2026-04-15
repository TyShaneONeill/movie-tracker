-- reference_id was UUID but TMDB IDs are integers — every earn('mark_watched', ...)
-- call has been silently failing since launch. Fix: change to TEXT and re-key
-- mark_watched rows with prefixed TMDB IDs so movie/TV IDs can't collide.

-- 1. Change column type (existing UUID values cast cleanly to TEXT)
ALTER TABLE public.user_popcorn
  ALTER COLUMN reference_id TYPE TEXT USING reference_id::text;

-- 2. Drop and re-create unique constraint (same logic, now on TEXT)
ALTER TABLE public.user_popcorn
  DROP CONSTRAINT IF EXISTS user_popcorn_user_id_action_type_reference_id_key;

ALTER TABLE public.user_popcorn
  ADD CONSTRAINT user_popcorn_user_id_action_type_reference_id_key
  UNIQUE NULLS NOT DISTINCT (user_id, action_type, reference_id);

-- 3. Remove stale mark_watched rows — they have UUID reference_ids from the old
--    backfill format and will be re-created correctly by the v4 backfill.
DELETE FROM public.user_popcorn WHERE action_type = 'mark_watched';

-- 4. Update backfill to use prefixed TMDB IDs consistently
CREATE OR REPLACE FUNCTION award_popcorn_retroactive(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_first_take_count INTEGER;
  v_comment_count INTEGER;
  v_like_count INTEGER;
  v_owed INTEGER;
  v_earned INTEGER;
  i INTEGER;
BEGIN
  -- Follows
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'follow', following_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM follows WHERE follower_id = p_user_id
  ON CONFLICT DO NOTHING;

  -- Movies watched — prefix 'movie:' to avoid TMDB ID collision with TV
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'movie:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(watched_at, added_at)
  FROM user_movies WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- TV shows watched — prefix 'tv:' to avoid TMDB ID collision with movies
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'tv:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, updated_at
  FROM user_tv_shows WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- first_take: 1 kernel per 10
  SELECT COUNT(*) INTO v_first_take_count FROM first_takes WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'first_take';
  v_owed := FLOOR(v_first_take_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'first_take', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- comment: 1 kernel per 10
  SELECT COUNT(*) INTO v_comment_count FROM review_comments WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'comment';
  v_owed := FLOOR(v_comment_count / 10) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'comment', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  -- like: 1 kernel per 50
  SELECT COUNT(*) INTO v_like_count FROM review_likes WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_earned FROM user_popcorn
    WHERE user_id = p_user_id AND action_type = 'like';
  v_owed := FLOOR(v_like_count / 50) - v_earned;
  FOR i IN 1..GREATEST(v_owed, 0) LOOP
    INSERT INTO user_popcorn (user_id, action_type, seed, is_retroactive)
    VALUES (p_user_id, 'like', abs(hashtext(gen_random_uuid()::text)), true);
  END LOOP;

  RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
