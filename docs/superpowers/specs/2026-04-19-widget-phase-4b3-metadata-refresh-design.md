# Widget Phase 4b.3 — Metadata Refresh + Atomic Mark-Episode Design

**Date:** 2026-04-19
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4b.3
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - User Show Metadata Refresh`
**Parent feature PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`

## Context

Phase 4a (PR #384) shipped the widget's feature-complete layout.
Phase 4a PR #2 (PR #385) stripped architecturally-blocked haptic code.
Phase 4b.1 (PR #386) fixed React Query cache staleness after widget mutations.
Phase 4b.2 (PR #387) added AsyncStorage episode-count cache + a critical hotfix to the widget's fetch loop that was skipping the user's current season when the DB's `number_of_seasons` was stale.

The 4b.2 hotfix revealed the underlying problem: `user_tv_shows` holds TMDB-derived metadata that is written once at show-add time and never refreshed. For currently-airing shows, this means DB values drift behind TMDB's truth as new seasons air. The widget's client-side `Math.max(current_season, number_of_seasons)` is a tactical workaround; this phase fixes the source.

A second, related correctness gap also surfaced during 4a testing: `SupabaseWidgetClient.markEpisodeWatched` uses a two-call pattern (INSERT `user_episode_watches` + RPC update `user_tv_shows`) that is not transactional. Intermittent failures can leave `user_tv_shows.current_episode` out of sync with the episode-watches ledger.

Phase 4b.3 addresses both gaps in a single coherent PR.

## Scope

### Part A — App-wide TMDB metadata refresh
Keep `user_tv_shows` TMDB-derived fields current via trigger-based refresh patterns. Fields refreshed: `number_of_seasons`, `number_of_episodes`, TMDB show `status`, `poster_path`.

### Part C — Atomic `mark_episode_watched` RPC
Replace the client-side two-call pattern with a single Postgres stored procedure that INSERTs into `user_episode_watches` and updates `user_tv_shows.current_season/current_episode` in the same transaction.

### Explicitly out of scope

- **Part B — Server-side TMDB validation in RPC.** The new RPC does NOT call TMDB to validate `p_episode_number` against the real count. Deferred — client-side is correct once metadata refresh lands.
- **Scheduled cron edge function.** No dormant-user cohort at current scale; add if/when needed.
- **Movies metadata refresh.** `user_movies` doesn't have the same staleness class (no "new seasons" equivalent). Separate initiative if needed.
- **`start_next_season` RPC consolidation.** The widget's `StartNextSeasonIntent` still uses the legacy `sync_tv_show_progress` RPC. Flagged for a follow-up consistency pass.
- **Removing `sync_tv_show_progress` RPC.** Kept in place as a fallback during rollout; removal happens once all callers have migrated to the new RPC (follow-up PR).

## Design decisions

| Decision | Resolution |
|--|--|
| Scope combination | **A + C** — bundle metadata refresh and atomic RPC in one PR; defer server-side validation (B) to 4b.4+ |
| Refresh triggers | Foreground batch (all watching shows, per-show throttled) + lazy-on-view (single show when navigated to show-detail screen) |
| Throttling | New `metadata_refreshed_at timestamptz` column on `user_tv_shows`; refresh skipped when less than 24h old |
| Parallelism | Max 5 concurrent TMDB fetches per batch to protect the 40 req/10s quota |
| Atomicity | Single unified `mark_episode_watched` RPC; `SECURITY INVOKER` (RLS enforced); `ON CONFLICT DO NOTHING` for idempotency |

Rejected alternatives recorded for durability:
- Cron-based refresh — overkill at 0-user scale
- Client-side AsyncStorage throttle map — loses state on reinstall, not server-visible
- DB trigger on `user_episode_watches` — too much "spooky action"; explicit stored procedure chosen for debuggability

## Data model changes

### Migration — metadata_refreshed_at column + partial index

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_metadata_refreshed_at.sql
ALTER TABLE public.user_tv_shows
  ADD COLUMN metadata_refreshed_at timestamptz;

CREATE INDEX idx_user_tv_shows_metadata_refresh
  ON public.user_tv_shows (user_id, metadata_refreshed_at)
  WHERE status = 'watching';
```

Default `NULL` for all existing rows = "will refresh on next opportunity." At current scale the thundering-herd refresh on deploy day is acceptable. At 10k+ users we'd prepopulate `NOW()` during migration.

### Migration — unique constraint on user_episode_watches (if not already present)

Pre-deploy check: if `(user_id, user_tv_show_id, season_number, episode_number)` is not already a unique constraint or unique index on `user_episode_watches`, add one in the same migration. The new RPC's `ON CONFLICT DO NOTHING` depends on it.

```sql
-- Only needed if the constraint doesn't already exist. Verify with:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.user_episode_watches'::regclass;
ALTER TABLE public.user_episode_watches
  ADD CONSTRAINT user_episode_watches_unique_user_show_season_episode
  UNIQUE (user_id, user_tv_show_id, season_number, episode_number);
```

### New RPC — `mark_episode_watched`

```sql
CREATE OR REPLACE FUNCTION public.mark_episode_watched(
  p_user_tv_show_id uuid,
  p_tmdb_show_id int,
  p_season_number int,
  p_episode_number int
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_latest_season int;
  v_latest_episode int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Idempotent insert; safe to retry
  INSERT INTO public.user_episode_watches (
    user_id, user_tv_show_id, tmdb_show_id, season_number, episode_number, watched_at
  )
  VALUES (
    v_user_id, p_user_tv_show_id, p_tmdb_show_id, p_season_number, p_episode_number, NOW()
  )
  ON CONFLICT (user_id, user_tv_show_id, season_number, episode_number) DO NOTHING;

  -- Compute user_tv_shows.current_season/current_episode from the full ledger.
  -- "Latest" = the row with the highest (season_number, episode_number) tuple.
  -- Self-heals any prior drift in user_tv_shows vs user_episode_watches.
  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  UPDATE public.user_tv_shows
  SET current_season = v_latest_season,
      current_episode = v_latest_episode,
      updated_at = NOW()
  WHERE id = p_user_tv_show_id
    AND user_id = v_user_id;
END;
$$;
```

Key properties:
- `SECURITY INVOKER` — runs as the user; RLS applies to both INSERT and UPDATE paths. User cannot mark another user's show.
- `ON CONFLICT DO NOTHING` — double-marks the same episode without error
- Recomputes from the aggregate (not just +1) — self-heals any prior drift in `current_season/current_episode`
- No TMDB calls — pure Postgres

## Metadata refresh architecture

### New module — `lib/metadata-refresh.ts`

Public surface:

```ts
// Refreshes all stale watching shows for the current user. Returns count of shows
// for which TMDB was actually called. Throttles via metadata_refreshed_at < NOW() - 24h.
export async function refreshStaleWatchingShows(): Promise<number>

// Refreshes a single show by user_tv_show_id. Returns true if a TMDB fetch fired,
// false if the show was still fresh (within 24h).
export async function refreshSingleShow(userTvShowId: string): Promise<boolean>
```

Both call into a shared private `refreshShowMetadata(row)` helper. The helper:

1. Fires `supabase.functions.invoke('get-tv-show-details', { body: { showId: row.tmdb_id } })`
2. On success, diffs returned fields against the row's stored values
3. If any field differs, UPDATEs `user_tv_shows` with the changed fields AND sets `metadata_refreshed_at = NOW()`
4. If nothing differs, UPDATEs only `metadata_refreshed_at = NOW()` (marks checked without a write)
5. On TMDB fetch failure, emits a Sentry breadcrumb and returns without updating `metadata_refreshed_at` (retry fires on next trigger)

### Concurrency cap

Uses a simple hand-rolled semaphore (avoid adding `p-limit` dependency for a 20-line utility):

```ts
async function runWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}
```

Cap set to 5. Lives inside `metadata-refresh.ts`; not exported.

### Trigger 1 — Foreground batch (in `useWidgetSync`)

After `syncWidgetCache()` completes, fire `refreshStaleWatchingShows()`:

```ts
// hooks/use-widget-sync.ts — extends the existing flow
try {
  await syncWidgetCache();
  queryClient.invalidateQueries({ predicate: ... });  // Phase 4b.1
  await refreshStaleWatchingShows();                  // NEW — 4b.3
} catch { /* silent */ }
```

Order matters: widget sync runs first (unchanged speed for the widget), refresh fires after (may take longer due to multiple TMDB calls). Both trigger their own React Query invalidations.

After `refreshStaleWatchingShows()` resolves with count > 0, invalidate the same key families Phase 4b.1 does:

```ts
if (refreshedCount > 0) {
  queryClient.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0];
      return k === 'userTvShow' || k === 'userTvShows' || k === 'episodeWatches';
    },
  });
}
```

### Trigger 2 — Lazy-on-view (in show-detail screen)

In the show-detail screen's existing hook or component:

```tsx
useEffect(() => {
  if (!userTvShow?.id) return;
  refreshSingleShow(userTvShow.id).then((fired) => {
    if (fired) {
      queryClient.invalidateQueries({ queryKey: ['userTvShow', userId, tmdbId] });
    }
  });
}, [userTvShow?.id]);
```

Fire-and-forget; throttled internally by `metadata_refreshed_at`. User sees refreshed data the next render cycle.

### Refresh batch query

```sql
SELECT id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes,
       status, metadata_refreshed_at
