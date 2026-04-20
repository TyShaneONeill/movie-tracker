# Widget Phase 4b.4 — Auto Status Transitions Design Spec

**Date:** 2026-04-20
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4b.4
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

## Context

Phase 4b.3 (PR #388, merged 2026-04-20) shipped app-wide TMDB metadata refresh + atomic `mark_episode_watched` RPC. It left `user_tv_shows.status` untouched — user still had to manually toggle from `'watching'` to `'watched'`. Tyshane observed this with Daredevil: Born Again: finished S2, widget showed trophy state, but show-detail toggle still read "Watching" and the Continue Watching carousel still included the show.

4b.4 closes the correctness gap AND adds a foundational piece: **store TMDB's show status** (`Ended` / `Returning Series` / `Canceled` / etc) to enable precise flip logic AND future UX enhancements.

## Design decisions (resolved)

| Question | Resolution |
|--|--|
| Q1 — Where does the flip fire? | Inside `mark_episode_watched` RPC (add `p_total_episodes_in_season` parameter) |
| Q2 — Flip-back trigger | Metadata refresh detects `number_of_episodes` growth on `status='watched' AND tmdb_status='Returning Series'` rows |
| Q3 — Use TMDB show status? | YES — add `tmdb_status` column on `user_tv_shows`, populate via metadata refresh |
| D1 — Which TMDB statuses trigger flip-to-watched? | `('Ended', 'Canceled')` only |
| D2 — `finished_at` on flip | `COALESCE(finished_at, NOW())` — preserve first-completion timestamp |
| D3 — Refresh scope | Query expanded: `status='watching'` OR (`status='watched'` AND `tmdb_status='Returning Series'`) |
| D4 — Widget payload update | Deferred — add when widget has UI consumer for `tmdb_status` |

## Scope

### 1. `tmdb_status` column on `user_tv_shows`
New nullable text column. Populated by metadata refresh from TMDB's show `status` field. Nullable because existing rows won't have it until refresh runs.

### 2. Metadata refresh extension
`refreshShowMetadata` in `lib/metadata-refresh.ts` extracts `status` from the TMDB response and writes it to `tmdb_status`. No edge function changes — `get-tv-show-details` already returns the full TMDB response (`data.status` is the show status).

### 3. `mark_episode_watched` RPC auto-flip logic
RPC takes a new parameter `p_total_episodes_in_season INT`. After its existing insert + recompute, if:
- `current_season >= number_of_seasons` (user is on the last known season), AND
- `current_episode >= p_total_episodes_in_season` (finished the current season), AND
- `tmdb_status IN ('Ended', 'Canceled')`

→ UPDATE `user_tv_shows.status = 'watched'`, `finished_at = COALESCE(finished_at, NOW())`.

If `tmdb_status` is NULL or `'Returning Series'` or other values, status stays `'watching'`.

### 4. Flip-back logic in metadata refresh
Refresh query expands: refresh shows where `status='watching'` OR (`status='watched' AND tmdb_status='Returning Series'`).

On successful refresh of a `'watched'` + `'Returning Series'` show, if `number_of_episodes` increased since last refresh → UPDATE `status = 'watching'`. Show returns to Continue Watching. `finished_at` preserved for analytics.

### 5. Caller updates
Widget's `SupabaseWidgetClient.markEpisodeWatched` and app's `tv-show-service.ts markEpisodeWatched` pass the new `p_total_episodes_in_season` parameter. Both already have this value in context:
- Widget: `show.totalEpisodesInCurrentSeason` from payload
- App: TMDB season data already fetched for show-detail

Fallback: when `totalEpisodesInCurrentSeason` is unknown (nil), pass 0 → RPC logic treats as "can't determine final episode," skips flip. Acceptable — flip happens on next successful mark when count is known.

## Out of scope (explicit non-goals)

- **Widget payload v3 with `tmdb_status`** — deferred until widget has UI consumers (e.g., "S3 coming soon" for Returning Series caught-up). Bumping schema now with no consumers adds noise.
- **Show-detail UI badges** ("Series Ended" / "Returning Series") — separate UI task.
- **Auto-dropping of `'Canceled'` shows from Continue Watching** — treat same as Ended for flip-to-watched purposes.
- **Handling non-standard TMDB statuses** (`"In Production"`, `"Planned"`, `"Pilot"`) — treat all as "not yet Ended," don't flip.
- **Season-level episode-count column on user_tv_shows** — client passes per-call; persistent per-season metadata is a separate caching PR.
- **Updating `markSeasonWatched` / `batchMarkEpisodesWatched`** — those still use legacy `sync_tv_show_progress`. Migration to new RPC is an independent scope.

## Data model changes

### Migration: `add_tmdb_status_to_user_tv_shows`

```sql
ALTER TABLE public.user_tv_shows
  ADD COLUMN tmdb_status text;

COMMENT ON COLUMN public.user_tv_shows.tmdb_status IS
  'TMDB show status: "Ended", "Returning Series", "Canceled", "In Production", "Planned", "Pilot". Refreshed by lib/metadata-refresh.ts. Drives auto status transitions and future widget UI.';
```

No index needed — queried inside the existing `idx_user_tv_shows_metadata_refresh` partial-index scan.

### Migration: `update_mark_episode_watched_add_total_episodes_param`

`CREATE OR REPLACE FUNCTION` with the new 5-argument signature (adds `p_total_episodes_in_season int`). Postgres handles signature changes as a new overload — we should also `DROP FUNCTION public.mark_episode_watched(uuid, int, int, int)` (4-arg version) within the same migration to avoid having two overloads that callers might confuse.

Sequence:
1. `DROP FUNCTION public.mark_episode_watched(uuid, int, int, int);`
2. `CREATE OR REPLACE FUNCTION public.mark_episode_watched(uuid, int, int, int, int) ...` with the new body

Caller updates (widget + app) land in the same PR, so no production traffic hits the deleted 4-arg version between migration + code deploy.

## New RPC body

```sql
CREATE OR REPLACE FUNCTION public.mark_episode_watched(
  p_user_tv_show_id uuid,
  p_tmdb_show_id int,
  p_season_number int,
  p_episode_number int,
  p_total_episodes_in_season int
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_latest_season int;
  v_latest_episode int;
  v_show_total_seasons int;
  v_tmdb_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Idempotent insert (unchanged from 4b.3)
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

  -- Recompute current_season/current_episode (unchanged from 4b.3)
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

  -- NEW: Auto-flip status to 'watched' when all signals align
  SELECT number_of_seasons, tmdb_status
    INTO v_show_total_seasons, v_tmdb_status
  FROM public.user_tv_shows
  WHERE id = p_user_tv_show_id AND user_id = v_user_id;

  IF v_show_total_seasons IS NOT NULL
     AND v_latest_season >= v_show_total_seasons
     AND p_total_episodes_in_season > 0
     AND v_latest_episode >= p_total_episodes_in_season
     AND v_tmdb_status IN ('Ended', 'Canceled')
  THEN
    UPDATE public.user_tv_shows
    SET status = 'watched',
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = p_user_tv_show_id AND user_id = v_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_episode_watched(uuid, int, int, int, int) TO authenticated;
```

## Metadata refresh changes

### Query expansion (`lib/metadata-refresh.ts`)

Before:
```ts
.eq('status', 'watching')
.or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
```

After:
```ts
.or(`status.eq.watching,and(status.eq.watched,tmdb_status.eq.Returning Series)`)
.or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
```

Also select `tmdb_status` and `status` in the SELECT statement (types updated via regen).

### Flip-back logic in `refreshShowMetadata`

```ts
// Inside the updates-building block, after the number_of_episodes check:

// Always refresh tmdb_status
if (typeof tmdbData.status === 'string' && tmdbData.status !== row.tmdb_status) {
  updates.tmdb_status = tmdbData.status;
}

// Flip-back: Returning Series got new episodes → re-surface in Continue Watching
if (row.status === 'watched'
    && row.tmdb_status === 'Returning Series'
    && typeof tmdbData.number_of_episodes === 'number'
    && tmdbData.number_of_episodes > (row.number_of_episodes ?? 0)) {
  updates.status = 'watching';
  // finished_at intentionally preserved for analytics
}
```

## Caller updates

### Widget (`SupabaseWidgetClient.swift`)

`markEpisodeWatched` gets new parameter `totalEpisodesInSeason: Int`. Passed to RPC body as `p_total_episodes_in_season`. Default 0 when `show.totalEpisodesInCurrentSeason` is nil. `MarkEpisodeWatchedIntent` populates from `show.totalEpisodesInCurrentSeason ?? 0`.

### App (`lib/tv-show-service.ts`)

`markEpisodeWatched` function signature gains `totalEpisodesInSeason: number`. Show-detail episode checkbox caller passes it from the TMDB season data it already has rendered.

## Testing strategy

### TS unit
- `__tests__/lib/metadata-refresh.test.ts` — 3 new tests:
  - Sets `tmdb_status` on successful refresh
  - Flips status back to `'watching'` when Returning Series gets new episodes
  - Does NOT flip back when `number_of_episodes` unchanged
- `__tests__/lib/tv-show-service.test.ts` — updates existing test to pass + verify `p_total_episodes_in_season`

### Postgres RPC tests (can be manual SQL via MCP)
- **Flip-to-watched:** Ended show + final episode → `status='watched'`, `finished_at` set
- **No flip when Returning Series:** same inputs but `tmdb_status='Returning Series'` → `status='watching'`
- **No flip when `p_total_episodes_in_season = 0`:** status stays
- **`finished_at` preserved:** two successive flips don't reset

### Device validation (Tyshane)
- Daredevil show-detail → `tmdb_status='Ended'` populated after refresh
- Mark final episode of S2 → status flips to `'watched'`
- Continue Watching no longer includes Daredevil
- Show-detail status pill reads "Watched"
- Returning Series caught-up shows (find one in your library) stay `'watching'`

## Risks & rollback

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| Stale `tmdb_status` on existing rows means auto-flip can't fire | High at deploy | Low | Next foreground refresh populates. First app open post-deploy catches up. |
| TMDB returns unexpected status value | Low | Low | Default-safe: status stays `'watching'`. Sentry breadcrumb surfaces new values. |
| `p_total_episodes_in_season = 0` fallback blocks flips | Medium | Low | Widget's value reliably populated after 4b.2's fetch-loop fix + cache. Happens once, flips on next mark. |
| Flip-back false-positive: TMDB transiently shows more episodes | Low | Medium | 24h TTL means false positives auto-correct. Manual re-toggle available. |
| New RPC signature breaks if DB migration lands before client deploy | Medium | High | Widget + app caller updates ship in same PR as migration. `CREATE OR REPLACE` with new sig + DROP old sig in same transaction. |

### Rollback

- Drop `tmdb_status` column
- Re-apply 4b.3's 4-arg RPC via migration revert
- `git revert` the PR

## Success criteria

- User finishes final episode of Ended show → status auto-flips to `'watched'` on the same RPC call
- Continue Watching carousel no longer includes newly-finished shows
- Show-detail status pill reflects `'watched'`
- Returning Series caught-up shows stay `'watching'`
- When a Returning Series adds a new episode, next metadata refresh flips the show back to `'watching'` without manual user action
- `finished_at` populated on flip, preserved across re-flips

## References

- `docs/superpowers/specs/2026-04-19-widget-phase-4b3-metadata-refresh-design.md` — Phase 4b.3 spec (parent)
- PR #388 — Phase 4b.3 (merged 2026-04-20)
- `vault://Projects/CineTrak/Features/Widget Phase 4 - Kickoff Session Note`
- `vault://Daily Notes/2026-04-19` — full design-decisions log
