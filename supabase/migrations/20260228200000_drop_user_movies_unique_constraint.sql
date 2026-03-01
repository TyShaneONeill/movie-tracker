-- Drop the unique constraint on user_movies(user_id, tmdb_id) that
-- prevents multiple journeys per movie.
-- The actual constraint name is "unique_user_movie" (found via pg_catalog).

ALTER TABLE user_movies DROP CONSTRAINT IF EXISTS unique_user_movie;
