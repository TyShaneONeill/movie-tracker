# Widget Phase 4b.4 Auto Status Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 4b.4 — auto-flip `user_tv_shows.status` between `'watching'` and `'watched'` based on TMDB show status + episode-count signals, and add foundational `tmdb_status` column for future widget UX.

**Architecture:** Add `tmdb_status text` column to `user_tv_shows`. Extend `lib/metadata-refresh.ts` to (a) widen its query to cover `status='watched' AND tmdb_status='Returning Series'` rows, (b) populate `tmdb_status` on each refresh, and (c) flip Returning Series shows back to `'watching'` when `number_of_episodes` grows. Replace the 4-arg `mark_episode_watched` RPC with a 5-arg version that accepts `p_total_episodes_in_season int` and auto-flips `status='watched'` when user reaches the final episode of the final season of an `Ended`/`Canceled` show. Both TS (`lib/tv-show-service.ts`) and Swift (`SupabaseWidgetClient.swift`) callers pass the new argument.

**Tech Stack:** Supabase Postgres (migration + RPC via MCP), React Native TypeScript (metadata-refresh, tv-show-service, hook, show-detail UI), Jest (unit tests), Swift (widget client + intent).

**Spec reference:** `docs/superpowers/specs/2026-04-20-widget-phase-4b4-status-transitions-design.md`
**Branch:** `feature/widget-4b-status-transitions`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File inventory

**DB (via Supabase MCP `apply_migration`, no local migration file):**
- `add_tmdb_status_to_user_tv_shows` — ALTER TABLE ADD COLUMN + COMMENT
- `update_mark_episode_watched_add_total_episodes_param` — DROP old 4-arg function + CREATE OR REPLACE 5-arg version with auto-flip body

**RN modify:**
- `lib/metadata-refresh.ts` — widen `StaleShowRow` type, extend query `.or()` + SELECT, populate `tmdb_status`, flip-back logic
- `lib/tv-show-service.ts` — `markEpisodeWatched` signature + RPC params
- `hooks/use-episode-actions.ts` — thread `totalEpisodesInSeason` through `markWatched`
- `app/tv/[id]/index.tsx` — pass `episodes.length` when calling `markWatched`
- `lib/database.types.ts` — regenerated (both migrations)

**RN tests:**
- `__tests__/lib/metadata-refresh.test.ts` — 3 new tests (populate, flip-back, no-flip-when-unchanged)
- `__tests__/lib/tv-show-service.test.ts` — update existing 5 `markEpisodeWatched` tests + add 1 new for fallback behavior

**Swift modify:**
- `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift` — new `totalEpisodesInSeason: Int` parameter passed as `p_total_episodes_in_season`
- `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift` — new `@Parameter` + wiring
- Any widget View that constructs `MarkEpisodeWatchedIntent(...)` — pass `show.totalEpisodesInCurrentSeason ?? 0`

---

## Task order rationale

Task 1 (column) is independent. Tasks 2-4 (refresh-side logic) depend only on Task 1. Task 5 (new RPC signature) drops the old 4-arg version — callers MUST be updated in the next tasks in the same session to avoid leaving the branch in a broken type-check state. Task 6 updates TS callers + tests immediately. Tasks 7-8 thread the new arg through the app/widget UI. Task 9 is manual SQL verification. Task 10 is end-to-end verification + PR.

---

### Task 1: Apply `tmdb_status` column migration

**Files (via Supabase MCP, no local migration file):**
- Migration name: `add_tmdb_status_to_user_tv_shows`

- [ ] **Step 1: Apply migration**

Call Supabase MCP `mcp__plugin_supabase_supabase__apply_migration` with `project_id: wliblwulvsrfgqcnbzeh`, `name: add_tmdb_status_to_user_tv_shows`, and:

```sql
ALTER TABLE public.user_tv_shows
  ADD COLUMN tmdb_status text;

COMMENT ON COLUMN public.user_tv_shows.tmdb_status IS
  'TMDB show status: "Ended", "Returning Series", "Canceled", "In Production", "Planned", "Pilot". Refreshed by lib/metadata-refresh.ts. Drives auto status transitions and future widget UI.';
```

- [ ] **Step 2: Verify column exists**

Call Supabase MCP `mcp__plugin_supabase_supabase__execute_sql` with:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_tv_shows'
  AND column_name = 'tmdb_status';
```

Expected: 1 row with `text`, `YES` nullable.

- [ ] **Step 3: Regenerate types**

Run from the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx supabase gen types typescript --project-id wliblwulvsrfgqcnbzeh > lib/database.types.ts
```

Verify `tmdb_status: string | null` appears in the `user_tv_shows` Row/Insert/Update types.

