-- Schedule sync-tracked-show-metadata: make TV show metadata guaranteed.
--
-- WHY HOURLY AND NOT DAILY
-- ------------------------
-- A full sweep is ~182 distinct shows and ~850 TMDB calls, which does not fit
-- one edge-function invocation. The function therefore takes a BOUNDED batch of
-- the stalest shows per run and is idempotent, so the schedule is a dumb
-- heartbeat and the FUNCTION'S QUERY decides what is actually due. Same division
-- of labour as the weekly-recap fix (20260711...): a cron that tries to be
-- clever about scheduling is the part that breaks.
--
-- Hourly x 25 shows = 600 refresh slots/day against 182 shows, so the initial
-- backfill converges inside a day. After that almost every tick is a cheap
-- no-op: the query only returns shows whose metadata_refreshed_at is older than
-- 24h, so steady-state work is roughly 182/24 ≈ 8 shows per run.
--
-- WHAT DEPENDS ON THIS
-- --------------------
-- Three user-visible features read columns that were previously populated only
-- as a side effect of a user browsing (client-side lib/metadata-refresh.ts, and
-- get-season-episodes upserting whichever season someone opened). Measured on
-- prod 2026-07-27: tmdb_status NULL on 217/219 rows, zero catalog rows for
-- 118/194 shows, number_of_seasons NULL on 135/219, number_of_episodes NULL on
-- 121/194.
--
--   1. "Caught Up" (hooks/use-show-caught-up.ts) — bails unless tmdb_status is
--      non-null, so it never renders for ~99% of shows.
--   2. The Ended-show auto-flip (check_and_flip_show_completion) — requires
--      tmdb_status IN ('Ended','Canceled') AND number_of_seasons NOT NULL.
--   3. Continue Watching progress — needs number_of_episodes.
--
-- timeout_milliseconds mirrors warm-release-calendar-daily. Note pg_net's own
-- reply timeout is separate from the function's wall clock: a timeout here means
-- "we stopped waiting for the response", NOT that the function failed — the
-- batch may well have completed. Because every run is idempotent and
-- metadata_refreshed_at is stamped only after a show fully succeeds, a dropped
-- response costs nothing: the next tick simply picks the show up again.

SELECT cron.schedule(
  'sync-tracked-show-metadata-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/sync-tracked-show-metadata',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{"max_shows": 25}'::jsonb,
    timeout_milliseconds := 600000
  ) AS request_id;
  $cron$
);
