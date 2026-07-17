-- Atomic episodes_watched recompute for the TV Time importer (#691, pre-100%-widen).
--
-- Replaces the import-tvtime edge fn's per-show COUNT-then-UPDATE (a non-atomic
-- read-then-write that had a low but real concurrent-stale-write race, and cost
-- 2 round-trips per show). This RPC recomputes episodes_watched for a SET of
-- user_tv_shows in one set-based statement: each show's counter is set to the
-- number of its watch_number=1 episode rows — the SAME semantics the organic
-- writer sync_tv_show_progress uses (see 20260525063629_remote_schema.sql).
--
-- Deliberately does NOT touch current_season/current_episode or updated_at: the
-- importer intentionally leaves current_* unset (the founder's Continue-Watching
-- card shows an "N/total" count, not "S# E#"), and mirrors the edge fn's prior
-- behaviour of writing episodes_watched only. Scoped to the caller's own rows
-- (p_user_id) as defence-in-depth even though only the service_role calls it.
--
-- Grants posture (repo drift-guard, 20260710093000): server/cron only — the sole
-- caller is the import-tvtime edge fn via a service_role client. REVOKE from
-- PUBLIC, anon, authenticated (all three explicit, because anon/authenticated
-- inherit PUBLIC); GRANT EXECUTE to service_role only.

CREATE OR REPLACE FUNCTION public.recompute_episodes_watched(
  p_user_tv_show_ids uuid[],
  p_user_id uuid
) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE user_tv_shows t
  SET episodes_watched = (
    SELECT count(*)
    FROM user_episode_watches w
    WHERE w.user_tv_show_id = t.id
      AND w.watch_number = 1
  )
  WHERE t.id = ANY(p_user_tv_show_ids)
    AND t.user_id = p_user_id;
$$;

ALTER FUNCTION public.recompute_episodes_watched(uuid[], uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recompute_episodes_watched(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_episodes_watched(uuid[], uuid) TO service_role;
