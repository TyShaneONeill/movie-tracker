# Watchlist Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user adds, updates, or removes a movie that affects watchlist state, every screen reading watchlist data refetches immediately. No more 5-minute stale window on the SP4-A calendar filter.

**Architecture:** Single small helper `invalidateUserMovieQueries(queryClient)` in `lib/query-invalidation.ts` bundles `['userMovies']` + `['watchlist-tmdb-ids']` invalidation. Replace every existing `invalidateQueries({ queryKey: ['userMovies'] })` callsite with the helper. Callsites that currently invalidate per-movie singular keys (`['userMovie', userId, tmdbId]`) keep those calls separately — the helper's responsibility is the cross-screen list/derived keys.

**Tech Stack:** React Query (`@tanstack/react-query`), Jest, TypeScript, Expo (no platform-specific code).

**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-watchlist-invalidation` on branch `fix/watchlist-invalidation` (already created off `origin/main`, `.env.local` already copied).

**Spec:** `docs/superpowers/specs/2026-04-27-watchlist-invalidation-design.md`

---

## File Structure

**Create:**
- `lib/query-invalidation.ts` — the helper (~12 lines)
- `__tests__/lib/query-invalidation.test.ts` — helper unit test (~40 lines)

**Modify:**
- `hooks/use-user-movies.ts` — 3 onSuccess handlers (lines 75-77, 88-90, 95-97) → helper call
- `hooks/use-movie-actions.ts` — 4 onSettled handlers (lines 126-133, 167-170, 206-213, 268-271) → keep singular invalidation, add helper call
- `hooks/use-journey.ts` — 2 onSuccess handlers (lines 112-119 deleteMutation, 183-190 createMutation) → helper call replaces `['userMovies']` line
- `app/scan/review.tsx` — line 482 inline invalidation → helper call
- `app/settings/letterboxd-import.tsx` — `handleImport` success path (line 148 `setState('done')`) → add `useQueryClient` + helper call
- `__tests__/hooks/use-movie-actions.test.ts` — add 4 new test cases asserting `['watchlist-tmdb-ids']` invalidation (one per mutation)

**Out of scope** (manual device validation only): no test files for `hooks/use-user-movies.ts`, `hooks/use-journey.ts`, `app/scan/review.tsx`, `app/settings/letterboxd-import.tsx`.

---

## Task 1: Create helper + unit test (TDD)

**Files:**
- Create: `lib/query-invalidation.ts`
- Test: `__tests__/lib/query-invalidation.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `__tests__/lib/query-invalidation.test.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';

describe('invalidateUserMovieQueries', () => {
  it('invalidates both userMovies list and watchlist-tmdb-ids on the same QueryClient', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateUserMovieQueries(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['userMovies'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate any other keys', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateUserMovieQueries(queryClient);

    const calledKeys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    for (const key of calledKeys) {
      expect(['userMovies', 'watchlist-tmdb-ids']).toContain((key as unknown[])[0]);
    }
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-watchlist-invalidation
npx jest __tests__/lib/query-invalidation.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/query-invalidation'`.

- [ ] **Step 1.3: Write the helper**

Create `lib/query-invalidation.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every cached query that depends on a user's user_movies state.
 * Call from onSuccess/onSettled of any mutation that inserts/updates/deletes a row in user_movies.
 *
 * Currently invalidates:
 * - ['userMovies'] — the user's library list
 * - ['watchlist-tmdb-ids'] — the release calendar's watchlist filter (SP4-A)
 *
 * Per-movie singular keys (e.g. ['userMovie', userId, tmdbId]) are NOT covered here —
 * callers that maintain those should invalidate them separately.
 */
export function invalidateUserMovieQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['userMovies'] });
  queryClient.invalidateQueries({ queryKey: ['watchlist-tmdb-ids'] });
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
npx jest __tests__/lib/query-invalidation.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 1.5: Commit**

```bash
git add lib/query-invalidation.ts __tests__/lib/query-invalidation.test.ts
git commit -m "feat(query): add invalidateUserMovieQueries helper

Bundles invalidation of ['userMovies'] + ['watchlist-tmdb-ids'] for any
mutation that touches user_movies. Single source of truth so future
SP4-B/C derived queries can extend in one place.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire helper into use-movie-actions.ts (TDD with 4 new test cases)