If `npx supabase gen types` fails (CLI not installed / auth expired), manually add the field to the Row (`string | null`), Insert (`string | null | undefined`), and Update (`string | null | undefined`) types for the `user_tv_shows` table. The existing pattern for `metadata_refreshed_at` is the template.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx tsc --noEmit
```

Expected: 0 errors. Adding a nullable column to types should not break anything.

- [ ] **Step 5: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): add tmdb_status column to user_tv_shows

New nullable text column to store TMDB's show status field
("Ended", "Returning Series", "Canceled", etc). Populated by
lib/metadata-refresh.ts on each refresh cycle. Drives auto
status transitions (Phase 4b.4) and unlocks future widget
UX (e.g., "S3 coming soon" badges).

Migration applied to project wliblwulvsrfgqcnbzeh via MCP.

Part of Phase 4b.4 auto status transitions work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend metadata-refresh query to cover watched + Returning Series rows (TDD)

**Files:**
- Modify: `lib/metadata-refresh.ts` (StaleShowRow type, refreshStaleWatchingShows + refreshSingleShow SELECTs and `.or()` chain)
- Test: `__tests__/lib/metadata-refresh.test.ts` (add 1 new test)

- [ ] **Step 1: Write the failing test**

Add this test block at the bottom of `__tests__/lib/metadata-refresh.test.ts`, before the closing `});` of the outer `describe('metadata-refresh', ...)`:

```ts
  describe('refreshStaleWatchingShows query scope', () => {
    it('includes watched+Returning Series rows via .or() expression', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as jest.Mock).mockReturnValue(selectChain);

      await refreshStaleWatchingShows();

      // First .or() should encode the status scope: watching OR (watched AND Returning Series)
      const orCalls = selectChain.or.mock.calls.map((c: unknown[]) => c[0] as string);
      const statusOr = orCalls.find((s) => s.includes('status.eq.watching'));
      expect(statusOr).toBeDefined();
      expect(statusOr).toContain('status.eq.watched');
      expect(statusOr).toContain('tmdb_status.eq.Returning Series');
      // status='watching' should NOT be an .eq() filter anymore (moved into .or())
      expect(selectChain.eq).not.toHaveBeenCalledWith('status', 'watching');
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx jest __tests__/lib/metadata-refresh.test.ts -t 'query scope'
```

Expected: FAIL. Current code uses `.eq('status', 'watching')` so `selectChain.eq` was called with `('status', 'watching')` and no `status.eq.watching` appears in the `.or()` calls.

- [ ] **Step 3: Update `StaleShowRow` type**

Edit `lib/metadata-refresh.ts` — extend the `StaleShowRow` type at the top of the file. Replace:

```ts
type StaleShowRow = {
  id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  metadata_refreshed_at: string | null;
};
```

with:

```ts
type StaleShowRow = {
  id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  metadata_refreshed_at: string | null;
  status: string;
  tmdb_status: string | null;
};
```

- [ ] **Step 4: Update `refreshStaleWatchingShows` query**

In `lib/metadata-refresh.ts`, replace the SELECT + filter chain. Old:

```ts
  const { data: rows, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at')
    .eq('user_id', user.id)
    .eq('status', 'watching')
    .or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_SHOWS_PER_BATCH);
```

New:

```ts
  const { data: rows, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at, status, tmdb_status')
    .eq('user_id', user.id)
    .or(`status.eq.watching,and(status.eq.watched,tmdb_status.eq.Returning Series)`)
    .or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_SHOWS_PER_BATCH);
```

- [ ] **Step 5: Update `refreshSingleShow` SELECT**

Same file. Replace:

```ts
  const { data: row, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at')
    .eq('user_id', user.id)
    .eq('id', userTvShowId)
    .maybeSingle();
```

with:

```ts
  const { data: row, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at, status, tmdb_status')
    .eq('user_id', user.id)
    .eq('id', userTvShowId)
    .maybeSingle();
```

- [ ] **Step 6: Run the new test to verify it passes, and run ALL metadata-refresh tests**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx jest __tests__/lib/metadata-refresh.test.ts
```

Expected: All tests pass. If the existing `refreshStaleWatchingShows` test (`queries only status=watching shows ...`) fails because it asserted `.eq('status', 'watching')`, update that assertion to check the `.or()` instead:

The existing test currently has:
```ts
      expect(selectChain.eq).toHaveBeenCalledWith('status', 'watching');
```

That assertion is now wrong — replace it with:
```ts
      // status now encoded via .or() to include Returning Series watched rows
      const orArgs = selectChain.or.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(orArgs.some((s) => s.includes('status.eq.watching'))).toBe(true);
```

Re-run. Expected: all green.

- [ ] **Step 7: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add lib/metadata-refresh.ts __tests__/lib/metadata-refresh.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): expand metadata-refresh query to cover Returning Series watched rows

Query now selects shows where status='watching' OR (status='watched'
AND tmdb_status='Returning Series'), so the refresh loop can detect
when a returning series publishes new episodes and flip completed
shows back to 'watching'.

Also selects the new `status` + `tmdb_status` columns for downstream
flip/populate logic (next commits).

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Populate `tmdb_status` in `refreshShowMetadata` (TDD)

**Files:**
- Modify: `lib/metadata-refresh.ts` (refreshShowMetadata)
- Test: `__tests__/lib/metadata-refresh.test.ts` (new test)

- [ ] **Step 1: Write the failing test**

Add this test block at the bottom of `__tests__/lib/metadata-refresh.test.ts` (inside the outer `describe`, after the prior new block):

```ts
  describe('refreshShowMetadata tmdb_status population', () => {
    it('writes updates.tmdb_status when TMDB returns a status value that differs from the row', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const row = {
        id: 'utv-1',
        tmdb_id: 101,
        name: 'Test',
        poster_path: null,
        number_of_seasons: 2,
        number_of_episodes: 18,
        metadata_refreshed_at: null,
        status: 'watching',
        tmdb_status: null,
      };

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [row], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCount++;
        return fromCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { number_of_seasons: 2, number_of_episodes: 18, poster_path: null, status: 'Ended' },
        error: null,
      });

      await refreshStaleWatchingShows();

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ tmdb_status: 'Ended' })
      );
    });

    it('does NOT include tmdb_status in updates when TMDB value matches row value', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const row = {
        id: 'utv-1',
        tmdb_id: 101,
        name: 'Test',
        poster_path: null,
        number_of_seasons: 2,
        number_of_episodes: 18,
        metadata_refreshed_at: null,
        status: 'watching',
        tmdb_status: 'Ended',
      };

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [row], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCount++;
        return fromCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { number_of_seasons: 2, number_of_episodes: 18, poster_path: null, status: 'Ended' },
        error: null,
      });

      await refreshStaleWatchingShows();

      const updateArgs = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(updateArgs && 'tmdb_status' in updateArgs).toBe(false);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx jest __tests__/lib/metadata-refresh.test.ts -t 'tmdb_status population'
```

Expected: FAIL. Current `refreshShowMetadata` never writes `tmdb_status`.

- [ ] **Step 3: Update `refreshShowMetadata` to extract + write `tmdb_status`**

In `lib/metadata-refresh.ts`:

First, widen the generic type passed to `supabase.functions.invoke` to include `status`. Replace:

```ts
    const { data: tmdbData, error: tmdbError } = await supabase.functions.invoke<{
      number_of_seasons?: number;
      number_of_episodes?: number;
      poster_path?: string | null;
    }>('get-tv-show-details', { body: { showId: row.tmdb_id } });
```

with:

```ts
    const { data: tmdbData, error: tmdbError } = await supabase.functions.invoke<{
      number_of_seasons?: number;
      number_of_episodes?: number;
      poster_path?: string | null;
      status?: string;
    }>('get-tv-show-details', { body: { showId: row.tmdb_id } });
```

Then, inside the `updates` building block, add the `tmdb_status` branch. Find the existing block:

```ts
    const updates: Record<string, unknown> = {
      metadata_refreshed_at: new Date().toISOString(),
    };
    if (typeof tmdbData.number_of_seasons === 'number' && tmdbData.number_of_seasons > 0 && tmdbData.number_of_seasons !== row.number_of_seasons) {
      updates.number_of_seasons = tmdbData.number_of_seasons;
    }
    if (typeof tmdbData.number_of_episodes === 'number' && tmdbData.number_of_episodes > 0 && tmdbData.number_of_episodes !== row.number_of_episodes) {
      updates.number_of_episodes = tmdbData.number_of_episodes;
    }
    if (tmdbData.poster_path !== undefined && tmdbData.poster_path !== row.poster_path) {
      updates.poster_path = tmdbData.poster_path;
    }
```

Add immediately after the `poster_path` branch (still inside the updates block, before the `.update(updates)` call):

```ts
    if (typeof tmdbData.status === 'string' && tmdbData.status !== row.tmdb_status) {
      updates.tmdb_status = tmdbData.status;
    }
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx jest __tests__/lib/metadata-refresh.test.ts -t 'tmdb_status population'
```

Expected: both new tests PASS.

- [ ] **Step 5: Run the full metadata-refresh test file**

```bash
npx jest __tests__/lib/metadata-refresh.test.ts
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add lib/metadata-refresh.ts __tests__/lib/metadata-refresh.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): populate tmdb_status from TMDB on metadata refresh

refreshShowMetadata now extracts the TMDB show status field
(Ended / Returning Series / Canceled / etc) and writes it to
the new tmdb_status column whenever it differs from the stored
value. Foundational piece for auto status transitions (flip
watching → watched when an Ended show is finished) and future
widget UX ("S3 coming soon" for caught-up Returning Series).

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Flip-back logic for Returning Series with new episodes (TDD)

**Files:**
- Modify: `lib/metadata-refresh.ts` (refreshShowMetadata — flip-back branch)
- Test: `__tests__/lib/metadata-refresh.test.ts` (2 new tests)

- [ ] **Step 1: Write the failing tests**

Add this test block at the bottom of `__tests__/lib/metadata-refresh.test.ts` (inside the outer `describe`):

```ts
  describe('refreshShowMetadata flip-back (watched Returning Series → watching)', () => {
    it('flips status=watching when a watched+Returning Series show gains new episodes', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const row = {
        id: 'utv-1',
        tmdb_id: 101,
        name: 'Severance',
        poster_path: null,
        number_of_seasons: 2,
        number_of_episodes: 19,
        metadata_refreshed_at: null,
        status: 'watched',
        tmdb_status: 'Returning Series',
      };

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [row], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCount++;
        return fromCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { number_of_seasons: 3, number_of_episodes: 20, poster_path: null, status: 'Returning Series' },
        error: null,
      });

      await refreshStaleWatchingShows();

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'watching' })
      );
      // finished_at is intentionally NOT touched — preserved for analytics
      const updateArgs = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(updateArgs && 'finished_at' in updateArgs).toBe(false);
    });

    it('does NOT flip back when number_of_episodes is unchanged', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const row = {
        id: 'utv-1',
        tmdb_id: 101,
        name: 'Severance',
        poster_path: null,
        number_of_seasons: 2,
        number_of_episodes: 19,
        metadata_refreshed_at: null,
        status: 'watched',
        tmdb_status: 'Returning Series',
      };

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [row], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCount++;
        return fromCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { number_of_seasons: 2, number_of_episodes: 19, poster_path: null, status: 'Returning Series' },
        error: null,
      });

      await refreshStaleWatchingShows();

      const updateArgs = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(updateArgs && 'status' in updateArgs).toBe(false);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx jest __tests__/lib/metadata-refresh.test.ts -t 'flip-back'
