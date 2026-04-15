CREATE OR REPLACE FUNCTION award_popcorn_retroactive(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE inserted INTEGER := 0;
BEGIN
  -- Follows
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'follow', following_id,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM follows WHERE follower_id = p_user_id
  ON CONFLICT DO NOTHING;

  -- First Takes
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'first_take', id,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM first_takes WHERE user_id = p_user_id
  ON CONFLICT DO NOTHING;

  -- Watched movies
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'mark_watched', id,
         abs(hashtext(gen_random_uuid()::text)), true,
         COALESCE(watched_at, created_at)
  FROM user_movies WHERE user_id = p_user_id AND status = 'watched'
  ON CONFLICT DO NOTHING;

  -- Comments
  INSERT INTO user_popcorn (user_id, action_type, reference_id, seed, is_retroactive, earned_at)
  SELECT p_user_id, 'comment', id,
         abs(hashtext(gen_random_uuid()::text)), true, created_at
  FROM review_comments WHERE user_id = p_user_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