**Files:**
- Modify: `hooks/use-movie-actions.ts:126-133, 167-170, 206-213, 268-271`
- Modify: `__tests__/hooks/use-movie-actions.test.ts` (add 4 new test cases)

This is the highest-traffic watchlist add/remove path (movie detail screens). It currently uses `onSettled` (not `onSuccess`) for invalidation so cache always refreshes whether the server succeeds or errors. Keep that pattern.

- [ ] **Step 2.1: Write the failing tests**

At the very end of `__tests__/hooks/use-movie-actions.test.ts`, BEFORE the closing `});` on line 484 (the last `describe('useMovieActions', ...)` close), add this new describe block:

```ts
  // ==========================================================================
  // Watchlist invalidation (cross-screen freshness — SP4-A follow-up)
  // ==========================================================================

  describe('watchlist invalidation', () => {
    it('invalidates watchlist-tmdb-ids when adding to watchlist', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(null);
      mockAddMovieToLibrary.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(false);
      });

      await act(async () => {
        await result.current.addToWatchlist(makeTMDBMovie() as any, 'watchlist');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when removing from watchlist', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));
      mockRemoveMovieFromLibrary.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.isSaved).toBe(true);
      });

      await act(async () => {
        await result.current.removeFromWatchlist();
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when changing status', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));
      mockUpdateMovieStatus.mockResolvedValue(makeUserMovie({ status: 'watching' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watchlist');
      });

      await act(async () => {
        await result.current.changeStatus('watching');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });

    it('invalidates watchlist-tmdb-ids when downgrading status', async () => {
      const { queryClient, wrapper } = createTestHarness();
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      mockGetMovieByTmdbId.mockResolvedValue(makeUserMovie({ status: 'watched' }));
      mockDowngradeMovieStatus.mockResolvedValue(makeUserMovie({ status: 'watchlist' }));

      const { result } = renderHook(() => useMovieActions(TMDB_ID), { wrapper });

      await waitFor(() => {
        expect(result.current.currentStatus).toBe('watched');
      });

      await act(async () => {
        await result.current.downgradeStatus('watchlist');
      });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
      });
    });
  });
```

**Three small companion edits to the top of the test file** (so the typed-mock pattern stays consistent):

(a) Add `downgradeMovieStatus: jest.fn()` to the `jest.mock('@/lib/movie-service', ...)` block (around line 21):

```ts
jest.mock('@/lib/movie-service', () => ({
  getMovieByTmdbId: jest.fn(),
  addMovieToLibrary: jest.fn(),
  removeMovieFromLibrary: jest.fn(),
  updateMovieStatus: jest.fn(),
  downgradeMovieStatus: jest.fn(),
  getMovieLike: jest.fn(),
  likeMovie: jest.fn(),
  unlikeMovie: jest.fn(),
}));
```

(b) Add `downgradeMovieStatus` to the corresponding import block (around line 33):

```ts
import {
  getMovieByTmdbId,
  addMovieToLibrary,
  removeMovieFromLibrary,
  updateMovieStatus,
  downgradeMovieStatus,
  getMovieLike,
  likeMovie,
  unlikeMovie,
} from '@/lib/movie-service';
```

(c) Add the typed-mock alias right next to the others (around line 48, after `mockUpdateMovieStatus`):

```ts
const mockDowngradeMovieStatus = downgradeMovieStatus as jest.Mock;
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
npx jest __tests__/hooks/use-movie-actions.test.ts -t "watchlist invalidation"
```

Expected: 4 FAILs — `expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] })` will not match because the production code does not invalidate that key yet.

- [ ] **Step 2.3: Add the helper import + 4 invalidation calls in production code**

In `hooks/use-movie-actions.ts`, add the import near the top (after the existing `@/lib/movie-service` import block, around line 16):

```ts
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
```

In the `addMutation`'s `onSettled` (around line 126), add the helper call after the existing invalidations:

```ts
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      invalidateUserMovieQueries(queryClient);
      if (variables?.status === 'watched') {
        triggerAchievementCheck();
      }
      earn('add_title', String(tmdbId));
    },
```

(Replaces the previous `queryClient.invalidateQueries({ queryKey: ['userMovies'] })` line — the helper now covers it.)

In the `removeMutation`'s `onSettled` (around line 167):