```

Expected: the first test FAILS (status not flipped), second test PASSES trivially (no flip-back logic exists, so `status` is never in updates).

- [ ] **Step 3: Add flip-back logic in `refreshShowMetadata`**

In `lib/metadata-refresh.ts`, inside the `updates`-building block, AFTER the `tmdb_status` branch (added in Task 3) and BEFORE the `.update(updates)` call, add:

```ts
    if (
      row.status === 'watched'
      && row.tmdb_status === 'Returning Series'
      && typeof tmdbData.number_of_episodes === 'number'
      && tmdbData.number_of_episodes > (row.number_of_episodes ?? 0)
    ) {
      updates.status = 'watching';
      // finished_at intentionally preserved for analytics
    }
```

- [ ] **Step 4: Run flip-back tests to verify they pass**

```bash
npx jest __tests__/lib/metadata-refresh.test.ts -t 'flip-back'
```

Expected: both tests PASS.

- [ ] **Step 5: Run the full metadata-refresh test file**

```bash
npx jest __tests__/lib/metadata-refresh.test.ts
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/metadata-refresh.ts __tests__/lib/metadata-refresh.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): flip Returning Series back to watching when new episodes drop

When a show is marked status='watched' and its tmdb_status is
'Returning Series', refreshShowMetadata now monitors
number_of_episodes growth. If TMDB returns a higher episode
count than we have stored, the show is flipped back to
status='watching' so it re-surfaces in Continue Watching and
the widget. finished_at is preserved for analytics.

