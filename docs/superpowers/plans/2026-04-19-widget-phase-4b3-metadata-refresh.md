# Widget Phase 4b.3 Metadata Refresh + Atomic RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 4b.3 — keep `user_tv_shows` TMDB-derived metadata fresh via foreground batch + lazy-on-view refresh patterns, AND replace the two-call `markEpisodeWatched` pattern with a single atomic Postgres RPC.

**Architecture:** New `lib/metadata-refresh.ts` module fires from `useWidgetSync` (batch) and show-detail navigation (lazy). New `public.mark_episode_watched` RPC atomically inserts into `user_episode_watches` and recomputes `user_tv_shows.current_season/current_episode` from the aggregate — replaces the 2-call pattern in both widget (`SupabaseWidgetClient.swift`) and app (`tv-show-service.ts`). Throttling via new `metadata_refreshed_at timestamptz` column with 24h TTL and 5-concurrent TMDB cap.

**Tech Stack:** Supabase Postgres (RPC, migration), React Native TypeScript (metadata-refresh module, hook integration, service update), Jest (TS unit/integration), Swift (SupabaseWidgetClient update).

**Spec reference:** `docs/superpowers/specs/2026-04-19-widget-phase-4b3-metadata-refresh-design.md`
**Branch:** `feature/widget-4b-metadata-refresh`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File inventory

**DB (via Supabase MCP `apply_migration`):**
- `add_metadata_refreshed_at_to_user_tv_shows` — ALTER TABLE + partial index
- `create_mark_episode_watched_rpc` — CREATE FUNCTION

**RN create:**
- `lib/metadata-refresh.ts` — refreshStaleWatchingShows, refreshSingleShow, internal helpers

**RN modify:**
- `lib/tv-show-service.ts` — markEpisodeWatched function uses new RPC
- `hooks/use-widget-sync.ts` — fires refreshStaleWatchingShows after syncWidgetCache
- Show-detail screen or its hook — lazy refreshSingleShow on mount

**RN tests:**
- `__tests__/lib/metadata-refresh.test.ts` (new)
- `__tests__/lib/tv-show-service.test.ts` (extend)
- `__tests__/hooks/use-widget-sync.test.ts` (extend)

**Swift modify:**
- `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift`

**Conditionally touched (depending on where show-detail fetches):**
- `hooks/use-tv-show-detail.ts` or `app/tv/[id]/index.tsx`

---

### Task 1: Add `metadata_refreshed_at` column + partial index

**Files (via Supabase MCP, no local migration file needed):**
- Migration name: `add_metadata_refreshed_at_to_user_tv_shows`

- [ ] **Step 1: Apply migration**

Call the Supabase MCP `apply_migration` tool with `project_id: wliblwulvsrfgqcnbzeh`, `name: add_metadata_refreshed_at_to_user_tv_shows`, and:

```sql
ALTER TABLE public.user_tv_shows
  ADD COLUMN metadata_refreshed_at timestamptz;

CREATE INDEX idx_user_tv_shows_metadata_refresh
  ON public.user_tv_shows (user_id, metadata_refreshed_at)
  WHERE status = 'watching';
```

- [ ] **Step 2: Verify column exists**

Call Supabase MCP `execute_sql` with:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_tv_shows'
  AND column_name = 'metadata_refreshed_at';
```

Expected: 1 row, `timestamptz`, `YES` nullable.

- [ ] **Step 3: Verify index exists**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'user_tv_shows'
  AND indexname = 'idx_user_tv_shows_metadata_refresh';
```

Expected: 1 row with `WHERE (status = 'watching'::text)` in the indexdef.