```ts
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      invalidateUserMovieQueries(queryClient);
    },
```

In the `changeStatusMutation`'s `onSettled` (around line 206):

```ts
    onSettled: (_data, _error, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      invalidateUserMovieQueries(queryClient);
      if (newStatus === 'watched') {
        triggerAchievementCheck();
        earn('mark_watched', `movie:${tmdbId}`);
      }
    },
```

In the `downgradeStatusMutation`'s `onSettled` (around line 268):

```ts
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['userMovie', user?.id, tmdbId] });
      invalidateUserMovieQueries(queryClient);
    },
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npx jest __tests__/hooks/use-movie-actions.test.ts
```

Expected: ALL tests pass (existing optimistic-update tests + 4 new invalidation tests).

- [ ] **Step 2.5: Commit**

```bash
git add hooks/use-movie-actions.ts __tests__/hooks/use-movie-actions.test.ts
git commit -m "fix(movies): invalidate watchlist-tmdb-ids on movie-detail mutations

Calendar's SP4-A filter (watchlistOnly) reads ['watchlist-tmdb-ids'] with
5-min staleTime. Without explicit invalidation, adding/removing from
movie detail didn't refresh the filter for up to 5 minutes. Wire helper
into all 4 movie-detail mutations (add, remove, change, downgrade).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire helper into use-user-movies.ts (no new tests)

**Files:**
- Modify: `hooks/use-user-movies.ts:75-77, 88-90, 95-97`

No test file exists for this hook (existing coverage gap, not addressing in this PR). Manual verification.

- [ ] **Step 3.1: Add the helper import**

In `hooks/use-user-movies.ts`, after the `@/lib/movie-service` import block (around line 10), add:

```ts
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
```

- [ ] **Step 3.2: Replace all 3 onSuccess handlers**

Replace the `addMutation` onSuccess (lines 75-77):

```ts
    onSuccess: () => {
      invalidateUserMovieQueries(queryClient);
    },
```

Replace the `updateMutation` onSuccess (lines 88-90):

```ts
    onSuccess: () => {
      invalidateUserMovieQueries(queryClient);
    },
```

Replace the `removeMutation` onSuccess (lines 95-97):

```ts
    onSuccess: () => {
      invalidateUserMovieQueries(queryClient);
    },
```

- [ ] **Step 3.3: Type check + lint**

```bash
npx tsc --noEmit && npm run lint -- hooks/use-user-movies.ts
```

Expected: clean.

- [ ] **Step 3.4: Commit**

```bash
git add hooks/use-user-movies.ts
git commit -m "fix(movies): use invalidateUserMovieQueries helper in useUserMovies hook

Replace 3 inline ['userMovies'] invalidation sites with the helper so the
calendar's watchlist-tmdb-ids filter also refreshes on add/update/remove
from library/collection screens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire helper into use-journey.ts (no new tests)

**Files:**
- Modify: `hooks/use-journey.ts:112-119, 183-190`

Two callsites: `deleteMutation.onSuccess` and `createMutation.onSuccess` (in `useCreateJourney`). Both currently invalidate `['userMovies']` plus other keys. Replace the userMovies line with the helper call. The other keys (`['journey']`, `['journeysByMovie']`) are journey-specific — keep those invalidations as-is.

- [ ] **Step 4.1: Add the helper import**

After the existing `@/lib/movie-service` import (around line 10), add:

```ts
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
```

- [ ] **Step 4.2: Replace deleteMutation onSuccess (lines 112-119)**

```ts
    onSuccess: () => {
      // Invalidate user movies list + dependent watchlist-tmdb-ids
      invalidateUserMovieQueries(queryClient);
      // Invalidate all journey queries
      queryClient.invalidateQueries({ queryKey: ['journey'] });
      // Invalidate journeys by movie (for carousel updates)
      queryClient.invalidateQueries({ queryKey: ['journeysByMovie'] });
    },
```

- [ ] **Step 4.3: Replace createMutation onSuccess (lines 183-190)**

```ts
    onSuccess: (newJourney) => {
      // Invalidate journeys for this movie
      queryClient.invalidateQueries({
        queryKey: ['journeysByMovie', newJourney.tmdb_id],
      });
      // Invalidate user movies list + dependent watchlist-tmdb-ids
      invalidateUserMovieQueries(queryClient);
    },
```

