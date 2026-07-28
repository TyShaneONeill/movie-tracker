-- get_user_show_currency() — is the user actually current on each show, and
-- when does the next episode land?
--
-- WHY THIS IS AN RPC AND NOT A CLIENT HOOK
-- ----------------------------------------
-- The previous attempt (hooks/use-show-caught-up.ts) compared COUNTS on the
-- client: `episodesWatched >= airedEpisodeCount`. That is unsound. Watch 24
-- episodes of which two are future-dated and you get 24 >= 24 while an aired
-- episode sits unwatched — a FALSE "caught up", which is the single failure this
-- feature cannot afford: it tells someone to stop looking, and they miss
-- episodes. Answering it correctly means checking episode BY episode against the
-- catalog, which is a join, which belongs next to the data.
--
-- One call returns every watching show, so the Home rail does not fan out.
--
-- THE CERTAINTY GATE
-- ------------------
-- A show is "current" only when ALL of these hold. Anything unknown means NO
-- claim — the surfaces degrade silently to today's behaviour rather than to a
-- hedge, because a hedged status pill is worse than no pill.
--
--   1. user status = 'watching'
--   2. tmdb_status present AND not Ended/Canceled.
--      NULL is NOT eligible. Unknown is not the same as returning.
--   3. metadata_refreshed_at within 48h — i.e. the sync in
--      supabase/functions/sync-tracked-show-metadata has actually covered this
--      show recently. Without this the gate would happily rule on a catalog
--      that is months stale. The hourly cron keeps this true in steady state;
--      when it isn't, we say nothing.
--   4. Zero unwatched episodes that have settled as aired, AND zero
--      "unknown-but-probably-out" episodes (see below).
--   5. At least one settled-aired episode exists (aired_count > 0), so a show
--      with an empty catalog can never read as current.
--
-- SETTLED vs UNKNOWN vs FUTURE
-- ----------------------------
-- `air_date <= current_date - 1` is SETTLED-AIRED: definitely out, timezone and
-- release-hour ambiguity excluded by the one-day margin. `air_date >=
-- current_date` is FUTURE and never blocks.
--
-- A NULL air_date is the dangerous case, and it is where TMDB is least reliable.
-- The rule: a NULL-dated episode BLOCKS the claim if any OTHER episode in the
-- same season has settled as aired — that season is mid-flight, so an undated
-- episode in it may well be out. A season with NO dated-and-aired episodes at
-- all is treated as future; that is TMDB's normal shape for an announced but
-- unscheduled season, and blocking on it would make "caught up between seasons"
-- unreachable — which is the single best moment to say it.
--
-- Returns next_air_date / next_season / next_episode for the earliest FUTURE
-- episode, so callers can render the forward-looking half of the claim. That
-- line doubles as the audit trail: it shows the user WHY the app believes they
-- are current, and it is falsifiable against the episode list on the same screen.
--
-- SECURITY: scoped to auth.uid() throughout. SECURITY INVOKER, so RLS on
-- user_tv_shows / user_episode_watches independently constrains every read —
-- defence in depth alongside the explicit predicates.

CREATE OR REPLACE FUNCTION "public"."get_user_show_currency"()
RETURNS TABLE (
  "user_tv_show_id" "uuid",
  "tmdb_show_id" integer,
  "is_current" boolean,
  "next_air_date" date,
  "next_season" integer,
  "next_episode" integer
)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with eligible as (
    select
      uts.id   as user_tv_show_id,
      uts.tmdb_id as tmdb_show_id,
      (
        uts.status = 'watching'
        and uts.tmdb_status is not null
        and uts.tmdb_status not in ('Ended', 'Canceled')
        and uts.metadata_refreshed_at is not null
        and uts.metadata_refreshed_at > now() - interval '48 hours'
      ) as gate_ok
    from public.user_tv_shows uts
    where uts.user_id = auth.uid()
      and uts.tmdb_id is not null
  ),
  -- Episodes the user has actually seen, per show.
  watched as (
    select w.user_tv_show_id, w.season_number, w.episode_number
    from public.user_episode_watches w
    where w.user_id = auth.uid()
      and w.watch_number = 1
  ),
  -- Seasons that are mid-flight: at least one episode has settled as aired.
  live_seasons as (
    select distinct e.tmdb_show_id, e.season_number
    from public.tv_show_episodes e
    where e.air_date is not null
      and e.air_date <= current_date - 1
  ),
  counts as (
    select
      el.user_tv_show_id,
      el.tmdb_show_id,
      el.gate_ok,
      count(*) filter (
        where e.air_date is not null and e.air_date <= current_date - 1
      ) as aired_count,
      -- Settled-aired but unwatched: the real blocker.
      count(*) filter (
        where e.air_date is not null
          and e.air_date <= current_date - 1
          and w.episode_number is null
      ) as unwatched_aired,
      -- Undated and unwatched, in a season already known to be airing.
      count(*) filter (
        where e.air_date is null
          and w.episode_number is null
          and ls.season_number is not null
      ) as unwatched_unknown
    from eligible el
    join public.tv_show_episodes e on e.tmdb_show_id = el.tmdb_show_id
    left join watched w
      on w.user_tv_show_id = el.user_tv_show_id
     and w.season_number = e.season_number
     and w.episode_number = e.episode_number
    left join live_seasons ls
      on ls.tmdb_show_id = e.tmdb_show_id
     and ls.season_number = e.season_number
    group by el.user_tv_show_id, el.tmdb_show_id, el.gate_ok
  ),
  next_up as (
    select distinct on (e.tmdb_show_id)
      e.tmdb_show_id, e.air_date, e.season_number, e.episode_number
    from public.tv_show_episodes e
    where e.air_date is not null
      and e.air_date >= current_date
    order by e.tmdb_show_id, e.air_date asc, e.season_number asc, e.episode_number asc
  )
  select
    c.user_tv_show_id,
    c.tmdb_show_id,
    (
      c.gate_ok
      and c.aired_count > 0
      and c.unwatched_aired = 0
      and c.unwatched_unknown = 0
    ) as is_current,
    n.air_date       as next_air_date,
    n.season_number  as next_season,
    n.episode_number as next_episode
  from counts c
  left join next_up n on n.tmdb_show_id = c.tmdb_show_id;
$$;

ALTER FUNCTION "public"."get_user_show_currency"() OWNER TO "postgres";

-- Client-JWT callable; the body is auth.uid()-scoped and SECURITY INVOKER, so
-- RLS applies on top. anon and PUBLIC get nothing.
REVOKE ALL ON FUNCTION "public"."get_user_show_currency"() FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."get_user_show_currency"() TO "authenticated", "service_role";
