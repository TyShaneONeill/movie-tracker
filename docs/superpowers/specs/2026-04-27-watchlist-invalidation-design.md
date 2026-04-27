# Watchlist Invalidation Across Screens — Design Spec

**Date:** 2026-04-27
**Status:** Ready for plan
**Feature:** When a user adds, updates, or removes a movie that affects watchlist state, every screen reading watchlist data refetches immediately. No more 5-minute stale window.
**Parent initiative:** Release Calendar SP4-A follow-up (UX papercut surfaced during device validation)
**Builds on:** [SP4-A — My-Releases Filter](./2026-04-26-sp4-my-releases-filter-design.md)

## Context

SP4-A added a "Show only my watchlist" filter to the release calendar. The filter is fed by `useWatchlistIds`, a React Query hook with `staleTime: 5 * 60 * 1000` (5 min) on queryKey `['watchlist-tmdb-ids']`.

**Bug:** When the user adds or removes a movie elsewhere in the app (search results, movie detail page, scan-to-add, Letterboxd import), the calendar's filter doesn't reflect the change until staleTime expires or the user navigates away and back. The filter is stale-by-default.

**Root cause:** Existing user_movies mutations invalidate `['userMovies']` (their own listing key) but not `['watchlist-tmdb-ids']` (the calendar's filter key). The two cache keys feed off the same underlying table but were wired up by different features at different times.

**Why now:** The bug is small, the fix is small, and it completes SP4-A's "calendar feels personal" UX promise. Without it, the filter looks subtly broken.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| Invalidate vs optimistic update | **Invalidate.** Refetching `getWatchlistTmdbIds()` is cheap (just IDs) and avoids the race surface of in-cache Set mutation. |
| Centralization strategy | **Helper function.** New `invalidateUserMovieQueries(queryClient)` bundles `['userMovies']` + `['watchlist-tmdb-ids']`. Replace every existing `invalidateQueries({ queryKey: ['userMovies'] })` callsite. |
| Why helper over queryKey hierarchy | Restructuring `['watchlist-tmdb-ids']` → `['userMovies', 'watchlist-tmdb-ids']` would let RQ cascade-invalidate, but it's a refactor that touches just-shipped SP4-A code paths. Helper is contained and additive. |
| Scope of mutations covered | Comprehensive — all 4 status-affecting mutations on `user_movies` (`addMovieToLibrary`, `updateMovieStatus`, `downgradeMovieStatus`, `removeMovieFromLibrary`) plus the journey hook + scan-to-add + Letterboxd import paths. |
| Status-aware invalidation | **Always invalidate.** Even mutations that don't cross the watchlist boundary (e.g. `'watched'` → `'watching'`) invalidate. Cost is one cheap network call; complexity savings are real. |
| Out of scope | TV shows watchlist parity (movies-only matches SP4-A scope), optimistic updates, queryKey hierarchy refactor. |

## Scope

### 1. New file: `lib/query-invalidation.ts`

Single small helper. Tiny new module so future related queryKeys (SP4-B "coming this week" carousel, etc.) can extend it in one place.

```ts
import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every cached query that depends on a user's user_movies state.
 * Call this from onSuccess of any mutation that inserts/updates/deletes a row in user_movies.
 */
export function invalidateUserMovieQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['userMovies'] });
  queryClient.invalidateQueries({ queryKey: ['watchlist-tmdb-ids'] });
}
```

### 2. Existing callsites — swap to helper

Every place currently calling `queryClient.invalidateQueries({ queryKey: ['userMovies'] })` becomes `invalidateUserMovieQueries(queryClient)`. Concrete callsites (verified during recon):

- `hooks/use-user-movies.ts` — 3 mutations (add/update/remove), one invalidation each
- `hooks/use-movie-actions.ts` — at least the `downgradeStatusMutation` and any other user_movies-touching mutations in the same file (implementation pass scans for `['userMovies']` references)
- `hooks/use-journey.ts` — 2 places (`updateJourney`, `createNewJourney`). Journey mutations don't change watchlist directly, but `createNewJourney` for a rewatch implies the original movie was 'watched' so it's safe to invalidate; `updateJourney` only touches journey fields and does not affect watchlist set, but invalidating is cheap and avoids leaking implementation knowledge of which mutations affect which keys.
- `app/scan/review.tsx:482` — replace inline invalidation. Scan adds rows with `status='watched'` (does not enter watchlist), but use the helper for consistency.

### 3. Letterboxd import flow

`lib/letterboxd-service.ts:184` calls `addMovieToLibrary` directly inside a per-row loop with no QueryClient access. Three import flows in `app/settings/letterboxd-import.tsx`:
- **Watchlist import** — bulk-adds rows with `status='watchlist'`. **Critical path** for this fix.
- **Watched import** — bulk-adds rows with `status='watched'`.
- **Likes import** — touches `user_movie_likes`, not `user_movies`. Out of scope.

Implementation: after the import flow completes (success path in the screen), call `invalidateUserMovieQueries(queryClient)`. Single invalidation after the bulk import, not per-row.

### 4. Tests

Failing-first → green TDD pattern. Three test files, all already exist except the helper's:

**New unit test:** `__tests__/lib/query-invalidation.test.ts`
- `invalidateUserMovieQueries` invokes `queryClient.invalidateQueries` with `['userMovies']`
- Same helper call also invokes `queryClient.invalidateQueries` with `['watchlist-tmdb-ids']`
- Both calls happen on the same QueryClient instance

**Update `__tests__/hooks/use-movie-actions.test.ts`:**
- Assert `['watchlist-tmdb-ids']` is invalidated alongside `['userMovies']` on each of `addMutation`, `removeMutation`, `changeStatusMutation`, `downgradeStatusMutation` success/onSettled. This is the most-trafficked watchlist add/remove path (movie detail screens) and the existing test harness has the infrastructure ready.

**No tests for `hooks/use-user-movies.ts`, `hooks/use-journey.ts`, `app/scan/review.tsx`, `app/settings/letterboxd-import.tsx`** — no existing test files for these paths (verified by directory listing). Adding test infrastructure is out of scope for a 1-2h fix. The helper has its own unit test, so we know the call works correctly; integration risk on these callsites is captured by manual device validation. (The `use-user-movies.ts` test gap pre-exists this PR — flag for separate follow-up.)

**Test pattern:** `jest.spyOn(queryClient, 'invalidateQueries')` and assert by `queryKey` argument. Mirrors existing patterns in `__tests__/hooks/use-episode-actions.test.ts` (lines 242, 320, 403).

### 5. Device validation

After PR merge prep:
1. Open calendar with watchlist filter ON, note current state
2. Background → search for a movie not on the calendar's current view → add to watchlist
3. Foreground → calendar (return to it without backgrounding) → that movie's release date should now show
4. Repeat for remove flow
5. Letterboxd watchlist import → calendar should reflect imported titles within seconds
6. Toggle filter OFF and ON to confirm no regression to the SP4-A-shipped behavior

## Risks

| Risk | Mitigation |
|---|---|
| Helper introduces a circular import (`lib/` → `hooks/` → `lib/`) | Helper lives in `lib/`, takes `QueryClient` as arg, has no React Query React-side imports. No risk. |
| Existing journey mutations now refetch watchlist on every journey edit | Cheap query (just IDs), runs maybe twice a day per active user. Acceptable. |
| Letterboxd import refetches mid-loop if helper called per row | Spec calls helper once after the import loop completes, not per row. |
| TV shows watchlist parity gap surfaces later | Out of scope for this PR. If SP4 expands to TV, follow same pattern with `['userTvShows']` + a `tv-watchlist-tmdb-ids` key when it's introduced. |
| Subagent permission scope when implementing across multiple top-level dirs | Per `feedback_subagent_permission_scope` memory: pre-approve worktree-root permissions before parallel subagent dispatch. Single implementer + reviewer cycle is fine. |

## Out of scope (do NOT scope-creep)

- TV shows watchlist parity
- Optimistic in-cache Set updates (separate enhancement, not a UX necessity)
- queryKey hierarchy refactor (`['userMovies', 'watchlist-tmdb-ids']`)
- Other SP4 features (carousel, trailers, notifications, etc.)
- `useCalendarFilters` hook extraction (separate follow-up #2 in queue)

## Estimated scope

1-2 hours, single PR, single worktree (`cinetrak-watchlist-invalidation`, branch `fix/watchlist-invalidation`).
