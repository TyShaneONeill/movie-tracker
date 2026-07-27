-- SECURITY: scope sync_tv_show_progress's recompute to the calling user.
--
-- THE DEFECT
-- ----------
-- sync_tv_show_progress is SECURITY DEFINER (so it bypasses RLS) and takes a
-- user_tv_show_id straight from the caller, but its recompute UPDATE has NEVER
-- been scoped by owner:
--
--     UPDATE user_tv_shows
--     SET episodes_watched = ..., current_season = ..., current_episode = ...
--     WHERE id = p_user_tv_show_id;        -- no user_id predicate
--
-- Any authenticated user could therefore pass ANOTHER user's user_tv_show_id and
-- force a write to that row. Pre-existing (it predates the row's own history),
-- and flagged in 20260726160000's header while that migration was deliberately
-- scoped to the completion-flip bug; this closes it.
--
-- SEVERITY, HONESTLY
-- ------------------
-- Lower than "IDOR" usually implies, and worth stating plainly so it is ranked
-- correctly rather than alarmingly:
--   * The values written are DERIVED FROM THE VICTIM'S OWN watch rows, so an
--     attacker cannot choose them. The write lands on correct data.
--   * The return value is only {flipped: bool}, and the flip branch was already
--     scoped to auth.uid() in 20260726160000, so it returns false for a row the
--     caller does not own. Nothing is read back to the attacker.
--   * anon cannot reach it at all: the ACL is postgres | authenticated |
--     service_role (verified on prod and staging 2026-07-27).
-- What it does allow is an unauthorised write to another user's row -- touching
-- updated_at, and re-deriving counters the owner may have had reason to expect
-- stable. That is a real authorisation defect regardless of blast radius, and it
-- is one line to close.
--
-- THE FIX
-- -------
-- Resolve auth.uid() once and scope BOTH the reads and the UPDATE to it. The
-- reads are scoped too, not just the UPDATE: leaving them unscoped would keep
-- counting another user's watch rows and then write nothing, which is a silent
-- no-op that looks like success. Scoping both makes a cross-user call return
-- {flipped:false} having done exactly nothing.
--
-- The NULL-uid branch is preserved deliberately. A NULL auth.uid() means a
-- service_role/server context (anon cannot execute this function), which is
-- already fully trusted and can UPDATE user_tv_shows directly -- so scoping it
-- would buy no security while breaking any server-side backfill that relies on
-- the historical behaviour. Client callers, the only untrusted class, always
-- have a uid.
--
-- Grants are re-applied because DROP FUNCTION discards them. That matters:
-- measured on staging 2026-07-27, DROP + CREATE resets a function's ACL to the
-- Supabase defaults, which grant EXECUTE to anon AND authenticated directly.
-- (CREATE OR REPLACE, by contrast, PRESERVES the ACL -- contrary to what
-- 20260727040000's header and the 07-27 daily note both claim. Postgres
-- documents the preserve behaviour; only DROP resets. The distinction is now
-- enforced statically by scripts/check-definer-grants.mjs.)
--
-- A NOTE ON A NEIGHBOURING COMMENT
-- --------------------------------
-- 20260726160000 describes check_and_flip_show_completion as "a shared SECURITY
-- DEFINER helper". Its DDL never declares SECURITY DEFINER, and pg_proc confirms
-- prosecdef = false on both environments. This is not a defect -- INVOKER is the
-- safer default here, and it is strictly protective: called from the INVOKER
-- mark_episode_watched it runs as the user, so RLS independently constrains its
-- UPDATE. The comment is simply wrong, and is corrected here so nobody later
-- reasons from it. The helper is intentionally left as INVOKER.

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
  -- Ownership gate. For an authenticated caller (the only untrusted class that
  -- holds EXECUTE), a row belonging to someone else simply is not visible to any
  -- statement below, so the whole call becomes a no-op instead of a cross-user
  -- write. v_user_id IS NULL means service_role — see the header.
  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_tv_shows
    WHERE id = p_user_tv_show_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('flipped', false);
  END IF;

  -- Count unique episodes watched (only first watches).
  SELECT COUNT(*)
  INTO v_episodes_watched
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1
    AND (v_user_id IS NULL OR user_id = v_user_id);

  -- Get the latest episode watched (by season then episode number).
  SELECT season_number, episode_number
  INTO v_current_season, v_current_episode
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND watch_number = 1
    AND (v_user_id IS NULL OR user_id = v_user_id)
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  -- The write, now owner-scoped.
  UPDATE user_tv_shows
  SET
    episodes_watched = v_episodes_watched,
    current_season = v_current_season,
    current_episode = v_current_episode,
    updated_at = now()
  WHERE id = p_user_tv_show_id
    AND (v_user_id IS NULL OR user_id = v_user_id);

  -- Completion check via the shared helper, scoped to the CALLING user. Unchanged
  -- from 20260726160000. Best-effort: unmark paths call this same function and the
  -- helper naturally returns false for them, because deleting watch rows can only
  -- lower the count, never cross the completion threshold.
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

-- Re-apply the grant posture from 20260710093000_definer_fn_grant_hardening.sql.
-- DROP discarded it, and the recreate would otherwise inherit Supabase defaults
-- that hand EXECUTE to anon.
REVOKE ALL ON FUNCTION "public"."sync_tv_show_progress"("uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_tv_show_progress"("uuid") TO "authenticated", "service_role";