- [ ] **Step 4.4: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4.5: Commit**

```bash
git add hooks/use-journey.ts
git commit -m "fix(journey): use invalidateUserMovieQueries helper in journey mutations

Journey delete and rewatch-create both touch user_movies, so the
calendar's watchlist filter also needs refresh. Other journey-specific
keys keep their existing invalidation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire helper into app/scan/review.tsx (no new tests)

**Files:**
- Modify: `app/scan/review.tsx:482`

Scan-to-add adds rows with `status='watched'` (does not enter watchlist), but invalidate for consistency — cheap no-op refetch when the watchlist set is unchanged.

- [ ] **Step 5.1: Add the helper import**

Add the import near the existing `@/lib/...` imports at the top of the file:

```ts
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
```

- [ ] **Step 5.2: Replace the inline invalidation at line 482**

Change from:

```ts
      // Bust caches so profile + journey carousel reflect the new rows immediately
      queryClient.invalidateQueries({ queryKey: ['userMovies'] });
      for (const ticket of validTickets) {
```

To:

```ts
      // Bust caches so profile + journey carousel + calendar reflect the new rows immediately
      invalidateUserMovieQueries(queryClient);
      for (const ticket of validTickets) {
```

- [ ] **Step 5.3: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5.4: Commit**

```bash
git add app/scan/review.tsx
git commit -m "fix(scan): use invalidateUserMovieQueries helper after ticket scan import

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire helper into app/settings/letterboxd-import.tsx (no new tests)

**Files:**
- Modify: `app/settings/letterboxd-import.tsx`

Critical path — Letterboxd watchlist imports add many rows to the watchlist at once. Currently this screen has NO QueryClient access at all; need to add the import + hook.

- [ ] **Step 6.1: Add imports**

At the top of `app/settings/letterboxd-import.tsx`, find the existing `@tanstack/react-query` usage. There isn't one yet — add a new import block. Right after the `import { useAuth } from '@/hooks/use-auth';` line (line 19):

```ts
import { useQueryClient } from '@tanstack/react-query';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';
```

- [ ] **Step 6.2: Add the queryClient hook call**

Inside `LetterboxdImportScreen()`, right after the `const { user } = useAuth();` line (around line 51), add:

```ts
  const queryClient = useQueryClient();
```

- [ ] **Step 6.3: Call helper after import succeeds**

Inside `handleImport`, after `setState('done')` (around line 148), add the invalidation:

```ts
      setImportProgress(finalProgress);
      setState('done');
      triggerAchievementCheck();
      hapticNotification(NotificationFeedbackType.Success);
      // Refresh library + calendar's watchlist filter once after the import loop
      invalidateUserMovieQueries(queryClient);
```

(One invalidation after the loop, not per-row.)

- [ ] **Step 6.4: Update the useCallback dependency array for handleImport**

The existing `handleImport` is wrapped in `useCallback` with deps `[user, matches, triggerAchievementCheck]` (line 158). Add `queryClient`:

```ts
  }, [user, matches, triggerAchievementCheck, queryClient]);
```

- [ ] **Step 6.5: Type check + lint**

```bash
npx tsc --noEmit && npm run lint -- app/settings/letterboxd-import.tsx
```

Expected: clean.

- [ ] **Step 6.6: Commit**

```bash
git add app/settings/letterboxd-import.tsx
git commit -m "fix(letterboxd): invalidate user_movies queries after import succeeds

Letterboxd watchlist imports bulk-add rows with status='watchlist' —
without invalidation, the calendar's filter stays stale until staleTime
expires. Single invalidation after the import loop completes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Full pre-PR check + manual device validation + PR

- [ ] **Step 7.1: Run the full pre-commit check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-watchlist-invalidation
npm run lint && npx tsc --noEmit && npm test
```

Expected: lint clean, tsc clean, all tests pass (~838-851 + 6 new = ~857).

- [ ] **Step 7.2: Push branch**

```bash
git push -u origin fix/watchlist-invalidation
```

- [ ] **Step 7.3: Manual device validation (run before PR merge)**

Build to device or run dev:

```bash
npm start
```

Validation checklist:

1. Open the calendar. Toggle "Show only my watchlist" ON. Note the visible release dates.
2. Tap a calendar release card → movie detail screen → tap "Add to Watchlist". Pop back to calendar (don't background app). Verify the new movie's release date now shows. (Pre-fix: it would NOT appear for up to 5 minutes.)
3. Tap a watchlisted release → movie detail → tap "Remove from Watchlist". Pop back to calendar. Verify the release no longer shows.
4. Add a movie from search results → calendar should reflect when navigating back.
5. Letterboxd flow: Settings → Letterboxd Import → import a small `watched.csv` (or a test file). Wait for completion. Navigate to calendar → confirm any imported titles with upcoming releases appear (or that filtering works as expected).
6. Toggle filter OFF → confirm SP4-A behavior unchanged (all releases visible).

If any check fails, file an issue and DO NOT merge.

- [ ] **Step 7.4: Open PR**

```bash
gh pr create --title "fix(calendar): invalidate watchlist-tmdb-ids on user_movies mutations" --body "$(cat <<'EOF'
## Summary
- Add `invalidateUserMovieQueries(queryClient)` helper that bundles `['userMovies']` + `['watchlist-tmdb-ids']` invalidation
- Wire helper into all 4 movie-detail mutations (add, remove, change-status, downgrade-status) in `hooks/use-movie-actions.ts`
- Wire helper into 3 library mutations in `hooks/use-user-movies.ts`
- Wire helper into 2 journey mutations (delete, rewatch-create) in `hooks/use-journey.ts`
- Wire helper into scan-to-add flow (`app/scan/review.tsx`)
- Wire helper into Letterboxd import success (`app/settings/letterboxd-import.tsx` — adds `useQueryClient` to a screen that didn't previously use it)
- Add 4 new test cases to `__tests__/hooks/use-movie-actions.test.ts` proving each mutation invalidates the watchlist key
- New unit test for the helper itself

## Why
SP4-A (PR #403) added a "Show only my watchlist" filter to the release calendar, fed by `useWatchlistIds` (queryKey `['watchlist-tmdb-ids']`, 5-min staleTime). When users add or remove movies elsewhere in the app, that cache stayed stale until the 5-min window expired or the user navigated away and back. Surfaced during SP4-A device validation.

## Spec
`docs/superpowers/specs/2026-04-27-watchlist-invalidation-design.md`

## Test plan
- [x] `npm run lint` clean
- [x] `npx tsc --noEmit` clean
- [x] `npm test` — all existing + 6 new tests pass
- [ ] Device: add from movie detail → watchlist filter on calendar reflects within seconds (no app background)
- [ ] Device: remove from movie detail → calendar reflects same way
- [ ] Device: change status (watched ↔ watchlist) on movie detail → calendar reflects
- [ ] Device: Letterboxd watched.csv import → calendar reflects after import completes
- [ ] Regression: toggle filter OFF → SP4-A behavior unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7.5: Final code review (opus full-diff)**

After PR is opened, run the `superpowers:requesting-code-review` skill or dispatch an opus reviewer agent against the full diff. Address any high-confidence findings as additional commits.

---

## Self-review

**Spec coverage:**
- ✅ Helper file (`lib/query-invalidation.ts`) — Task 1
- ✅ Helper unit test (`__tests__/lib/query-invalidation.test.ts`) — Task 1
- ✅ `hooks/use-user-movies.ts` 3 onSuccess swaps — Task 3
- ✅ `hooks/use-movie-actions.ts` 4 mutations + tests — Task 2
- ✅ `hooks/use-journey.ts` 2 onSuccess swaps — Task 4
- ✅ `app/scan/review.tsx` inline invalidation swap — Task 5
- ✅ Letterboxd import flow — Task 6
- ✅ Pre-commit check + device validation + PR — Task 7

**Type consistency:**
- Helper signature `invalidateUserMovieQueries(queryClient: QueryClient): void` consistent across all callsites and the test
- Import path `@/lib/query-invalidation` consistent
- `downgradeMovieStatus` mock now in the test mock list (Step 2.1 fixes the omission)

**Placeholder scan:**
- All steps have concrete file paths and code blocks
- All tests have concrete assertions
- All commits have concrete messages
- No "TBD", "TODO", "implement later", "appropriate error handling" markers

**Commits:**
- One per task (7 commits total). Frequent, atomic, easy to revert if any single step regresses.