Pairs with the expanded refresh query (prior commit) that
already selects watched+Returning Series rows.

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Replace `mark_episode_watched` RPC with 5-arg auto-flip version

**Files (via Supabase MCP):**
- Migration name: `update_mark_episode_watched_add_total_episodes_param`
- Modify (types regen): `lib/database.types.ts`

- [ ] **Step 1: Apply migration**

Call Supabase MCP `mcp__plugin_supabase_supabase__apply_migration` with `project_id: wliblwulvsrfgqcnbzeh`, `name: update_mark_episode_watched_add_total_episodes_param`, and:

```sql
-- Drop the existing 4-arg version to prevent overload ambiguity.
DROP FUNCTION IF EXISTS public.mark_episode_watched(uuid, int, int, int);

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

  -- Auto-flip status='watched' when all signals align:
  --   on final season, finished final episode, show is Ended/Canceled
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

- [ ] **Step 2: Verify the new signature and that the old signature is gone**

Call Supabase MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args, prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'mark_episode_watched' AND pronamespace = 'public'::regnamespace
ORDER BY oid;
```

Expected: exactly 1 row with args = `p_user_tv_show_id uuid, p_tmdb_show_id integer, p_season_number integer, p_episode_number integer, p_total_episodes_in_season integer`, `security_definer: false`. If 2 rows appear, the old 4-arg version wasn't dropped — re-run the DROP manually.

- [ ] **Step 3: Regenerate types**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx supabase gen types typescript --project-id wliblwulvsrfgqcnbzeh > lib/database.types.ts
```

Verify the `mark_episode_watched` entry in `Database['public']['Functions']` now has 5 args including `p_total_episodes_in_season: number`.

If CLI fails, hand-edit the existing entry at `lib/database.types.ts:2142` by adding `p_total_episodes_in_season: number` to the `Args` object. Template:

```ts
      mark_episode_watched: {
        Args: {
          p_episode_number: number
          p_season_number: number
          p_tmdb_show_id: number
          p_total_episodes_in_season: number
          p_user_tv_show_id: string
        }
        Returns: undefined
      }
```

- [ ] **Step 4: Confirm tsc breaks at the expected call sites**

```bash
npx tsc --noEmit
```

Expected: errors in `lib/tv-show-service.ts` at the `supabase.rpc('mark_episode_watched', {...})` call because `p_total_episodes_in_season` is now required. This is expected — Task 6 fixes it.

If tsc reports OTHER errors unrelated to this RPC, pause and investigate before proceeding.

- [ ] **Step 5: Commit (type regen only, caller fix follows immediately in Task 6)**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): replace mark_episode_watched RPC with 5-arg auto-flip version

New signature accepts p_total_episodes_in_season int. When user
finishes the final episode of the final season of an Ended or
Canceled show, the RPC auto-flips status='watched' and sets
finished_at=COALESCE(finished_at, NOW()) — preserving any prior
completion timestamp.

Flip skipped when tmdb_status is NULL, 'Returning Series', or
any non-terminal value, and when p_total_episodes_in_season=0
(caller couldn't determine the season size — defer to next
successful mark).

Drops the prior 4-arg version to prevent overload ambiguity.
TS callers break at this commit and are fixed in the next one
in the same PR.

Migration applied to project wliblwulvsrfgqcnbzeh via MCP.

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update `lib/tv-show-service.ts markEpisodeWatched` to pass the new arg (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` (markEpisodeWatched signature + RPC call)
- Test: `__tests__/lib/tv-show-service.test.ts` (update existing + add new)

- [ ] **Step 1: Update existing tests to include the new argument and assertion**

In `__tests__/lib/tv-show-service.test.ts`, the `describe('markEpisodeWatched', ...)` block starts at line 700. Update all 5 test cases to pass a `totalEpisodesInSeason` value and assert it in the RPC params.

Replace the entire `describe('markEpisodeWatched', () => { ... })` block (lines 700-761) with:

