-- TWO fixes to the single-episode mark path, found together because the second
-- surfaced while regression-testing the first.
--
-- ===========================================================================
-- FIX 2 (found second, more serious): the Ended-show auto-flip has been DEAD
-- on the single-episode path since 20260726160000 shipped, and fails silently.
-- ===========================================================================
-- 20260726160000 revoked EXECUTE on check_and_flip_show_completion from
-- PUBLIC/anon/authenticated, justified in its own header as:
--
--     "Internal helper only -- reachable through the two SECURITY DEFINER
--      callers below (which run as the owner, so no explicit grant is needed)."
--
-- Only ONE of those two callers is SECURITY DEFINER. Measured on staging:
--
--     check_and_flip_show_completion   definer=false   postgres | service_role
--     mark_episode_watched             definer=false   (invoker)
--     sync_tv_show_progress            definer=TRUE
--
--     has_function_privilege('authenticated',
--       'check_and_flip_show_completion(uuid,uuid,integer)', 'EXECUTE') -> FALSE
--     calling it as authenticated      -> SQLSTATE 42501 permission denied
--
-- So sync_tv_show_progress (definer, runs as owner) CAN flip, while
-- mark_episode_watched (invoker, runs as the user) is denied every single time.
-- And the denial is invisible: the caller wraps the helper in
-- `EXCEPTION WHEN OTHERS THEN v_flipped := false`, a best-effort guard meant to
-- stop a flip error rolling back the episode write. It cannot distinguish a
-- transient failure from a permanent permission error, so a hard 42501 is
-- laundered into an ordinary "nothing to flip" result forever.
--
-- USER IMPACT: finishing an Ended show by marking its last episode -- one at a
-- time, the normal way -- never flips it to Watched. Only the bulk
-- "Mark All Watched" path flips, because that one goes through
-- sync_tv_show_progress. That is the exact completion behaviour 20260726160000
-- set out to fix.
--
-- FIX: grant EXECUTE on the helper to authenticated. Safe, and defence-in-depth
-- rather than a loosening:
--   * the helper is SECURITY INVOKER, so it runs as the calling user and RLS
--     applies to its UPDATE. public.user_tv_shows carries
--     "Users can update own tv shows" USING (auth.uid() = user_id), verified on
--     prod, so a caller cannot flip a row they do not own no matter what
--     p_user_tv_show_id / p_user_id they pass;
--   * the helper additionally scopes its own read and UPDATE to
--     (id = p_user_tv_show_id AND user_id = p_user_id);
--   * sync_tv_show_progress passes auth.uid(), never a caller-supplied id.
-- Making mark_episode_watched SECURITY DEFINER instead was rejected: that would
-- drop RLS for every write in the function to fix one call.
--
-- ===========================================================================
-- FIX 1: marking ONE episode never updated episodes_watched.
-- ===========================================================================
--
-- THE BUG
-- -------
-- `mark_episode_watched` inserts the watch row and refreshes current_season /
-- current_episode / updated_at -- but it has never written `episodes_watched`.
-- Verified against prod: pg_get_functiondef contains no reference to the column
-- at all. Only `sync_tv_show_progress` maintains it.
--
-- Every OTHER write path calls sync_tv_show_progress afterwards:
--     unmarkEpisodeWatched      lib/tv-show-service.ts:405
--     unmarkSeasonWatched       lib/tv-show-service.ts:518
--     batchMarkEpisodesWatched  lib/tv-show-service.ts:543, :565
-- The single-episode mark (lib/tv-show-service.ts:325) calls the RPC and nothing
-- else. So marking one episode is the ONLY write path that leaves the counter
-- stale -- while UNMARKING one correctly refreshes it. That asymmetry is the bug.
--
-- IMPACT
-- ------
-- Marking episodes one at a time is the primary interaction, so for normal use
-- `episodes_watched` falls one further behind with every episode. Continue
-- Watching reads that column for its progress bar (#707), so the bar silently
-- under-reports and drifts further the more the app is used. This is why the
-- schema-drift guard keeps re-finding drifted rows: 7 healed on 2026-07-27, and
-- a fresh one (The Office, stored 72 vs actual 73) appeared within the hour from
-- a single ordinary episode mark.
--
-- WHY IN THE DATABASE AND NOT THE CLIENT
-- --------------------------------------
-- Adding a sync call in lib/tv-show-service.ts would fix the app and leave the
-- iOS widget and Shortcuts callers broken -- they invoke this RPC directly,
-- which is precisely why the air_date guard above already lives here rather than
-- in TypeScript. Recomputing inside the same statement is also atomic: there is
-- no window where the row is updated but the counter is not, and no second
-- round trip that can fail independently.
--
-- DEFINITION OF THE COUNT
-- -----------------------
-- `count(*) where watch_number = 1`, scoped to the caller. This is deliberately
-- the SAME predicate used by sync_tv_show_progress and by the drift guard's
-- EPISODES_WATCHED probe, so all three agree by construction; picking a
-- different one here would make the guard fight this function forever. Note it
-- differs from the current_season/current_episode query directly above it, which
-- intentionally does NOT filter on watch_number -- a rewatch should move where
-- you are, but must not inflate how many distinct episodes you have seen.
--
-- SELF-HEALING SIDE EFFECT
-- ------------------------
-- Because the count is recomputed from source rows rather than incremented, any
-- show carrying historical drift corrects itself the next time any episode in it
-- is marked. Shows nobody touches again still need
-- public.recompute_episodes_watched_all().
--
-- The rest of the function is unchanged and reproduced verbatim from the live
-- prod definition (which matches 20260726160000). SECURITY INVOKER is preserved
-- deliberately -- this function runs as the caller, so RLS constrains its writes
-- independently of the explicit user_id predicates.

CREATE OR REPLACE FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_air_date date;
  v_latest_season int;
  v_latest_episode int;
  v_episodes_watched int;
  v_flipped boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Phase 4c.3c air_date guard (restrictive / fail-closed).
  -- Mirrors the client-side filter in lib/tv-show-service.ts (PR #390);
  -- this server-side check catches widget and Shortcuts callers that
  -- bypass the TS surface. Both enforcement points must stay in sync
  -- if the eligibility rule ever changes.
  SELECT air_date INTO v_air_date
  FROM public.tv_show_episodes
  WHERE tmdb_show_id = p_tmdb_show_id
    AND season_number = p_season_number
    AND episode_number = p_episode_number;

  IF NOT FOUND OR v_air_date IS NULL OR v_air_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Episode not eligible to mark watched'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotent insert (unchanged from #391).
  IF NOT EXISTS (
    SELECT 1 FROM public.user_episode_watches
    WHERE user_id = v_user_id
      AND user_tv_show_id = p_user_tv_show_id
      AND season_number = p_season_number
      AND episode_number = p_episode_number
  ) THEN
    INSERT INTO public.user_episode_watches (
      user_id, user_tv_show_id, tmdb_show_id,
      season_number, episode_number, watch_number,
      watched_at, created_at
    )
    VALUES (
      v_user_id, p_user_tv_show_id, p_tmdb_show_id,
      p_season_number, p_episode_number, 1,
      NOW(), NOW()
    );
  END IF;

  -- Recompute current_season / current_episode (unchanged). Deliberately NOT
  -- filtered on watch_number: a rewatch moves where you are.
  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = v_user_id
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  -- NEW: recompute episodes_watched from source, matching the predicate used by
  -- sync_tv_show_progress and the drift guard. Runs after the insert above so
  -- the episode just marked is counted.
  SELECT COUNT(*)
    INTO v_episodes_watched
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = v_user_id
    AND watch_number = 1;

  UPDATE public.user_tv_shows
  SET current_season = v_latest_season,
      current_episode = v_latest_episode,
      episodes_watched = v_episodes_watched,
      updated_at = NOW()
  WHERE id = p_user_tv_show_id
    AND user_id = v_user_id;

  -- Auto-flip branch — the shared helper. Best-effort: never let a flip
  -- error roll back the write above.
  BEGIN
    v_flipped := public.check_and_flip_show_completion(p_user_tv_show_id, v_user_id, p_total_episodes_in_season);
  EXCEPTION WHEN OTHERS THEN
    v_flipped := false;
  END;

  RETURN jsonb_build_object('flipped', v_flipped);
END;
$$;

ALTER FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) OWNER TO "postgres";

-- mark_episode_watched needs no grant change: it is SECURITY INVOKER, and
-- CREATE OR REPLACE preserves an existing ACL (measured 2026-07-27 — only
-- DROP + CREATE resets it), so its established posture carries over untouched.

-- FIX 2: let the invoker caller actually reach the helper. Without this, every
-- flip attempt from mark_episode_watched dies on 42501 and is swallowed.
-- PUBLIC and anon stay revoked — this grants the one role that needs it.
GRANT EXECUTE ON FUNCTION "public"."check_and_flip_show_completion"("uuid", "uuid", integer) TO "authenticated";