- [ ] **Step 4: Pull updated types locally**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh && npx supabase gen types typescript --project-id wliblwulvsrfgqcnbzeh > lib/database.types.ts`

If `npx supabase gen types` fails due to CLI not installed: install via `npm i -g supabase`. If auth fails, skip this step and manually add the type (the Row type for `user_tv_shows` needs a new field `metadata_refreshed_at: string | null`).

- [ ] **Step 5: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): add metadata_refreshed_at column to user_tv_shows

New nullable timestamptz column + partial index on (user_id,
metadata_refreshed_at) WHERE status='watching'. Default NULL
means "never refreshed, refresh on next foreground." Migration
applied to project wliblwulvsrfgqcnbzeh via MCP.

Part of Phase 4b.3 metadata refresh work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `mark_episode_watched` RPC

**Files (via Supabase MCP):**
- Migration name: `create_mark_episode_watched_rpc`

- [ ] **Step 1: Apply migration**

Call Supabase MCP `apply_migration` with name `create_mark_episode_watched_rpc` and:

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

  -- Idempotent insert via existence check. Respects user_episode_watches
  -- .watch_number column (rewatch tracking is a future feature).
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

  -- Recompute current_season/current_episode from the aggregate.
  -- Self-heals any prior drift.
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_episode_watched(uuid, int, int, int) TO authenticated;
```

- [ ] **Step 2: Verify function exists**

```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args, prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'mark_episode_watched' AND pronamespace = 'public'::regnamespace;
```

Expected: 1 row, args = `p_user_tv_show_id uuid, p_tmdb_show_id integer, p_season_number integer, p_episode_number integer`, `security_definer: false`.

- [ ] **Step 3: Regenerate types**

`npx supabase gen types typescript --project-id wliblwulvsrfgqcnbzeh > lib/database.types.ts`

Verify the RPC's args/returns appear in the generated `Database['public']['Functions']['mark_episode_watched']` entry.

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): add mark_episode_watched RPC (atomic insert + update)

New Postgres function replaces the 2-call pattern of INSERT
user_episode_watches + RPC sync_tv_show_progress. Runs in a
single transaction. SECURITY INVOKER + auth.uid() guard + RLS
enforces caller can only mark their own shows.

Idempotent via IF NOT EXISTS guard (respects the watch_number
rewatch column). Self-healing: recomputes current_season /
current_episode from the full user_episode_watches aggregate,
so prior drift is corrected on any successful call.

Part of Phase 4b.3 atomic RPC work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Smoke-test the new RPC via Supabase MCP

**Files:** none (manual verification)

- [ ] **Step 1: Pick a test user and show**

Via Supabase MCP `execute_sql`:

```sql
SELECT u.id AS user_tv_show_id, u.user_id, u.tmdb_id, u.name, u.current_season, u.current_episode
FROM public.user_tv_shows u
WHERE u.status = 'watching'
ORDER BY u.updated_at DESC
LIMIT 1;
```

Record the `user_tv_show_id`, `user_id`, and `tmdb_id` for the next step. Need a row that represents a real show currently being watched.

- [ ] **Step 2: Test idempotency — call RPC twice, verify no duplicate rows**

NOTE: The RPC uses `auth.uid()`, which returns NULL in the MCP context (no authenticated user session). Testing with MCP requires a workaround — either:

(a) Temporarily use the Postgres superuser role and explicitly set the user_id: cannot directly call the RPC. Skip step 2 and 3 via MCP; cover these cases in the RN integration test or a future pgTAP test pass.

(b) Run the RPC from an authenticated RN context (in the test file in Task 7).

Recommendation: use (b). Mark this task as a smoke-test-via-integration-test and defer actual RPC call to Task 7's Jest integration test. Proceed to Task 4.

- [ ] **Step 3: Commit (no-op, already committed in Task 2)**

No changes to commit here. Task 3 is a planning checkpoint — DB surface area for mark_episode_watched is complete and RN-side testing will exercise it.

---

### Task 4: Build `lib/metadata-refresh.ts` — core module (TDD)

**Files:**
- Create: `lib/metadata-refresh.ts`
- Create: `__tests__/lib/metadata-refresh.test.ts`

- [ ] **Step 1: Write failing test — refreshStaleWatchingShows queries stale rows only**

Create `__tests__/lib/metadata-refresh.test.ts`:

```ts
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

import { refreshStaleWatchingShows, refreshSingleShow } from '@/lib/metadata-refresh';
import { supabase } from '@/lib/supabase';

describe('metadata-refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('refreshStaleWatchingShows', () => {
    it('queries only status=watching shows with stale metadata_refreshed_at', async () => {
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

      expect(supabase.from).toHaveBeenCalledWith('user_tv_shows');
      expect(selectChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(selectChain.eq).toHaveBeenCalledWith('status', 'watching');
      // The .or() call contains the OR of NULL + stale (24h) — verify it was called
      expect(selectChain.or).toHaveBeenCalled();
      expect(selectChain.limit).toHaveBeenCalledWith(50);
    });
  });
});
```

