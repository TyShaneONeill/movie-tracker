# Widget Phase 4c — Stale-Cache Hook Fix Design Spec (`flipped` signal)

**Date:** 2026-04-20
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4c (sub-project 3d from the Phase 4c vault note)
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Parent note:** `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` (section 3d)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

## Context

Phase 4b.4 (PR #389, merged 2026-04-20) added auto-flip logic to `mark_episode_watched` RPC: when a user finishes the final episode of an Ended/Canceled show, the RPC updates `user_tv_shows.status = 'watched'` in the same DB transaction.

A pre-existing latent bug in `hooks/use-episode-actions.ts` became newly reachable as a result. The hook's `markWatchedMutation.onSuccess` reads React Query cache after `invalidateRelated()` — but invalidation only marks the query stale; it does not await a refetch. `cachedShow` reads the pre-flip value where `status = 'watching'`. Consequences:

1. If `cachedShow.episodes_watched + 1 >= total`, the hook fires a "Series complete!" toast and calls `options.onAllWatched()` → `changeStatus('watched')` → a redundant DB UPDATE (status is already 'watched' from the RPC). No data harm, but a wasted round-trip.
2. If `cachedShow.episodes_watched` is stale by more than 1 (e.g., widget marked an episode while the app was on another screen), the threshold check evaluates false and the toast silently does not fire despite the series actually being complete.

This PR closes the gap by having the RPC return an authoritative `flipped` signal that the hook uses instead of guessing from stale cache.

## Design decisions (resolved)

| Decision | Value |
|--|--|
| Approach | Option 1 — RPC returns `jsonb` with a `flipped` boolean |
| Return shape | `jsonb_build_object('flipped', <bool>)` |
| Key name | `flipped` |
| `lib/tv-show-service.ts markEpisodeWatched` return | `Promise<{ watch: UserEpisodeWatch; flipped: boolean }>` (breaking change, one caller) |
| Hook behavior when `flipped=true` | Fire "Series complete!" toast directly; skip `options.onAllWatched()` to avoid redundant `changeStatus('watched')` |
| Hook behavior when `flipped=false` | Fall through to existing legacy path (Returning Series guard + count-based threshold) |
| Bulk paths | Out of scope — `markSeasonWatched` / `batchMarkEpisodesWatched` use `sync_tv_show_progress`, not `mark_episode_watched` |
| Swift widget caller | No change — Swift client already discards response body (only validates status code) |

## Scope

### 1. Migration: `update_mark_episode_watched_return_flipped_signal`

DROP old 5-arg void-returning function + CREATE OR REPLACE 5-arg jsonb-returning version.

Signature change: `RETURNS void` → `RETURNS jsonb`.

Body adds a `v_flipped boolean := false` local. Inside the existing 5-condition auto-flip IF, `v_flipped := true;` is set after the UPDATE fires. Function ends with `RETURN jsonb_build_object('flipped', v_flipped);`.

All other RPC logic (auth guard, idempotent insert, recompute, auto-flip conditions, COALESCE finished_at) is unchanged from Phase 4b.4.

### 2. Types regen

`Database['public']['Functions']['mark_episode_watched']['Returns']` changes from `undefined` to `Json` (which the hand-edit will narrow to `{ flipped: boolean }` via a type assertion at the call site).

### 3. `lib/tv-show-service.ts markEpisodeWatched`

Signature change: `Promise<UserEpisodeWatch>` → `Promise<{ watch: UserEpisodeWatch; flipped: boolean }>`.

Destructures the RPC response: `const { data, error } = await supabase.rpc(...)`. Casts `data` to `{ flipped: boolean } | null` and extracts `flipped` (defaults to `false` if null — defensive).

Returns `{ watch: <existing synthetic watch>, flipped }`.

### 4. `hooks/use-episode-actions.ts markWatchedMutation.onSuccess`

Gains access to `data.flipped` via the mutation's onSuccess signature. New logic:

```
if (data.flipped) {
  // RPC auto-flipped. Fire toast (authoritative signal), do NOT call onAllWatched
  // (DB already updated; calling it would cause a redundant UPDATE).
  Toast.show({ '🎉 Series complete!' });
  invalidateRelated();
  return;
}

// Legacy path — RPC did not auto-flip. Use the existing count-based heuristic.
invalidateRelated();
if (options?.onAllWatched) {
  const cachedShow = ...;
  if (cachedShow && cachedShow.status !== 'watched' && cachedShow.tmdb_status !== 'Returning Series') {
    const total = cachedShow.number_of_episodes ?? 0;
    const watched = cachedShow.episodes_watched ?? 0;
    if (total > 0 && watched + 1 >= total) {
      Toast.show({ '🎉 Series complete!' });
      options.onAllWatched();
    }
  }
}
```

Rationale: the RPC's `flipped=true` signal is authoritative and more trustworthy than the count-based heuristic. When it fires, we can confidently show the toast and skip the client-side promote. The legacy path remains for the cases the RPC can't handle (null `tmdb_status`, Returning Series shows, or shows where the aired-episode count hasn't been captured yet).

### 5. Test coverage

Three new tests in `__tests__/hooks/use-episode-actions.test.ts`:

1. **RPC returns flipped=true → toast fires + onAllWatched NOT called**
2. **RPC returns flipped=false + cached count threshold met + Ended tmdb_status → toast fires + onAllWatched called (legacy path)**
3. **RPC returns flipped=false + cached count threshold met + Returning Series tmdb_status → toast does NOT fire (existing guard)**

Test (3) is a regression check for the Phase 4c tactical PR #390's guard.

Three new tests in `__tests__/lib/tv-show-service.test.ts`:

4. **Returns `{ watch, flipped: true }` when RPC response contains `flipped: true`**
5. **Returns `{ watch, flipped: false }` when RPC response contains `flipped: false`**
6. **Returns `{ watch, flipped: false }` when RPC response is null (defensive default)**

Update existing `markEpisodeWatched` tests to destructure the new return shape (`const { watch } = await markEpisodeWatched(...)`) or use `result.watch.episode_name` style access.

## Out of scope (explicit non-goals)

- `markSeasonWatched` / `batchMarkEpisodesWatched` — these call `sync_tv_show_progress`, not `mark_episode_watched`. Any future auto-flip they need would be a separate RPC enhancement.
- Swift widget client — response body is discarded; the function's new jsonb return is invisible to Swift. No change.
- Optimistic cache update — the hook could optimistically set `cachedShow.status = 'watched'` immediately on `flipped=true` to eliminate a render flash. Out of scope; invalidate+refetch is sufficient for this PR.
- Widget-side "Series complete!" UX — widget reloads timeline on its own cycle; the hook's toast is app-only.

## Data model changes

### Migration: `update_mark_episode_watched_return_flipped_signal`

```sql
-- Drop existing 5-arg void-returning version
DROP FUNCTION IF EXISTS public.mark_episode_watched(uuid, int, int, int, int);

CREATE OR REPLACE FUNCTION public.mark_episode_watched(
  p_user_tv_show_id uuid,
  p_tmdb_show_id int,
  p_season_number int,
  p_episode_number int,
  p_total_episodes_in_season int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_latest_season int;
  v_latest_episode int;
  v_show_total_seasons int;
  v_tmdb_status text;
  v_flipped boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Idempotent insert (unchanged from 4b.4)
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

  -- Auto-flip branch (unchanged conditions from 4b.4)
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
    -- `status <> 'watched'` in the WHERE clause ensures the UPDATE
    -- affects a row ONLY when this is a transitioning flip. Re-marking
    -- an already-watched final episode is a no-op — FOUND stays false
    -- and v_flipped stays false, so the hook does NOT re-fire the toast.
    UPDATE public.user_tv_shows
    SET status = 'watched',
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = p_user_tv_show_id
      AND user_id = v_user_id
      AND status <> 'watched';

    IF FOUND THEN
      v_flipped := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('flipped', v_flipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_episode_watched(uuid, int, int, int, int) TO authenticated;
```

## TS caller updates

### `lib/tv-show-service.ts markEpisodeWatched`

Signature: return type changes from `Promise<UserEpisodeWatch>` to `Promise<{ watch: UserEpisodeWatch; flipped: boolean }>`.

Body extracts `flipped` from the RPC response (defaults to `false` if the response is unexpectedly null). All other logic — air_date guard added in PR #390, synthetic `UserEpisodeWatch` construction, widget cache sync — remains.

### `hooks/use-episode-actions.ts`

Two edits:

1. `markWatchedMutation.mutationFn` already returns the service function's output. No signature change needed — `onSuccess(data, ...)` now receives `{ watch, flipped }` instead of `UserEpisodeWatch`.

2. `markWatchedMutation.onSuccess` branches on `data.flipped`:
   - `flipped=true`: fire toast, call `invalidateRelated()`, skip `onAllWatched`.
   - `flipped=false`: fall through to existing count-based logic (Returning Series guard still applies).

The `markAllWatchedMutation.onSuccess` is unchanged — bulk path uses `sync_tv_show_progress` which does not have auto-flip logic; the legacy count-based heuristic remains correct for it.

## Testing strategy

### Unit (6 new tests, 5 existing updated)

- Service: 3 new tests covering the return-shape change + defensive null handling (per Test Coverage section above).
- Service: 5 existing `markEpisodeWatched` tests need minor updates to match the new return shape — currently they assert on the synthetic watch; after this PR they'll destructure `{ watch }` or similar.
- Hook: 3 new tests covering the flipped=true path, the flipped=false legacy path, and the Returning Series regression guard.

### Postgres RPC (manual via MCP)

- Dry-call with a non-authenticated session still returns `42501 Unauthenticated` (signature + auth guard unchanged).
- Calling with a real authenticated session + Ended show at final-episode should return `{"flipped": true}` on the transitioning call.
- Calling the same RPC after the flip (re-mark on an already-watched final episode) should return `{"flipped": false}` — the `status <> 'watched'` WHERE clause + FOUND guard (see Migration SQL above) prevents the false-positive flip.

### Device validation (Tyshane)

- Mark the final episode of an Ended show (e.g., Warrior Nun) → "Series complete!" toast fires once; re-marking the same episode → no toast.
- Mark any episode of a Returning Series → no toast (existing guard).
- Mark an episode where cached `episodes_watched` is stale but the RPC would NOT auto-flip (e.g., mid-season episode) → no toast, no regression.

## Risks & rollback

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| Return-shape change breaks other callers of `markEpisodeWatched` | Low | Medium | Only one TS caller — fully grep'd before migration applies. Swift discards body. |
| RPC returns `{flipped:true}` on re-mark → spam toasts | High without fix | Low UX | FOUND guard on the UPDATE (see Testing section). |
| Types regen wipes custom aliases | Known | High | Hand-edit `Functions.mark_episode_watched.Returns` — same pattern as 4b.4. |
| RPC behavior divergence from void version not caught in tests | Low | Medium | Manual MCP smoke tests against a real show. |
| Hook onSuccess `await`ing something accidentally becomes blocking | N/A | N/A | No new awaits introduced — flipped branch is sync. |

### Rollback

- `git revert` PR.
- Re-apply the Phase 4b.4 void-returning RPC migration.
- Regenerate types → hand-edit Returns back to `undefined`.

No data-migration risk — the flip behavior itself is unchanged, only the return value is added.

## Success criteria

- Marking final episode of an Ended show fires "Series complete!" toast exactly once.
- Re-marking the same episode does NOT re-fire the toast.
- Marking any episode of a Returning Series still does NOT fire the toast (tactical PR #390 behavior preserved).
- Marking a mid-season episode where cached count is stale does NOT fire a false toast.
- `npm run lint && npx tsc --noEmit && npm test` — all green.
- No redundant `changeStatus('watched')` DB write on Ended-show completion (verified in device session via network inspector or Sentry breadcrumb count).

## References

- `docs/superpowers/specs/2026-04-20-widget-phase-4b4-status-transitions-design.md` — Phase 4b.4 spec (parent)
- PR #389 — Phase 4b.4 (merged, known-limitation section in PR body)
- PR #390 — Phase 4c tactical (Returning Series guard shipped here, preserved)
- `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` — sub-project 3d scope
