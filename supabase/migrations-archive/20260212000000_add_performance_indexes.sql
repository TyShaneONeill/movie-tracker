-- ============================================
-- Performance Indexes for CineTrak
-- Only indexes not already present
-- ============================================

-- Activity feed: composite index for first_takes ordered by time with user lookup
-- (existing idx_first_takes_created_at is single-column, this adds user_id)
CREATE INDEX IF NOT EXISTS idx_first_takes_created_user
ON first_takes(created_at DESC, user_id);

-- User movies: lookup by user and tmdb_id (checking if movie already exists)
CREATE INDEX IF NOT EXISTS idx_user_movies_user_tmdb
ON user_movies(user_id, tmdb_id);

-- Follows: composite for listing followers with time ordering
-- (existing idx_follows_following is single-column, this adds created_at)
CREATE INDEX IF NOT EXISTS idx_follows_following_created
ON follows(following_id, created_at DESC);

-- Follows: composite for listing who a user follows with time ordering
-- (existing idx_follows_follower is single-column, this adds created_at)
CREATE INDEX IF NOT EXISTS idx_follows_follower_created
ON follows(follower_id, created_at DESC);

-- User movie likes: lookup likes by user ordered by time
CREATE INDEX IF NOT EXISTS idx_user_movie_likes_user
ON user_movie_likes(user_id, created_at DESC);
