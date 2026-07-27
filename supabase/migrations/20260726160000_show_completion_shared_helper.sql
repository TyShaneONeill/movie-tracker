-- N2: shared completion-flip helper + bulk-mark parity fix.
--
-- Bug: the single-episode path (mark_episode_watched) carries the
-- Ended/Canceled auto-flip-to-'watched' check inline. The bulk season path
-- (markSeasonWatched -> sync_tv_show_progress) never carried it — the string
-- "status" appears zero times in sync_tv_show_progress's body — so bulk-
-- marking every episode of an Ended/Canceled show (e.g. via "Mark All
-- Watched") never flipped user_tv_shows.status to 'watched'. The client-side
-- compensating heuristic (hooks/use-episode-actions.ts markAllWatchedMutation)
-- was also racy: it read the query cache synchronously right after firing
-- (not awaiting) invalidateRelated(), so a rapid multi-season tap sequence
-- could under-count and never cross the completion threshold.
--
-- Fix: extract the completion check into a shared SECURITY DEFINER helper,
-- called by BOTH mark_episode_watched and sync_tv_show_progress, evaluated
-- from freshly-recomputed counters in the same transaction as each caller's
-- other writes. That removes the gap and the race together — no client-side
-- counting involved.
--
-- check_and_flip_show_completion total-episodes-in-season source:
--   * mark_episode_watched still passes its client-supplied
--     p_total_episodes_in_season straight through — preserves existing
--     behaviour byte-for-byte, INCLUDING the widget's "start next season"
--     intentional opt-out sentinel (totalEpisodesInSeason: 0, see
--     StartNextSeasonIntent.swift) which must keep disabling the flip check.
--   * sync_tv_show_progress (bulk path) has no reliable per-season total to
--     pass — the season just bulk-marked may not even be the season the user
--     has actually reached furthest in (e.g. they mark season 1 after
--     already having season 3 watched). So it omits the parameter and the
--     helper derives the total itself from the shared tv_show_episodes
--     catalog for whichever season was actually reached (v_latest_season).
--     That catalog is guaranteed populated for any season a user has ever
--     marked watched (get-season-episodes upserts it on every season fetch,
--     and marking requires having fetched the season first).
--
-- Security: check_and_flip_show_completion takes p_user_id explicitly and
-- scopes both its read and its UPDATE to (id = p_user_tv_show_id AND
-- user_id = p_user_id), so a caller can only ever flip their OWN show
-- regardless of what user_tv_show_id id gets passed in. sync_tv_show_progress
-- passes auth.uid() (not a trusted caller-supplied user id) for this reason —
-- note sync_tv_show_progress itself does NOT scope its recompute UPDATE by
-- owner (pre-existing; out of scope for this migration, flagged separately).
--
-- Best-effort: per the "a flip failure must not fail the mark action"
-- requirement, both call sites wrap the helper call in an exception trap so
-- an unexpected error in the completion check can never roll back the
-- episode-watch write it rides alongside.

CREATE OR REPLACE FUNCTION "public"."check_and_flip_show_completion"(
    "p_user_tv_show_id" "uuid",
    "p_user_id" "uuid",
    "p_total_episodes_in_season" integer DEFAULT NULL
) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tmdb_show_id integer;
  v_show_total_seasons integer;
  v_tmdb_status text;
  v_latest_season integer;
  v_latest_episode integer;
  v_total_in_season integer;
BEGIN
  SELECT tmdb_id, number_of_seasons, tmdb_status
    INTO v_tmdb_show_id, v_show_total_seasons, v_tmdb_status
  FROM public.user_tv_shows
  WHERE id = p_user_tv_show_id AND user_id = p_user_id;

  IF NOT FOUND
     OR v_show_total_seasons IS NULL
     OR v_tmdb_status IS NULL
     OR v_tmdb_status NOT IN ('Ended', 'Canceled')
  THEN
    RETURN false;
  END IF;

  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = p_user_id
    AND watch_number = 1
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  IF v_latest_season IS NULL OR v_latest_season < v_show_total_seasons THEN
    RETURN false;
  END IF;

  -- Caller-supplied total takes precedence (mark_episode_watched — including
  -- its 0 opt-out sentinel). NULL means "derive it" (sync_tv_show_progress).
  v_total_in_season := p_total_episodes_in_season;
  IF v_total_in_season IS NULL THEN
    SELECT COUNT(*) INTO v_total_in_season
    FROM public.tv_show_episodes
    WHERE tmdb_show_id = v_tmdb_show_id
      AND season_number = v_latest_season;
  END IF;

  IF v_total_in_season IS NULL
     OR v_total_in_season <= 0
     OR v_latest_episode < v_total_in_season
  THEN
    RETURN false;
  END IF;

  UPDATE public.user_tv_shows
  SET status = 'watched',
      finished_at = COALESCE(finished_at, NOW())
  WHERE id = p_user_tv_show_id
    AND user_id = p_user_id
    AND status <> 'watched';

  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."check_and_flip_show_completion"("uuid", "uuid", integer) OWNER TO "postgres";

-- Internal helper only — reachable through the two SECURITY DEFINER callers
-- below (which run as the owner, so no explicit grant is needed for them).
-- Not exposed to PostgREST directly.
REVOKE ALL ON FUNCTION "public"."check_and_flip_show_completion"("uuid", "uuid", integer) FROM PUBLIC, "anon", "authenticated";

-- mark_episode_watched: same signature/behaviour, now delegating the
-- auto-flip branch to the shared helper (best-effort — wrapped so a helper
-- error can't roll back the episode-watch insert above it).
CREATE OR REPLACE FUNCTION "public"."mark_episode_watched"("p_user_tv_show_id" "uuid", "p_tmdb_show_id" integer, "p_season_number" integer, "p_episode_number" integer, "p_total_episodes_in_season" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_air_date date;
  v_latest_season int;
  v_latest_episode int;
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

  -- Recompute current_season / current_episode (unchanged).
  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = v_user_id
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  UPDATE public.user_tv_shows
  SET current_season = v_latest_season,
      current_episode = v_latest_episode,
      updated_at = NOW()
  WHERE id = p_user_tv_show_id
    AND user_id = v_user_id;

  -- Auto-flip branch — now the shared helper. Best-effort: never let a flip
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

-- sync_tv_show_progress: return type changes from void to jsonb (adds
-- {flipped}), so it must be dropped and recreated (CREATE OR REPLACE cannot
-- change a function's return type).
DROP FUNCTION IF EXISTS "public"."sync_tv_show_progress"("uuid");

CREATE FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_episodes_watched integer;
  v_current_season integer;
  v_current_episode integer;
  v_user_id uuid := auth.uid();
  v_flipped boolean := false;
BEGIN
  -- Count unique episodes watched (only first watches)
  SELECT COUNT(*)
  INTO v_episodes_watched
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1;

  -- Get the latest episode watched (by season then episode number)
  SELECT season_number, episode_number
  INTO v_current_season, v_current_episode
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  -- Update the user_tv_shows record
  UPDATE user_tv_shows
  SET
    episodes_watched = v_episodes_watched,
    current_season = v_current_season,
    current_episode = v_current_episode,
    updated_at = now()
  WHERE id = p_user_tv_show_id;

  -- Completion check via the shared helper, scoped to the CALLING user
  -- (auth.uid()), not whatever id was passed in — see security note above
  -- this migration. Best-effort: unmark paths call this same function; the
  -- helper naturally returns false for them because deleting watch rows can
  -- only ever lower v_episodes_watched, never cross the completion
  -- threshold, so no separate unmark guard is needed here.
  IF v_user_id IS NOT NULL THEN
    BEGIN
      v_flipped := public.check_and_flip_show_completion(p_user_tv_show_id, v_user_id, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_flipped := false;
    END;
  END IF;

  RETURN jsonb_build_object('flipped', v_flipped);
END;
$$;

ALTER FUNCTION "public"."sync_tv_show_progress"("p_user_tv_show_id" "uuid") OWNER TO "postgres";

-- Re-apply the grant posture from 20260710093000_definer_fn_grant_hardening.sql
-- (DROP FUNCTION does not preserve grants): client-JWT calls, keep authenticated.
REVOKE ALL ON FUNCTION "public"."sync_tv_show_progress"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_tv_show_progress"("uuid") TO "authenticated", "service_role";