```ts
describe('markEpisodeWatched', () => {
  const episode = makeTMDBEpisode();
  const TOTAL_IN_SEASON = 10;

  it('calls mark_episode_watched RPC with correct params including p_total_episodes_in_season', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(mockRpc).toHaveBeenCalledWith('mark_episode_watched', {
      p_user_tv_show_id: USER_TV_SHOW_ID,
      p_tmdb_show_id: TMDB_ID,
      p_season_number: episode.season_number,
      p_episode_number: episode.episode_number,
      p_total_episodes_in_season: TOTAL_IN_SEASON,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('passes 0 for p_total_episodes_in_season when caller passes 0 (fallback)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, 0);

    expect(mockRpc).toHaveBeenCalledWith('mark_episode_watched', expect.objectContaining({
      p_total_episodes_in_season: 0,
    }));
  });

  it('does NOT use the 2-call pattern (no INSERT + sync_tv_show_progress)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(mockFrom).not.toHaveBeenCalledWith('user_episode_watches');
    expect(mockRpc).not.toHaveBeenCalledWith('sync_tv_show_progress', expect.anything());
  });

  it('returns a UserEpisodeWatch-shaped object built from input params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(result).toMatchObject({
      user_id: USER_ID,
      user_tv_show_id: USER_TV_SHOW_ID,
      tmdb_show_id: TMDB_ID,
      season_number: episode.season_number,
      episode_number: episode.episode_number,
      episode_name: episode.name,
      episode_runtime: episode.runtime,
      still_path: episode.still_path,
      watch_number: 1,
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

    await expect(
      markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON)
    ).rejects.toThrow('RPC failed');
  });

  it('throws fallback message when error has no message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: {} });

    await expect(
      markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON)
    ).rejects.toThrow('Failed to mark episode as watched');
  });
});
```

- [ ] **Step 2: Run the updated tests to verify they fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx jest __tests__/lib/tv-show-service.test.ts -t 'markEpisodeWatched'
```

Expected: tests FAIL because `markEpisodeWatched` doesn't yet accept a 5th arg, and the RPC call doesn't include `p_total_episodes_in_season`.

- [ ] **Step 3: Update `markEpisodeWatched` signature + RPC call**

In `lib/tv-show-service.ts`, find the `markEpisodeWatched` function around line 323. Replace the entire function with:

```ts
// Mark an episode as watched
export async function markEpisodeWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episode: TMDBEpisode,
  totalEpisodesInSeason: number
): Promise<UserEpisodeWatch> {
  const { error } = await supabase.rpc('mark_episode_watched', {
    p_user_tv_show_id: userTvShowId,
    p_tmdb_show_id: tmdbShowId,
    p_season_number: episode.season_number,
    p_episode_number: episode.episode_number,
    p_total_episodes_in_season: totalEpisodesInSeason,
  });

  if (error) {
    throw new Error(error.message || 'Failed to mark episode as watched');
  }

  void syncWidgetCache();

  // Construct the watch record from known params to preserve the return shape
  // for callers. The atomic RPC handles the DB write; we don't need to re-fetch.
  const now = new Date().toISOString();
  return {
    id: '',
    user_id: userId,
    user_tv_show_id: userTvShowId,
    tmdb_show_id: tmdbShowId,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    episode_name: episode.name,
    episode_runtime: episode.runtime,
    still_path: episode.still_path,
    watched_at: now,
    created_at: now,
    notes: null,
    watch_number: 1,
  };
}
```

- [ ] **Step 4: Run the updated tests to verify they pass**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'markEpisodeWatched'
```

Expected: all `markEpisodeWatched` tests PASS.

- [ ] **Step 5: Run the full tv-show-service test file**

```bash
npx jest __tests__/lib/tv-show-service.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run tsc — expect errors in callers to surface**

```bash
npx tsc --noEmit
```

Expected: errors in `hooks/use-episode-actions.ts` because the 4-arg call no longer matches. This is expected — Task 7 fixes it.

- [ ] **Step 7: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): thread p_total_episodes_in_season through markEpisodeWatched

tv-show-service.markEpisodeWatched now takes totalEpisodesInSeason
as a required argument and forwards it to the RPC. 0 signals
"caller could not determine season size" — the RPC then skips
the auto-flip branch and waits for the next successful mark.

Hook and UI call sites are updated in the next commit.

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Thread `totalEpisodesInSeason` through hook + show-detail UI

**Files:**
- Modify: `hooks/use-episode-actions.ts` (markWatched accepts totalEpisodesInSeason)
- Modify: `app/tv/[id]/index.tsx` (pass `episodes.length` when marking)

- [ ] **Step 1: Update `hooks/use-episode-actions.ts`**

In `hooks/use-episode-actions.ts`, three edits:

**(a)** Update the `markWatched` method's signature in the `UseEpisodeActionsResult` interface (around line 19). Replace:

```ts
  markWatched: (episode: TMDBEpisode) => Promise<void>;
```

with:

```ts
  markWatched: (episode: TMDBEpisode, totalEpisodesInSeason: number) => Promise<void>;
