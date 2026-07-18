-- One-off backfill: recompute episodes_watched for EVERY user_tv_shows row (#707).
--
-- The #696/#691 RPC (recompute_episodes_watched) heals episodes_watched ONLY for
-- shows touched by the TV Time importer, on import. Organic accounts — anyone
-- who never ran the importer, or whose shows predate #696 — carry historical
-- drift (stale/zero episodes_watched) that RPC never reaches. The Continue-
-- Watching progress bar gates on episodes_watched > 0
-- (components/cards/continue-watching-card.tsx), so drift means the bar
-- silently never renders. Ty's own organic account hit this 2026-07-17.
--
-- This generalizes the #696 RPC to ALL (user, show) rows in one set-based
-- UPDATE — no per-user loop. Same count semantics as recompute_episodes_watched
-- and the organic writer sync_tv_show_progress: count of watch_number=1 rows
-- per user_tv_show_id. The LEFT JOIN (rather than aggregating only rows with a
-- match) also corrects shows with ZERO user_episode_watches rows down to 0
-- instead of skipping them.
--
-- Idempotent: the WHERE clause only touches rows whose stored count differs
-- from the actual count, so a second run affects 0 rows.
--
-- Two objects:
--   1. recompute_episodes_watched_all() — a reusable SECURITY DEFINER RPC, same
--      grant posture as #696 (service_role only), so future drift can be healed
--      again without a new migration.
--   2. An immediate call below, to perform the backfill now.

CREATE OR REPLACE FUNCTION public.recompute_episodes_watched_all()
RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  affected bigint;
BEGIN
  UPDATE user_tv_shows t
  SET episodes_watched = COALESCE(w.cnt, 0)
  FROM user_tv_shows all_shows
  LEFT JOIN (
    SELECT user_tv_show_id, count(*) AS cnt
    FROM user_episode_watches
    WHERE watch_number = 1
    GROUP BY user_tv_show_id
  ) w ON w.user_tv_show_id = all_shows.id
  WHERE t.id = all_shows.id
    AND t.episodes_watched IS DISTINCT FROM COALESCE(w.cnt, 0);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

ALTER FUNCTION public.recompute_episodes_watched_all() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recompute_episodes_watched_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_episodes_watched_all() TO service_role;

-- Perform the one-off backfill now (runs as the migration-apply role, which
-- owns the function, so the service_role-only grant above doesn't block it).
SELECT public.recompute_episodes_watched_all();
