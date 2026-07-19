-- Episode Rooms (per-episode discussion) read path.
--
-- The room lists every public first take for one episode, newest-first:
--   WHERE tmdb_id = $1 AND season_number = $2 AND episode_number = $3
--   ORDER BY created_at DESC
-- The existing indexes don't serve this: idx_first_takes_unique_tv_episode is
-- USER-scoped (leads with user_id) and idx_first_takes_created_at has no
-- episode key. This composite matches the room filter exactly and carries the
-- recency order so the scan is index-only on the hot path.
CREATE INDEX IF NOT EXISTS idx_first_takes_episode_room
  ON public.first_takes (tmdb_id, season_number, episode_number, created_at DESC);