```

**(b)** Update the `markWatchedMutation.mutationFn` to accept a tuple so it can forward both arguments. Replace the existing mutation definition (lines 59-78):

```ts
  const markWatchedMutation = useMutation({
    mutationFn: async (episode: TMDBEpisode) => {
      if (!user) throw new Error('Not authenticated');
      return markEpisodeWatched(user.id, userTvShowId, tmdbShowId, episode);
    },
```

with:

```ts
  const markWatchedMutation = useMutation({
    mutationFn: async ({ episode, totalEpisodesInSeason }: { episode: TMDBEpisode; totalEpisodesInSeason: number }) => {
      if (!user) throw new Error('Not authenticated');
      return markEpisodeWatched(user.id, userTvShowId, tmdbShowId, episode, totalEpisodesInSeason);
    },
```

(Keep the existing `onSuccess` block unchanged.)

**(c)** Update the returned `markWatched` function (around line 161). Replace:

```ts
    markWatched: async (episode: TMDBEpisode) => {
      await markWatchedMutation.mutateAsync(episode);
    },
```

with:

```ts
    markWatched: async (episode: TMDBEpisode, totalEpisodesInSeason: number) => {
      await markWatchedMutation.mutateAsync({ episode, totalEpisodesInSeason });
    },
```

- [ ] **Step 2: Update `app/tv/[id]/index.tsx`**

Find `handleToggleEpisode` around line 138:

```ts
  const handleToggleEpisode = async (episode: TMDBEpisode) => {
    if (!isSaved || !userTvShowId) return;
    if (isEpisodeWatched(episode.episode_number)) {
      await unmarkWatched(episode.episode_number);
    } else {
      await markWatched(episode);
    }
  };
```

Replace with:

```ts
  const handleToggleEpisode = async (episode: TMDBEpisode) => {
    if (!isSaved || !userTvShowId) return;
    if (isEpisodeWatched(episode.episode_number)) {
      await unmarkWatched(episode.episode_number);
    } else {
      // episodes is loaded by useSeasonEpisodes earlier in this component;
      // its length is the authoritative TMDB episode count for this season.
      await markWatched(episode, episodes.length);
    }
  };
```

- [ ] **Step 3: Run tsc to verify everything type-checks**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Hook tests for `use-episode-actions` (if any — check `__tests__/hooks/use-episode-actions.test.ts`) should still pass; the internal mutation signature change is internal to the hook. If any hook tests assert the old call shape, update them to match the new one.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-episode-actions.ts app/tv/[id]/index.tsx
git commit -m "$(cat <<'EOF'
feat(widget): pass season episode count through useEpisodeActions to RPC

useEpisodeActions.markWatched now takes a second argument —
totalEpisodesInSeason — which the show-detail screen fills
from episodes.length (the TMDB-loaded season episodes). The
hook forwards it to tv-show-service.markEpisodeWatched, which
forwards it to the 5-arg mark_episode_watched RPC.

This enables the RPC's auto-flip branch: when the user ticks
the final episode of the final season of an Ended/Canceled
show, status flips to 'watched' in the same DB round-trip.

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Update Swift widget caller (SupabaseWidgetClient + MarkEpisodeWatchedIntent)

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift`
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift`
- Modify (grep + update): any widget View file that constructs `MarkEpisodeWatchedIntent(...)`

- [ ] **Step 1: Update `SupabaseWidgetClient.markEpisodeWatched`**

In `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift`, replace the `markEpisodeWatched` function (lines 27-54) with:

```swift
    /// Marks the next episode as watched via the mark_episode_watched RPC.
    /// The RPC atomically inserts the watch record and recomputes
    /// current_season / current_episode in a single round-trip.
    /// When totalEpisodesInSeason > 0 and the show is Ended/Canceled and
    /// the user has reached the final episode of the final season, the
    /// RPC also auto-flips status='watched' on user_tv_shows.
    /// - Parameters:
    ///   - userTvShowId: the user_tv_shows.id UUID
    ///   - tmdbShowId: the TMDB show ID
    ///   - seasonNumber: the season containing the episode to mark
    ///   - episodeNumber: the episode number to mark
    ///   - totalEpisodesInSeason: total episodes in the current season
    ///     from TMDB. Pass 0 when unknown — the RPC then skips the
    ///     auto-flip branch and defers to a later call with a known value.
    static func markEpisodeWatched(
        userTvShowId: String,
        tmdbShowId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        totalEpisodesInSeason: Int
    ) async throws {
        let config = try resolveConfig()
        guard let endpoint = URL(string: "\(config.url)/rest/v1/rpc/mark_episode_watched") else {
            throw ClientError.missingConfig
        }

        let body: [String: Any] = [
            "p_user_tv_show_id": userTvShowId,
            "p_tmdb_show_id": tmdbShowId,
            "p_season_number": seasonNumber,
            "p_episode_number": episodeNumber,
            "p_total_episodes_in_season": totalEpisodesInSeason,
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }
```

- [ ] **Step 2: Update `MarkEpisodeWatchedIntent`**

In `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift`, replace the entire file content with:

```swift
import AppIntents
import WidgetKit

struct MarkEpisodeWatchedIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Episode Watched"
    static var description = IntentDescription("Mark the next episode of this show as watched.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "User TV Show ID")
    var userTvShowId: String

    @Parameter(title: "TMDB Show ID")
    var tmdbShowId: Int

    @Parameter(title: "Season Number")
    var seasonNumber: Int

    @Parameter(title: "Episode Number")
    var episodeNumber: Int

    @Parameter(title: "Total Episodes in Season")
    var totalEpisodesInSeason: Int

    init() {}

    init(userTvShowId: String, tmdbShowId: Int, seasonNumber: Int, episodeNumber: Int, totalEpisodesInSeason: Int) {
        self.userTvShowId = userTvShowId
        self.tmdbShowId = tmdbShowId
        self.seasonNumber = seasonNumber
        self.episodeNumber = episodeNumber
        self.totalEpisodesInSeason = totalEpisodesInSeason
    }

    func perform() async throws -> some IntentResult {
        let start = Date()

        // Silent failure path per design Q2: any error leaves state unchanged
        // and the timeline reloads with the same data. User retries or opens
        // the app.
        do {
            try await SupabaseWidgetClient.markEpisodeWatched(
                userTvShowId: userTvShowId,
                tmdbShowId: tmdbShowId,
                seasonNumber: seasonNumber,
                episodeNumber: episodeNumber,
                totalEpisodesInSeason: totalEpisodesInSeason
            )
            try? WidgetDataWriter.markEpisodeWatched(userTvShowId: userTvShowId)
        } catch {
            // Silent. Intentional.
        }

        // Enforce 1.5s minimum so the button's disabled state is visibly
        // perceptible. PRD: "Button disabled for minimum 1.5 seconds after
        // tap regardless of API response time."
        let elapsed = Date().timeIntervalSince(start)
        if elapsed < 1.5 {
            try? await Task.sleep(nanoseconds: UInt64((1.5 - elapsed) * 1_000_000_000))
        }

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
```

- [ ] **Step 3: Find all MarkEpisodeWatchedIntent constructor call sites**

Run from the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
grep -rn "MarkEpisodeWatchedIntent(" expo-plugins/widget-extension/src --include="*.swift"
```

Record every construction site (excluding the `init()` and `init(...)` lines inside MarkEpisodeWatchedIntent.swift itself). Each one needs to pass `totalEpisodesInSeason: show.totalEpisodesInCurrentSeason ?? 0` (or the closest equivalent — the widget payload struct exposes `totalEpisodesInCurrentSeason: Int?` per `WidgetData.swift:58`).

- [ ] **Step 4: Update each constructor call site**

For each call site found in Step 3, add the new argument. Example transformation:

Before:
```swift
MarkEpisodeWatchedIntent(
    userTvShowId: show.userTvShowId,
    tmdbShowId: show.tmdbShowId,
    seasonNumber: show.currentSeason,
    episodeNumber: nextEpisodeNumber
)
```

After:
```swift
MarkEpisodeWatchedIntent(
    userTvShowId: show.userTvShowId,
    tmdbShowId: show.tmdbShowId,
    seasonNumber: show.currentSeason,
    episodeNumber: nextEpisodeNumber,
    totalEpisodesInSeason: show.totalEpisodesInCurrentSeason ?? 0
)
```

The actual variable name on the show/payload side is `totalEpisodesInCurrentSeason` (confirmed in `WidgetData.swift:58`). Use the closest in-scope reference — typically a `show:` or `entry.show` local.

- [ ] **Step 5: Verify no 4-arg MarkEpisodeWatchedIntent constructors remain**

```bash
grep -rn "MarkEpisodeWatchedIntent(" expo-plugins/widget-extension/src --include="*.swift"
```

Read each match. Every constructor call (not the `init(...)` in the intent file itself) should have 5 named arguments ending in `totalEpisodesInSeason: ...`.

- [ ] **Step 6: Verify Swift compiles (best-effort, no xcodebuild in this context)**

Swift compilation happens at EAS build time. Manual verification via Xcode / EAS is required before ship. As a static check, verify:

```bash
grep -rn "SupabaseWidgetClient.markEpisodeWatched" expo-plugins/widget-extension/src --include="*.swift"
```

All matches must pass 5 labeled arguments. Any 4-arg call is a bug.

- [ ] **Step 7: Commit**

```bash
git add expo-plugins/widget-extension/src
git commit -m "$(cat <<'EOF'
feat(widget): thread totalEpisodesInSeason through widget mark-watched intent

SupabaseWidgetClient.markEpisodeWatched and MarkEpisodeWatchedIntent
both take totalEpisodesInSeason as a required argument, forwarded
to the 5-arg mark_episode_watched RPC. Call sites pull the value
from widget payload's totalEpisodesInCurrentSeason (populated by
lib/widget-cache.ts with a 0 fallback when unknown).

When the user taps the next-episode button on the final episode
of the final season of an Ended/Canceled show, the RPC auto-flips
status='watched' in the same round-trip. Widget timeline reloads
and the show rolls off the Continue Watching surface.

Part of Phase 4b.4 auto status transitions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Manual RPC smoke-tests via Supabase MCP

The RPC uses `auth.uid()`, which returns NULL in the service-role MCP context. We can exercise the branch logic by seeding minimal rows and calling the RPC via a temporary session-setting. This task documents the SQL; run each block via `mcp__plugin_supabase_supabase__execute_sql`.

**Files:** none (verification only)

- [ ] **Step 1: Pick a real test user + show**

```sql
SELECT u.id AS user_tv_show_id, u.user_id, u.tmdb_id, u.name,
       u.status, u.tmdb_status, u.current_season, u.current_episode,
       u.number_of_seasons, u.number_of_episodes
FROM public.user_tv_shows u
WHERE u.status = 'watching'
ORDER BY u.updated_at DESC
LIMIT 3;
```

Record a `user_tv_show_id`, `user_id`, and `tmdb_id`. Ideal: a show where `tmdb_status IS NULL` so we can verify the populate path too. If all recent rows already have `tmdb_status`, pick anyway — the populate test will be a no-op but the flip test still runs.

- [ ] **Step 2: Verify auto-flip-to-watched path (Ended + last episode)**

Pick a show with `tmdb_status='Ended'` and `number_of_seasons` small. Manually set the row state to "one episode away from final":

```sql
-- Substitute <uuid>, <tmdb_id>, <user_id> with the row from Step 1.
-- PREREQ: the show's tmdb_status must be 'Ended'. If not, UPDATE it for this test:
UPDATE public.user_tv_shows
SET tmdb_status = 'Ended',
    number_of_seasons = 2,
    current_season = 2,
    current_episode = 9
WHERE id = '<user_tv_show_id>';

-- Call the RPC to mark S2E10 (the final episode):
SELECT public.mark_episode_watched(
  '<user_tv_show_id>'::uuid,
  <tmdb_id>::int,
  2::int,      -- p_season_number
  10::int,     -- p_episode_number
  10::int      -- p_total_episodes_in_season
);
```

This will fail with `'Unauthenticated'` if called with the service role because `auth.uid() IS NULL`. That's fine — the purpose of this step is to confirm the RPC compiles with the new signature and reaches the auth guard. If the call returns `Unauthenticated (42501)`, the signature is correct.

- [ ] **Step 3: Verify the RPC signature by dry-call**

Use a trivially invalid call to assert the signature is accepted:

```sql
-- Should raise 'Unauthenticated' (42501), confirming the 5-arg signature is callable:
SELECT public.mark_episode_watched(
  gen_random_uuid(),
  0,
  0,
  0,
  0
);
```

Expected error: `Unauthenticated (SQLSTATE 42501)`. Any OTHER error (e.g., `function does not exist`) indicates the migration didn't land correctly.

- [ ] **Step 4: Spot-check that old 4-arg version is GONE**

```sql
SELECT public.mark_episode_watched(
  gen_random_uuid(),
  0,
  0,
  0
);
```

Expected error: `function public.mark_episode_watched(uuid, integer, integer, integer) does not exist`. If this call succeeds or returns a different error, the old version wasn't dropped — rerun the DROP from Task 5.

- [ ] **Step 5: Spot-check tmdb_status populates correctly on a real row**

Find one `watching` row, note its current `tmdb_status`, then trigger `refreshSingleShow` for it (this requires running from the app — defer to device validation in Task 10).

As a DB-only spot check:

```sql
SELECT id, name, status, tmdb_status, number_of_episodes, metadata_refreshed_at
FROM public.user_tv_shows
WHERE status = 'watching'
ORDER BY updated_at DESC
LIMIT 5;
```

This gives a baseline. After the device validation in Task 10 runs, the same query should show `tmdb_status` populated on rows that were refreshed.

- [ ] **Step 6: No commit — this task is pure verification**

---

### Task 10: Final verification + PR

**Files:** none — running checks, opening PR.

- [ ] **Step 1: Run the full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
npm run lint && npx tsc --noEmit && npm test
```

Expected: zero lint errors, zero tsc errors, all tests pass. If any fail, fix them before proceeding.

- [ ] **Step 2: Check for stray 4-arg references**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-status
grep -rn "mark_episode_watched" lib hooks app expo-plugins/widget-extension/src --include="*.ts" --include="*.tsx" --include="*.swift" | grep -v "//\|#"
```

Read each match. Every call must include `p_total_episodes_in_season` (TS) or `totalEpisodesInSeason` (Swift) / 5 labeled args.

- [ ] **Step 3: Confirm git log looks clean**

```bash
git log --oneline feature/widget-4b-status-transitions --not origin/main
```

Expected: a sequence of commits matching the Task structure (8 commits: 1 spec + 7 implementation tasks; Task 9 and 10 don't commit code). Messages should be clear and self-contained.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/widget-4b-status-transitions
```

- [ ] **Step 5: Open the PR**

Use `gh pr create` with a body that references the spec and calls out the test plan. Template:

```bash
gh pr create --title "feat(widget): Phase 4b.4 — auto status transitions (Ended/Canceled → watched, Returning Series flip-back)" --body "$(cat <<'EOF'
## Summary

- Adds `tmdb_status text` column on `user_tv_shows` (populated by metadata refresh)
- Replaces `mark_episode_watched` RPC with a 5-arg version that auto-flips `status='watched'` when the user finishes the final episode of an Ended/Canceled show
- Extends `lib/metadata-refresh.ts` to (a) cover watched + Returning Series rows, (b) populate `tmdb_status`, (c) flip Returning Series shows back to `'watching'` when new episodes drop
- Threads `totalEpisodesInSeason` through TS callers (`tv-show-service`, `use-episode-actions`, show-detail) and Swift callers (`SupabaseWidgetClient`, `MarkEpisodeWatchedIntent`, widget Views)

Design spec: `docs/superpowers/specs/2026-04-20-widget-phase-4b4-status-transitions-design.md`
Builds on Phase 4b.3 (PR #388).

## Test plan

- [x] `npm run lint && npx tsc --noEmit && npm test` — all green
- [ ] Device: Daredevil show-detail → `tmdb_status='Ended'` populated after refresh
- [ ] Device: Mark final episode of S2 → status flips to `'watched'`
- [ ] Device: Continue Watching no longer includes Daredevil
- [ ] Device: Show-detail status pill reads "Watched"
- [ ] Device: Pick a Returning Series caught-up show — stays `'watching'`
- [ ] Device: After next metadata refresh, a Returning Series that got a new episode flips back to `'watching'`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Record the PR URL**

Return the PR URL in the session summary so it's captured in the daily note.

- [ ] **Step 7: Wait for CI**

Monitor via `gh pr checks <PR_NUMBER> --watch` or MCP. Address any failures (most likely an edge case in the types regen or a hook test that referenced the old mutation signature).

---

## Success criteria (mirrored from spec)

- [ ] User finishes final episode of Ended show → status auto-flips to `'watched'` on the same RPC call
- [ ] Continue Watching carousel no longer includes newly-finished shows
- [ ] Show-detail status pill reflects `'watched'`
- [ ] Returning Series caught-up shows stay `'watching'`
- [ ] When a Returning Series adds a new episode, next metadata refresh flips the show back to `'watching'` without manual action
- [ ] `finished_at` populated on flip, preserved across re-flips
- [ ] `npm run lint && npx tsc --noEmit && npm test` — all green

## Rollback

If the change needs reverting post-merge:

1. Revert the PR via `gh pr revert` (or manual `git revert <merge_sha>`).
2. Apply a migration to restore the 4-arg RPC (copy from Phase 4b.3 migration `create_mark_episode_watched_rpc`).
3. Drop `tmdb_status` column: `ALTER TABLE public.user_tv_shows DROP COLUMN tmdb_status;`

The revert is reversible in minutes. No data-migration risk — `tmdb_status` is nullable and not a foreign key; `finished_at` is preserved across flips so no user-visible state is destroyed.