FROM user_tv_shows
WHERE user_id = $1
  AND status = 'watching'
  AND (metadata_refreshed_at IS NULL OR metadata_refreshed_at < NOW() - INTERVAL '24 hours')
ORDER BY updated_at DESC
LIMIT 50;
```

Limit 50 as a safety cap against a user with thousands of in-progress shows. At 5-concurrent, 50 shows takes ~10 TMDB calls × 5 batches = ~5 seconds worst case.

### Fields refreshed

| Field | Why it matters |
|--|--|
| `number_of_seasons` | Drives widget's `has_next_season` and the season-fetch loop's upper bound |
| `number_of_episodes` | Used by progress UI and achievement triggers |
| `status` (TMDB show status) | "Ended" vs "Returning Series" distinguishes "truly done" from "waiting on next season" |
| `poster_path` | TMDB occasionally updates posters; stale path causes broken image links |

The `get-tv-show-details` edge function already returns all of these (Phase 3 scope). No edge function changes needed.

## Caller updates

### Widget — `SupabaseWidgetClient.markEpisodeWatched`

Before:
```swift
try await supabase.from("user_episode_watches").insert(...).execute()
try await supabase.rpc("sync_tv_show_progress", params: ["p_user_tv_show_id": id]).execute()
```

After:
```swift
try await supabase.rpc("mark_episode_watched", params: [
  "p_user_tv_show_id": id,
  "p_tmdb_show_id": tmdbShowId,
  "p_season_number": seasonNumber,
  "p_episode_number": episodeNumber,
]).execute()
```

### App — `lib/tv-show-service.ts`

Audit for existing callers that INSERT into `user_episode_watches` + call `sync_tv_show_progress`. Replace with a single call to the new RPC. Likely touchpoints:
- `markEpisodeWatched` / `toggleEpisodeWatched` (used by show-detail UI's episode checkboxes)
- Any bulk-mark / "mark season watched" helper

### Not touched in this PR

- `StartNextSeasonIntent` (widget's Start S{N+1} button) — flagged for follow-up
- `sync_tv_show_progress` RPC — kept as fallback

## Testing strategy

### TS unit / integration

**`__tests__/lib/metadata-refresh.test.ts`** (new)
- Batch fetch respects the 5-concurrent limit
- `refreshStaleWatchingShows` queries only `status='watching'` + stale-by-24h rows
- Writes diff fields + `metadata_refreshed_at` when TMDB differs
- Writes only `metadata_refreshed_at` when TMDB matches
- `metadata_refreshed_at` NOT updated on TMDB failure — retry next trigger
- Emits Sentry breadcrumb on TMDB failure
- Returns count of fetched-not-just-queried shows

**`__tests__/hooks/use-widget-sync.test.ts`** (extend Phase 4b.1 tests)
- After successful `syncWidgetCache`, `refreshStaleWatchingShows` is invoked
- On `syncWidgetCache` rejection, `refreshStaleWatchingShows` is NOT invoked
- React Query invalidation fires once (not twice) — combines the widget-sync invalidation and the refresh invalidation

**`__tests__/lib/tv-show-service.test.ts`** (extend existing)
- `markEpisodeWatched` now issues 1 Supabase call, not 2
- Params shape matches the RPC signature exactly

### Postgres tests (via Supabase CLI or pgTAP)

- **Basic:** RPC inserts watch row AND updates user_tv_shows to match aggregate
- **Idempotency:** Calling twice with same args doesn't double-insert; UPDATE runs cleanly both times
- **RLS:** A user cannot `mark_episode_watched` for a `user_tv_show_id` owned by another user
- **Drift correction:** If `user_tv_shows.current_episode` is stale (e.g., 13) but `user_episode_watches` only has 8, a single RPC call correctly sets it to 8 (self-healing)
- **Mid-season backfill:** Marking an earlier episode doesn't regress `current_episode` (the aggregate computes max)

### Device validation (Tyshane)

- Old shows (added pre-deploy, `metadata_refreshed_at IS NULL`) refresh on next app foreground
- Daredevil: Born Again updates `number_of_seasons` to reflect TMDB's current count
- Mark episode via show-detail checkbox → network inspector shows 1 request, not 2
- Mark episode via widget eyeball → same 1-request confirmation via Sentry breadcrumb or logs
- After fresh install with stale `.env.local`, sync still works (no new secrets introduced)

## Risks & rollback

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| Column-add migration blocks on production | Low | Medium | `ALTER TABLE ADD COLUMN` with NULL default is non-blocking in Postgres. Partial index built `CONCURRENTLY` by Supabase's migration infra. |
| New RPC bug corrupts current_season/current_episode | Low | High | Postgres tests cover drift correction + idempotency. `SECURITY INVOKER` + RLS limits blast radius. Legacy RPC stays live as fallback. |
| Batch refresh exhausts TMDB quota | Low | Medium | 24h per-show throttle + 5-concurrent cap. Limit 50 per batch. At 0-user scale no real risk. |
| `metadata_refreshed_at` never set due to sustained TMDB outage | Low | Low | Acceptable — user's next foreground retries. Sentry breadcrumb gives observability. |
| Concurrent mark-episode race (double-tap) | Medium | Low | `ON CONFLICT DO NOTHING` makes INSERT safe. Final aggregate converges. |
| Migration deploys but client code revert needed | Low | Low | Column is additive. Client on old code ignores the new column. Rollback client independently of migration. |

### Rollback plan

Three independent layers, each rollback-able:
1. **Client code** — `git revert` restores 2-call pattern + removes refresh triggers
2. **New RPC** — `DROP FUNCTION mark_episode_watched`; clients revert to `sync_tv_show_progress`
3. **Column** — `DROP COLUMN metadata_refreshed_at`; partial index drops with it

Partial rollback possible if only one layer has issues.

### Migration safety at scale

Current scale (0 users) tolerates the thundering-herd refresh on deploy day. If scale increases before this ships, the migration should be updated to `ALTER TABLE ... ADD COLUMN metadata_refreshed_at timestamptz DEFAULT NOW()` so existing rows are marked "fresh as of deploy" and only newly-stale rows trigger refresh.

## References

- `vault://Projects/CineTrak/Features/PRD - User Show Metadata Refresh` — the parent PRD
- `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget` — widget feature PRD
- `vault://Projects/CineTrak/Decisions/Widget Phase 3 - Deploy Gotchas + Widget Ext Haptic Limits` — includes the TMDB edge function deploy convention
- `docs/superpowers/specs/2026-04-19-widget-phase-4a-design.md` — Phase 4a design (what this phase complements)
- PR #384 (Phase 4a layout), #385 (haptics), #386 (4b.1 React Query invalidation), #387 (4b.2 fetch robustness + cache) — all merged to main
