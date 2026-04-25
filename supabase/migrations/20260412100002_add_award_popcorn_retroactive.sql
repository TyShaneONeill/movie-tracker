CREATE OR REPLACE FUNCTION award_popcorn_retroactive(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  inserted INTEGER := 0;
  batch    INTEGER := 0;
BEGIN
  -- Follows: one kernel per person followed (reference_id = the person's UUID)
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'follow', following_id,
         (hashtext(gen_random_uuid()::text) & 2147483647), true, created_at
  FROM follows WHERE follower_id = p_user_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS batch = ROW_COUNT;
  inserted := inserted + batch;

  -- First Takes
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'first_take', id,
         (hashtext(gen_random_uuid()::text) & 2147483647), true, created_at
  FROM first_takes WHERE user_id = p_user_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS batch = ROW_COUNT;
  inserted := inserted + batch;

  -- Watched movies (user_movies has added_at, not created_at)
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', id,
         (hashtext(gen_random_uuid()::text) & 2147483647), true,
         COALESCE(watched_at, added_at)
  FROM user_movies WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS batch = ROW_COUNT;
  inserted := inserted + batch;

  -- Comments
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'comment', id,
         (hashtext(gen_random_uuid()::text) & 2147483647), true, created_at
  FROM review_comments WHERE user_id = p_user_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS batch = ROW_COUNT;
  inserted := inserted + batch;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
