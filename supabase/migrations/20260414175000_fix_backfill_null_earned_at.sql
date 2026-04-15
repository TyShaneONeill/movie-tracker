-- Fix: user_tv_shows.updated_at can be NULL which violated earned_at NOT NULL.
-- Use COALESCE(updated_at, added_at, now()) to guarantee a non-null timestamp.

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

  -- Movies watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'movie:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(watched_at, added_at, now())
  FROM user_movies WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- TV shows watched
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', 'tv:' || tmdb_id::text,
         abs(hashtext(gen_random_uuid()::text)), true, COALESCE(updated_at, added_at, now())
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