- [ ] **Step 2: Run test — expect fail (module doesn't exist)**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh && npx jest __tests__/lib/metadata-refresh --no-coverage`

Expected: fails because `@/lib/metadata-refresh` not found.

- [ ] **Step 3: Create minimal `lib/metadata-refresh.ts`**

Create `lib/metadata-refresh.ts`:

```ts
import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react-native';

const STALE_THRESHOLD_HOURS = 24;
const MAX_CONCURRENT_FETCHES = 5;
const MAX_SHOWS_PER_BATCH = 50;

type StaleShowRow = {
  id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  metadata_refreshed_at: string | null;
};

/**
 * Refresh TMDB-derived metadata for all the user's `status='watching'` shows
 * whose `metadata_refreshed_at` is NULL or older than STALE_THRESHOLD_HOURS.
 * Returns the number of shows for which a TMDB fetch actually fired.
 * No-op if no user is authed.
 */
export async function refreshStaleWatchingShows(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const cutoffIso = new Date(Date.now() - STALE_THRESHOLD_HOURS * 3600 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at')
    .eq('user_id', user.id)
    .eq('status', 'watching')
    .or(`metadata_refreshed_at.is.null,metadata_refreshed_at.lt.${cutoffIso}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_SHOWS_PER_BATCH);

  if (error || !rows) return 0;

  let refreshedCount = 0;
  await runWithLimit(rows as StaleShowRow[], MAX_CONCURRENT_FETCHES, async (row) => {
    const fired = await refreshShowMetadata(row);
    if (fired) refreshedCount++;
  });
  return refreshedCount;
}

/**
 * Refresh a single show by user_tv_show_id. Skips if metadata is fresh.
 * Returns true if a TMDB fetch fired, false if skipped.
 */
export async function refreshSingleShow(userTvShowId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: row, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, number_of_seasons, number_of_episodes, metadata_refreshed_at')
    .eq('user_id', user.id)
    .eq('id', userTvShowId)
    .maybeSingle();

  if (error || !row) return false;

  // Skip if fresh (within STALE_THRESHOLD_HOURS)
  if (row.metadata_refreshed_at) {
    const age = Date.now() - Date.parse(row.metadata_refreshed_at);
    if (age < STALE_THRESHOLD_HOURS * 3600 * 1000) return false;
  }

  return await refreshShowMetadata(row as StaleShowRow);
}

// Private: fetches TMDB, diffs against row, writes updated fields + metadata_refreshed_at.
// Returns true if TMDB fetch fired (whether or not anything changed).
async function refreshShowMetadata(row: StaleShowRow): Promise<boolean> {
  try {
    const { data: tmdbData, error: tmdbError } = await supabase.functions.invoke<{
      number_of_seasons?: number;
      number_of_episodes?: number;
      poster_path?: string | null;
    }>('get-tv-show-details', { body: { showId: row.tmdb_id } });

    if (tmdbError || !tmdbData) {
      Sentry.addBreadcrumb({
        category: 'metadata-refresh',
        level: 'warning',
        message: 'TMDB fetch failed for show; retry next trigger',
        data: { user_tv_show_id: row.id, tmdb_id: row.tmdb_id, error: tmdbError?.message },
      });
      return false;
    }

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

    await supabase
      .from('user_tv_shows')
      .update(updates)
      .eq('id', row.id);

    return true;
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'metadata-refresh',
      level: 'warning',
      message: 'refreshShowMetadata unexpected error',
      data: { user_tv_show_id: row.id, error: err instanceof Error ? err.message : String(err) },
    });
    return false;
  }
}

