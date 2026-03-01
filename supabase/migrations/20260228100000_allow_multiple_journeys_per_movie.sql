-- Allow multiple journeys (rewatches) per user per movie
-- The old unique constraint on (user_id, tmdb_id) prevents creating
-- additional journeys for the same movie. Replace it with a constraint
-- on (user_id, tmdb_id, journey_number) so each rewatch gets its own row.

-- Drop the old constraint that blocks multiple journeys
-- Actual name is "unique_user_movie" (not "user_unique_user_movie")
ALTER TABLE user_movies DROP CONSTRAINT IF EXISTS unique_user_movie;

-- Backfill any rows missing a journey_number (set to 1 as the first viewing)
UPDATE user_movies SET journey_number = 1 WHERE journey_number IS NULL;

-- Add new unique constraint allowing multiple journeys per movie
ALTER TABLE user_movies
  ADD CONSTRAINT user_unique_user_movie_journey
  UNIQUE (user_id, tmdb_id, journey_number);
