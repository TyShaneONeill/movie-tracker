-- M1: Drop redundant indexes
-- idx_movies_tmdb_id: covered by UNIQUE index movies_tmdb_id_key
DROP INDEX IF EXISTS public.idx_movies_tmdb_id;
-- idx_tv_shows_tmdb_id: covered by UNIQUE index tv_shows_tmdb_id_key
DROP INDEX IF EXISTS public.idx_tv_shows_tmdb_id;
-- idx_user_movies_user_id: covered by multiple composite indexes (status, journey, etc.)
DROP INDEX IF EXISTS public.idx_user_movies_user_id;
-- idx_user_movies_user_tmdb: covered by UNIQUE index user_unique_user_movie_journey(user_id, tmdb_id, journey_number)
DROP INDEX IF EXISTS public.idx_user_movies_user_tmdb;
-- idx_user_movies_journey: exact duplicate of UNIQUE index user_unique_user_movie_journey
DROP INDEX IF EXISTS public.idx_user_movies_journey;
-- idx_follows_follower: covered by UNIQUE follows_follower_id_following_id_key and idx_follows_follower_created
DROP INDEX IF EXISTS public.idx_follows_follower;
-- idx_follows_following: covered by idx_follows_following_created
DROP INDEX IF EXISTS public.idx_follows_following;

-- M2: Add missing indexes for FK lookup performance
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_comments_user_id
  ON public.watchlist_comments (user_id);