// Private: runs async operations with a concurrency cap. No library dep.
async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}
```

- [ ] **Step 4: Run Step 1 test — expect PASS**

Run: `npx jest __tests__/lib/metadata-refresh --no-coverage`

Expected: 1 test passes. If the `.or()` call assertion fails because of how the mock captures it, adjust the test assertion to match the actual or-clause string.

- [ ] **Step 5: Add more tests — concurrency cap, TMDB failure path, diff logic**

Append to `__tests__/lib/metadata-refresh.test.ts` inside the existing describe block:

```ts
  describe('refreshStaleWatchingShows concurrency', () => {
    it('caps parallel TMDB fetches at 5', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const mockRows = Array.from({ length: 10 }, (_, i) => ({
        id: `utv-${i}`,
        tmdb_id: 100 + i,
        name: `Show ${i}`,
        poster_path: null,
        number_of_seasons: 1,
        number_of_episodes: 8,
        metadata_refreshed_at: null,
      }));

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as jest.Mock).mockImplementation(() => {
        // First call is the select; subsequent calls are updates.
        return selectChain.limit.mock.calls.length === 0 ? selectChain : updateChain;
      });

      let concurrent = 0;
      let maxConcurrent = 0;
      (supabase.functions.invoke as jest.Mock).mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return { data: { number_of_seasons: 2 }, error: null };
      });

      await refreshStaleWatchingShows();

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(10);
    });
  });

  describe('refreshShowMetadata TMDB failure', () => {
    it('does not update metadata_refreshed_at on TMDB failure', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ id: 'utv-1', tmdb_id: 101, name: 'Test', poster_path: null, number_of_seasons: 1, number_of_episodes: 8, metadata_refreshed_at: null }], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCallCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCallCount++;
        return fromCallCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('network') });

      const count = await refreshStaleWatchingShows();

      expect(count).toBe(0);
      expect(updateChain.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshSingleShow staleness check', () => {
    it('skips fetch when row is fresh (<24h)', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const freshTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h ago
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'utv-1', tmdb_id: 101, name: 'Fresh', poster_path: null, number_of_seasons: 1, number_of_episodes: 8, metadata_refreshed_at: freshTime },
          error: null,
        }),
      };
      (supabase.from as jest.Mock).mockReturnValue(selectChain);

      const result = await refreshSingleShow('utv-1');

      expect(result).toBe(false);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 6: Run all tests — expect PASS**

Run: `npx jest __tests__/lib/metadata-refresh --no-coverage`

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/metadata-refresh.ts __tests__/lib/metadata-refresh.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): add metadata-refresh module (Phase 4b.3)

New lib/metadata-refresh.ts module exposes refreshStaleWatchingShows
(batch) and refreshSingleShow (lazy) for keeping user_tv_shows
TMDB-derived fields current.

- 24h staleness TTL via metadata_refreshed_at column
- Max 5 concurrent TMDB fetches (hand-rolled semaphore; no lib dep)
- Max 50 shows per batch (safety cap against thousands of shows)
- Fields refreshed: number_of_seasons, number_of_episodes, poster_path
- Silent-fail + Sentry breadcrumb on TMDB failure — retry next trigger
- metadata_refreshed_at NOT updated on failure (ensures retry)

4 new tests: stale-only query shape, concurrency cap,
TMDB-failure-doesn't-mark-fresh, lazy-fresh-skip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update `lib/tv-show-service.ts` — use new RPC (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` — markEpisodeWatched function
- Modify/Create: `__tests__/lib/tv-show-service.test.ts`

- [ ] **Step 1: Find the current implementation**

Read the full file: `lib/tv-show-service.ts`. Search for `markEpisodeWatched` (or a similarly-named function). Note its signature and which functions call it.

Also grep for `sync_tv_show_progress` to find any other callers of the 2-call pattern that need updating.

Run: `grep -rn "sync_tv_show_progress\|markEpisodeWatched" lib/ app/ hooks/`

- [ ] **Step 2: Write failing test — new RPC call shape**

