-- Reverses the "current_* stays null on import" decision from #691/#696
-- (PR-J, 2026-07-26): imported shows now get current_season/current_episode
-- set to their latest watched episode, exactly like the organic writer
-- (mark_episode_watched, 20260525063629_remote_schema.sql:1083-1097 — same
-- ORDER BY season_number DESC, episode_number DESC LIMIT 1, no watch_number
-- filter, so a watch_number>1 rewatch row still counts as "current",
-- matching organic).
--
-- Why the reversal: the "N/total episodes" count label the old comment
-- protected was the founder's own preference at the time; he has since said
-- he prefers "S# E#" labelling for imported shows too, immediately after
-- import — not after a manual "open show -> mark episode watched -> back to
-- home" detour. The Home Continue Watching bubble that opens the Debrief
-- Room is gated on non-null current_season/current_episode
-- (app/(tabs)/index.tsx, components/cards/continue-watching-card.tsx,
-- hooks/use-next-episode-up.ts) — imports left both null on purpose, so
-- imported shows got progress bars but never a Debrief Room bubble until the
-- user manually touched the show. This closes that parity gap for the exact
-- switcher audience the import exists for.
--
-- The client's label already prefers the S#E# coordinate over the count
-- whenever current_season/current_episode are non-null
-- (continue-watching-card.tsx:57-62) — no client change needed, this
-- migration alone flips both the label and the bubble.
--
-- "Current" for a scattered/out-of-order bulk import is still ambiguous in
-- the abstract (the reason the original comment gave for leaving it null),
-- but latest-by-(season, episode) is the SAME answer the organic writer
-- already gives a user who marks episodes out of order — so imported and
-- organic shows end up with IDENTICAL current_* semantics, not a third way
-- of computing "current episode".
--
-- episodes_watched's COUNT (watch_number = 1 only) is UNCHANGED — it still
-- drives the progress bar (continue-watching-card.tsx's progressRatio),
-- which this migration does not touch.
--
-- Best-effort, unchanged: the import-tvtime edge fn's recomputeEpisodesWatched
-- wrapper (supabase/functions/import-tvtime/recompute.ts) already logs-not-
-- throws an rpc() error, so a failure of this (now-larger) UPDATE still
-- cannot strand the import.
--
-- Same grant posture as #696 (service_role only) — CREATE OR REPLACE
-- preserves ownership/grants, but restated below for drift-guard
-- explicitness (convention: 20260710140000_accept_follow_request_for_update.sql).

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
      ),
      current_season = (
        SELECT w2.season_number
        FROM user_episode_watches w2
        WHERE w2.user_tv_show_id = t.id
        ORDER BY w2.season_number DESC, w2.episode_number DESC
        LIMIT 1
      ),
      current_episode = (
        SELECT w2.episode_number
        FROM user_episode_watches w2
        WHERE w2.user_tv_show_id = t.id
        ORDER BY w2.season_number DESC, w2.episode_number DESC
        LIMIT 1
      ),
      updated_at = NOW()
  WHERE t.id = ANY(p_user_tv_show_ids)
    AND t.user_id = p_user_id;
$$;

ALTER FUNCTION public.recompute_episodes_watched(uuid[], uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recompute_episodes_watched(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_episodes_watched(uuid[], uuid) TO service_role;