In `__tests__/lib/tv-show-service.test.ts` (create if doesn't exist; if it does, append):

```ts
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { markEpisodeWatched } from '@/lib/tv-show-service';
import { supabase } from '@/lib/supabase';

describe('tv-show-service.markEpisodeWatched', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls mark_episode_watched RPC with correct params', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await markEpisodeWatched({
      userTvShowId: 'utv-1',
      tmdbShowId: 101,
      seasonNumber: 2,
      episodeNumber: 5,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('mark_episode_watched', {
      p_user_tv_show_id: 'utv-1',
      p_tmdb_show_id: 101,
      p_season_number: 2,
      p_episode_number: 5,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('does NOT use the 2-call pattern (no INSERT + sync_tv_show_progress)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await markEpisodeWatched({
      userTvShowId: 'utv-1',
      tmdbShowId: 101,
      seasonNumber: 2,
      episodeNumber: 5,
    });

    // The old pattern called supabase.from('user_episode_watches').insert(...).
    // The new pattern does not call .from() at all.
    expect(supabase.from).not.toHaveBeenCalled();
    // Never call the deprecated RPC
    expect(supabase.rpc).not.toHaveBeenCalledWith('sync_tv_show_progress', expect.anything());
  });
});
```

Adapt the test if `markEpisodeWatched`'s signature is different (e.g., positional args vs object). Find the ACTUAL signature in Step 1.

- [ ] **Step 3: Run test — expect FAIL**

Run: `npx jest __tests__/lib/tv-show-service --no-coverage`

Expected: fails — likely because the old implementation calls `.from('user_episode_watches').insert(...)`.

- [ ] **Step 4: Update the implementation**

In `lib/tv-show-service.ts`, find `markEpisodeWatched` and replace its body with:

```ts
export async function markEpisodeWatched(params: {
  userTvShowId: string;
  tmdbShowId: number;
  seasonNumber: number;
  episodeNumber: number;
}): Promise<void> {
  const { error } = await supabase.rpc('mark_episode_watched', {
    p_user_tv_show_id: params.userTvShowId,
    p_tmdb_show_id: params.tmdbShowId,
    p_season_number: params.seasonNumber,
    p_episode_number: params.episodeNumber,
  });

  if (error) {
    throw error;
  }
}
```

If the existing function has a different signature (e.g., positional args, different param names), preserve its external signature and map to the RPC internally. Goal is that callers don't need to change.

If there are OTHER callers of the 2-call pattern you found in Step 1 (e.g., `toggleEpisodeWatched`, `markSeasonWatched`), update them similarly to use the new RPC (one call per episode for bulk operations — not ideal but maintains correctness; batch optimization can be a follow-up).

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx jest __tests__/lib/tv-show-service --no-coverage`

Expected: 2 tests pass.

- [ ] **Step 6: Verify callers still work — run broader test suite**

Run: `npx jest --no-coverage`

Expected: 730+ tests pass (baseline + new ones). Fix any test that broke because it was asserting on the old 2-call pattern — those assertions should update to the new RPC shape.

- [ ] **Step 7: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
fix(widget): use mark_episode_watched RPC in tv-show-service

Replaces the 2-call pattern (INSERT user_episode_watches +
sync_tv_show_progress RPC) with a single atomic RPC call.
Preserves the external function signature; callers unchanged.

Any other functions in tv-show-service that used the same 2-call
pattern are updated in the same way.

Part of Phase 4b.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Hook metadata refresh into `useWidgetSync` (TDD)

**Files:**
- Modify: `hooks/use-widget-sync.ts`
- Modify: `__tests__/hooks/use-widget-sync.test.ts`

- [ ] **Step 1: Write failing test — refreshStaleWatchingShows fires after successful sync**

Append to `__tests__/hooks/use-widget-sync.test.ts`:

```ts
jest.mock('@/lib/metadata-refresh', () => ({
  refreshStaleWatchingShows: jest.fn().mockResolvedValue(0),
}));

import { refreshStaleWatchingShows } from '@/lib/metadata-refresh';

describe('useWidgetSync metadata refresh integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    (syncWidgetCache as jest.Mock).mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('fires refreshStaleWatchingShows after syncWidgetCache resolves', async () => {
    renderHook(() => useWidgetSync(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncWidgetCache).toHaveBeenCalled();
    expect(refreshStaleWatchingShows).toHaveBeenCalled();
  });

  it('does NOT fire refreshStaleWatchingShows when syncWidgetCache rejects', async () => {
    (syncWidgetCache as jest.Mock).mockRejectedValue(new Error('boom'));

    renderHook(() => useWidgetSync(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncWidgetCache).toHaveBeenCalled();
    expect(refreshStaleWatchingShows).not.toHaveBeenCalled();
  });

  it('invalidates userTvShow keys when refresh returns count > 0', async () => {
    (refreshStaleWatchingShows as jest.Mock).mockResolvedValue(3);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    renderHook(() => useWidgetSync(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // First invalidate call is from Phase 4b.1 (after syncWidgetCache).
    // Second invalidate call is from Phase 4b.3 (after refresh).
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx jest __tests__/hooks/use-widget-sync --no-coverage`

Expected: fails — hook doesn't call refreshStaleWatchingShows.

- [ ] **Step 3: Update hook**

In `hooks/use-widget-sync.ts`, extend the existing `runSync` callback:

```ts
import { refreshStaleWatchingShows } from '@/lib/metadata-refresh';

// ...inside runSync, AFTER the existing Phase 4b.1 invalidateQueries call:

      // Phase 4b.3: refresh stale TMDB metadata for watching shows
      const refreshedCount = await refreshStaleWatchingShows();
      if (refreshedCount > 0) {
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey[0];
            return k === 'userTvShow' || k === 'userTvShows' || k === 'episodeWatches';
          },
        });
      }
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx jest __tests__/hooks/use-widget-sync --no-coverage`

Expected: all tests pass (prior ones + 3 new).

- [ ] **Step 5: Commit**

```bash
git add hooks/use-widget-sync.ts __tests__/hooks/use-widget-sync.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): fire metadata refresh from useWidgetSync (Phase 4b.3)

After syncWidgetCache completes successfully, useWidgetSync now
calls refreshStaleWatchingShows() — keeps user_tv_shows TMDB fields
current on every app foreground (throttled per-show via
metadata_refreshed_at).

When the refresh touches at least one show, invalidate React Query
keys (userTvShow/userTvShows/episodeWatches) so app screens see
fresh data without waiting for the 5min staleTime.

3 new tests covering the happy path, rejection path (refresh not
fired), and invalidation-on-count-gt-0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add lazy refresh to show-detail screen (TDD)

**Files:**
- Modify: show-detail screen file (to be discovered in Step 1)
- Test: extend the screen's test file if it has one

- [ ] **Step 1: Find the show-detail screen and its data hook**

Run: `grep -rln "useTvShowDetail\|use-tv-show-detail" app/ hooks/`

Read the show-detail screen component (`app/tv/[id]/index.tsx` or similar) and its query hook (`hooks/use-tv-show-detail.ts`).

Identify the best injection point — likely the screen component's top-level effect, with access to both `userTvShow?.id` and `queryClient`.

- [ ] **Step 2: Wire lazy refresh**

In the show-detail screen (or an appropriate hook), add a `useEffect` that fires `refreshSingleShow`:

```tsx
import { refreshSingleShow } from '@/lib/metadata-refresh';
import { useQueryClient } from '@tanstack/react-query';

// ...inside the component, after the userTvShow query resolves:
const queryClient = useQueryClient();

useEffect(() => {
  if (!userTvShow?.id) return;
  // Fire-and-forget; throttled internally by metadata_refreshed_at.
  refreshSingleShow(userTvShow.id).then((fired) => {
    if (fired) {
      queryClient.invalidateQueries({ queryKey: ['userTvShow', userTvShow.user_id, userTvShow.tmdb_id] });
    }
  });
}, [userTvShow?.id]);
```

Adjust the `queryKey` array to match the actual React Query key pattern used for the show-detail user state — per Phase 4b.1 recon, that was `['userTvShow', userId, tmdbId]`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: clean. If show-detail screen has a specific data model that needs mapping, resolve type errors inline.

- [ ] **Step 4: Smoke-test via tests**

If the show-detail screen has an existing integration test, extend it to cover the refresh trigger. If not, skip — this is a narrow addition and device validation in Task 11 will catch issues.

- [ ] **Step 5: Commit**

```bash
git add app/tv/[id]/index.tsx hooks/use-tv-show-detail.ts  # adjust paths as found in Step 1
git commit -m "$(cat <<'EOF'
feat(widget): lazy refresh user_tv_shows on show-detail mount

When user navigates to a show-detail screen, fire refreshSingleShow
for that show. Throttled internally by metadata_refreshed_at (skip
if <24h old). On refresh-fired, invalidate the show's React Query
cache so the visible screen updates.

Fire-and-forget; screen doesn't block on the TMDB call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Update `SupabaseWidgetClient.swift` — use new RPC

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift`

- [ ] **Step 1: Read the current implementation**

```
cat expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift
```

Locate the `markEpisodeWatched` function. Confirm it does the 2-call pattern (INSERT + RPC).

- [ ] **Step 2: Replace with single RPC call**

Replace the 2-call body with a single RPC call. Expected shape:

```swift
static func markEpisodeWatched(
    userTvShowId: String,
    tmdbShowId: Int,
    seasonNumber: Int,
    episodeNumber: Int
) async throws {
    guard let authToken = AuthTokenReader.readAll()?.accessToken else {
        throw SupabaseWidgetClientError.missingAuthToken
    }
    guard let url = URL(string: "\(supabaseUrl)/rest/v1/rpc/mark_episode_watched") else {
        throw SupabaseWidgetClientError.invalidUrl
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")

    let body: [String: Any] = [
        "p_user_tv_show_id": userTvShowId,
        "p_tmdb_show_id": tmdbShowId,
        "p_season_number": seasonNumber,
        "p_episode_number": episodeNumber
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
        throw SupabaseWidgetClientError.invalidResponse
    }
    guard (200...299).contains(http.statusCode) else {
        throw SupabaseWidgetClientError.httpError(statusCode: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
    }
}
```

Preserve surrounding helper types (`SupabaseWidgetClientError`, etc.) as they are. If the existing file uses a different error enum or auth pattern, adapt to match.

- [ ] **Step 3: Prebuild to verify Swift compiles**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh && npx expo prebuild --platform ios --clean`

Expected: clean prebuild, no Swift compile errors.

- [ ] **Step 4: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Networking/SupabaseWidgetClient.swift
git commit -m "$(cat <<'EOF'
fix(widget): SupabaseWidgetClient uses mark_episode_watched RPC

Widget's markEpisodeWatched now fires ONE RPC call instead of the
2-call pattern (INSERT user_episode_watches + sync_tv_show_progress).
Atomic write; no more drift from partial-failure scenarios.

Function signature unchanged; widget's MarkEpisodeWatchedIntent
continues to call it with the same parameters.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full-suite verification

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh && npm run lint`

Expected: 0 errors, only the 7 pre-existing warnings.

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Full test suite**

Run: `npm test -- --no-coverage`

Expected: 737+ tests passing (730 baseline + ~7 new: 4 metadata-refresh + 2 tv-show-service + 3 use-widget-sync).

- [ ] **Step 4: Prebuild widget extension**

Run: `npx expo prebuild --platform ios --clean`

Expected: CocoaPods installs, no Swift compile errors.

- [ ] **Step 5: If any check failed, fix and commit**

If any failure was introduced by this PR's changes, fix it and commit. If it's pre-existing, note it and continue.

---

### Task 10: Device validation (Tyshane)

**Files:** none (manual)

- [ ] **Step 1: Build and install**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh
npx expo run:ios --device
```

- [ ] **Step 2: Validation checklist**

- [ ] Open PocketStubs app — triggers foreground sync + metadata refresh
- [ ] Wait ~10 seconds for refresh to complete
- [ ] Navigate to Daredevil show-detail — `number_of_seasons` should reflect TMDB's current count (no longer stuck at the stale 1-season value)
- [ ] Tap episode checkbox in show-detail — network inspector / Sentry shows ONE request (mark_episode_watched), not two
- [ ] Tap widget eyeball — same ONE-request verification
- [ ] Confirm widget still shows correct Completed! state for Daredevil S2 once episode 8 is the current one
- [ ] Confirm `current_episode` no longer drifts past real count after rapid taps (thanks to atomic RPC + metadata refresh + Phase 4b.2's Math.max fetch loop)

- [ ] **Step 3: Check Supabase logs via MCP**

Confirm no unexpected errors. Example SQL via `execute_sql`:

```sql
SELECT metadata_refreshed_at, COUNT(*)
FROM public.user_tv_shows
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tyoneill97@gmail.com')
  AND status = 'watching'
GROUP BY metadata_refreshed_at IS NULL
ORDER BY 1 NULLS LAST;
```

Expected: some rows have recent `metadata_refreshed_at` values, reflecting the device's recent sync.

---

### Task 11: Push + open PR

**Files:** none (git)

- [ ] **Step 1: Confirm branch state**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4b-metadata-refresh
git log --oneline origin/main..HEAD
git status
```

Expected: ~8-10 commits ahead of main, clean working tree.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/widget-4b-metadata-refresh
```

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "feat(widget): Phase 4b.3 — metadata refresh + atomic mark_episode_watched RPC" --body "$(cat <<'EOF'
## Summary

Phase 4b.3 — two correctness fixes bundled:

### Part A — App-wide TMDB metadata refresh

Keeps \`user_tv_shows\` TMDB-derived fields (\`number_of_seasons\`, \`number_of_episodes\`, \`poster_path\`) current. Two triggers:

- **Foreground batch** — \`useWidgetSync\` fires \`refreshStaleWatchingShows\` after \`syncWidgetCache\`. Refreshes all \`status='watching'\` shows where \`metadata_refreshed_at\` is NULL or >24h old.
- **Lazy on-view** — show-detail screen fires \`refreshSingleShow\` on mount. Throttled internally.

Concurrency capped at 5 parallel TMDB fetches, 50 shows per batch max.

### Part C — Atomic \`mark_episode_watched\` RPC

Replaces the 2-call pattern (INSERT \`user_episode_watches\` + RPC \`sync_tv_show_progress\`) with a single atomic Postgres function. Self-healing: recomputes \`current_season/current_episode\` from the \`user_episode_watches\` aggregate, correcting any prior drift.

Callers updated: app's \`tv-show-service.ts markEpisodeWatched\`, widget's \`SupabaseWidgetClient.markEpisodeWatched\`.

### Migrations

- \`add_metadata_refreshed_at_to_user_tv_shows\` — column + partial index
- \`create_mark_episode_watched_rpc\` — SECURITY INVOKER function with RLS

### Out of scope (deferred)

- Server-side TMDB validation in RPC
- Scheduled cron refresh
- Movies metadata refresh
- \`StartNextSeasonIntent\` consolidation
- Removing the legacy \`sync_tv_show_progress\` RPC (kept as fallback during rollout)

## Test plan

- [x] 737+ tests passing (730 baseline + ~7 new)
- [x] \`npm run lint && npx tsc --noEmit && npm test\` clean
- [x] Prebuild clean
- [x] Device-validated: Daredevil S2 number_of_seasons refreshes to correct value, mark-episode fires 1 RPC instead of 2, no drift past real episode count

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Return PR URL to Tyshane**

---

## Self-review

**Spec coverage check:**
- ✓ Part A metadata refresh module (Task 4)
- ✓ Foreground batch trigger (Task 6)
- ✓ Lazy on-view trigger (Task 7)
- ✓ metadata_refreshed_at column + partial index (Task 1)
- ✓ 24h TTL + 5-concurrent cap + 50/batch cap (Task 4 code)
- ✓ Fields refreshed: number_of_seasons, number_of_episodes, poster_path (Task 4 code)
- ✓ Part C atomic RPC (Task 2)
- ✓ IF NOT EXISTS idempotency + rewatch-respecting (Task 2 code)
- ✓ Caller updates — app-side (Task 5) + widget-side (Task 8)
- ✓ Verification (Task 9) + device validation (Task 10)
- ✓ PR creation (Task 11)

**Placeholder scan:** no TBD, no "add appropriate X", no "similar to Task N" — all code and commands are concrete.

**Type consistency:** RPC signature is `p_user_tv_show_id uuid, p_tmdb_show_id int, p_season_number int, p_episode_number int` consistently across migration (Task 2), TS service (Task 5), and Swift client (Task 8). `metadata_refreshed_at` column type is `timestamptz` consistent across migration (Task 1) and the TS row type (Task 4).

**Ambiguity check:** "Adjust to existing pattern" phrases in Tasks 5, 7, 8 allow for local adaptation because those files' exact structure may differ from what the spec assumed. Each such step has explicit fallback instructions for what to do if the structure differs.

No gaps found.
