# Widget Phase 4c — `flipped` Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale-cache-reading heuristic in `useEpisodeActions` with an authoritative `flipped` signal returned from the `mark_episode_watched` RPC. Closes the Phase 4b.4 known limitation: missed "Series complete!" toast when cache is stale, and redundant `changeStatus('watched')` DB write when RPC already auto-flipped.

**Architecture:** Change `mark_episode_watched` RPC return type from `void` to `jsonb` and return `{ flipped: boolean }`. The `flipped` flag is `true` only when the transitioning UPDATE fires (via a `status <> 'watched'` WHERE clause + `FOUND` guard — so idempotent re-marks never spuriously re-fire the signal). `lib/tv-show-service.ts markEpisodeWatched` returns `{ watch, flipped }`. The hook's `onSuccess` branches on `flipped`: `true` fires the toast directly and skips the client-side auto-promote; `false` falls through to the existing count-based legacy path (Returning Series guard preserved).

**Tech Stack:** Supabase Postgres (migration via MCP), TypeScript (service + hook + types), Jest.

**Spec reference:** `docs/superpowers/specs/2026-04-20-widget-phase-4c-stale-cache-hook-design.md`
**Branch:** `feature/widget-4c-flipped-signal`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-flipped`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File inventory

**DB (via Supabase MCP):**
- `update_mark_episode_watched_return_flipped_signal` — DROP + CREATE OR REPLACE with jsonb return + FOUND guard

**RN modify:**
- `lib/database.types.ts` — hand-edit `Functions.mark_episode_watched.Returns` from `undefined` to `Json`
- `lib/tv-show-service.ts` — `markEpisodeWatched` return type changes to `{ watch: UserEpisodeWatch; flipped: boolean }`
- `hooks/use-episode-actions.ts` — `markWatchedMutation.onSuccess` branches on `data.flipped`

**RN tests:**
- `__tests__/lib/tv-show-service.test.ts` — update 6 existing `markEpisodeWatched` tests to destructure `{ watch }` from the return, add 3 new tests for `flipped` propagation
- `__tests__/hooks/use-episode-actions.test.ts` — add 3 new tests for flipped branching, update existing mock helper for the new return shape

---

### Task 1: Apply migration (RPC returns `jsonb` + FOUND guard)

**Files (via Supabase MCP):**
- Migration name: `update_mark_episode_watched_return_flipped_signal`
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Apply migration**

Call Supabase MCP `mcp__plugin_supabase_supabase__apply_migration` with `project_id: wliblwulvsrfgqcnbzeh`, `name: update_mark_episode_watched_return_flipped_signal`, and:

```sql
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

  -- Idempotent insert
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

  -- Recompute current_season/current_episode
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

  -- Auto-flip branch (FOUND guard ensures flipped=true only on the transitioning mark)
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

- [ ] **Step 2: Verify the new return type via MCP `execute_sql`**

```sql
SELECT proname,
       pg_get_function_result(oid) AS return_type,
       pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'mark_episode_watched' AND pronamespace = 'public'::regnamespace;
```

Expected: 1 row. `return_type = 'jsonb'`, args unchanged.

- [ ] **Step 3: Smoke test with an intentional Unauthenticated dry-call**

```sql
SELECT public.mark_episode_watched(gen_random_uuid(), 0, 0, 0, 0);
```

Expected: `42501 Unauthenticated` error. Confirms the 5-arg jsonb signature is callable + auth guard fires.

- [ ] **Step 4: Hand-edit `lib/database.types.ts`**

**DO NOT** run `npx supabase gen types` — it strips custom type aliases (known project issue). Hand-edit only.

Find the `mark_episode_watched` entry in `Database['public']['Functions']` (search for `mark_episode_watched:` — should be around line 2142). Current state:

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

Replace `Returns: undefined` with `Returns: Json`:

```ts
      mark_episode_watched: {
        Args: {
          p_episode_number: number
          p_season_number: number
          p_tmdb_show_id: number
          p_total_episodes_in_season: number
          p_user_tv_show_id: string
        }
        Returns: Json
      }
```

`Json` is already used elsewhere in the file (it's a standard Supabase-generated type alias). Verify via grep: `grep -n "^export type Json" lib/database.types.ts` should show the alias exists.

- [ ] **Step 5: Verify tsc stays green**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-flipped
npx tsc --noEmit
```

Expected: 0 errors. The existing `markEpisodeWatched` in `lib/tv-show-service.ts` only uses `error` from the RPC response (not `data`), so the return-type change is transparent at this stage.

- [ ] **Step 6: Commit**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): mark_episode_watched RPC returns { flipped: boolean }

Changes the RPC return type from void to jsonb. Returns
jsonb_build_object('flipped', v_flipped) where v_flipped is
true only on the transitioning mark (via AND status <> 'watched'
in the WHERE + IF FOUND guard). Idempotent re-marks of an
already-watched final episode return { flipped: false } — the
hook can use this to fire the "Series complete!" toast exactly
once.

TS callers don't yet consume the new return value; Task 2 wires
the service function + hook to read it.

Migration applied to project wliblwulvsrfgqcnbzeh via MCP.

Part of Phase 4c stale-cache hook fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire `markEpisodeWatched` service to return `{ watch, flipped }` (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` (`markEpisodeWatched`)
- Test: `__tests__/lib/tv-show-service.test.ts` (update 6 existing `markEpisodeWatched` tests + add 3 new)

- [ ] **Step 1: Write failing tests for the new return shape**

Open `__tests__/lib/tv-show-service.test.ts`. Find the `describe('markEpisodeWatched', ...)` block (around line 700). Update all 6 existing tests so they destructure the new shape. Replace the entire describe block with:

```ts
describe('markEpisodeWatched', () => {
  const episode = makeTMDBEpisode();
  const TOTAL_IN_SEASON = 10;

  it('calls mark_episode_watched RPC with correct params including p_total_episodes_in_season', async () => {
    mockRpc.mockResolvedValue({ data: { flipped: false }, error: null });

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
    mockRpc.mockResolvedValue({ data: { flipped: false }, error: null });

    await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, 0);

    expect(mockRpc).toHaveBeenCalledWith('mark_episode_watched', expect.objectContaining({
      p_total_episodes_in_season: 0,
    }));
  });

  it('does NOT use the 2-call pattern (no INSERT + sync_tv_show_progress)', async () => {
    mockRpc.mockResolvedValue({ data: { flipped: false }, error: null });

    await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(mockFrom).not.toHaveBeenCalledWith('user_episode_watches');
    expect(mockRpc).not.toHaveBeenCalledWith('sync_tv_show_progress', expect.anything());
  });

  it('returns { watch, flipped } — watch is a UserEpisodeWatch built from input params, flipped is false by default', async () => {
    mockRpc.mockResolvedValue({ data: { flipped: false }, error: null });

    const result = await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(result.flipped).toBe(false);
    expect(result.watch).toMatchObject({
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

  it('returns flipped: true when RPC response contains { flipped: true }', async () => {
    mockRpc.mockResolvedValue({ data: { flipped: true }, error: null });

    const result = await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(result.flipped).toBe(true);
  });

  it('returns flipped: false when RPC response is null (defensive default)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode, TOTAL_IN_SEASON);

    expect(result.flipped).toBe(false);
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

  it('throws "Episode has not aired yet" when episode.air_date is in the future', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const unairedEpisode = makeTMDBEpisode({ air_date: tomorrow });

    await expect(
      markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, unairedEpisode, TOTAL_IN_SEASON)
    ).rejects.toThrow('Episode has not aired yet');

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('throws "Episode has not aired yet" when episode.air_date is null (TBA episode)', async () => {
    const unairedEpisode = makeTMDBEpisode({ air_date: null });

    await expect(
      markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, unairedEpisode, TOTAL_IN_SEASON)
    ).rejects.toThrow('Episode has not aired yet');

    expect(mockRpc).not.toHaveBeenCalled();
  });
});
```

Note: this preserves the 8 existing tests from prior phases (the air_date guard tests from PR #390, the pass-0 fallback test from 4b.4, etc.) and adds 2 new ones explicitly for flipped propagation (`returns flipped: true when...` and `returns flipped: false when RPC response is null...`). The "returns a UserEpisodeWatch" test was reworked into `returns { watch, flipped }` checking both properties.

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-flipped
npx jest __tests__/lib/tv-show-service.test.ts -t 'markEpisodeWatched'
```

Expected: most tests FAIL because the current function returns `UserEpisodeWatch` directly, not `{ watch, flipped }`. Tests asserting `result.flipped` or `result.watch` will fail.

- [ ] **Step 3: Update `markEpisodeWatched` function**

In `lib/tv-show-service.ts`, find `markEpisodeWatched` (around line 323). Replace the entire function with:

```ts
// Mark an episode as watched
export async function markEpisodeWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episode: TMDBEpisode,
  totalEpisodesInSeason: number
): Promise<{ watch: UserEpisodeWatch; flipped: boolean }> {
  // Guard: reject unaired episodes (null air_date treated as unaired).
  // Defence-in-depth — the show-detail UI disables unaired rows so this
  // path is only hit by programmatic callers (widget, future Shortcuts).
  const today = new Date().toISOString().slice(0, 10);
  if (episode.air_date == null || episode.air_date > today) {
    throw new Error('Episode has not aired yet');
  }

  const { data, error } = await supabase.rpc('mark_episode_watched', {
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

  // Extract flipped from the RPC jsonb return. Defensive fallback: null
  // response (e.g., legacy void-returning migration not yet applied in
  // some environment) → flipped: false.
  const flipped = (data as { flipped?: boolean } | null)?.flipped === true;

  // Construct the watch record from known params to preserve the return shape
  // for callers. The atomic RPC handles the DB write; we don't need to re-fetch.
  const now = new Date().toISOString();
  const watch: UserEpisodeWatch = {
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

  return { watch, flipped };
}
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'markEpisodeWatched'
```

Expected: all 10 `markEpisodeWatched` tests pass.

- [ ] **Step 5: Run full tv-show-service test file**

```bash
npx jest __tests__/lib/tv-show-service.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run tsc — expect errors in hook caller**

```bash
npx tsc --noEmit
```

Expected: one or more errors in `hooks/use-episode-actions.ts` because the hook's `onSuccess` and/or the returned `markWatched` type now receives `{ watch, flipped }` where it previously received `UserEpisodeWatch`. This is expected — Task 3 fixes it.

If tsc reports errors OUTSIDE `hooks/use-episode-actions.ts`, STOP and report BLOCKED.

- [ ] **Step 7: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): tv-show-service markEpisodeWatched returns { watch, flipped }

Extracts the `flipped` flag from the RPC's new jsonb return
(Task 1 migration) and surfaces it to callers as part of the
service function's return shape. Defensive null-handling: if
the RPC response is unexpectedly null, flipped defaults to
false — the legacy count-based hook path will still handle
completion detection.

Hook call site breaks at this commit; Task 3 updates it.

Part of Phase 4c stale-cache hook fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Branch `markWatchedMutation.onSuccess` on `data.flipped` (TDD)

**Files:**
- Modify: `hooks/use-episode-actions.ts` (`markWatchedMutation.onSuccess`)
- Test: `__tests__/hooks/use-episode-actions.test.ts` (update the existing mock shape for `markEpisodeWatched`, add 3 new tests)

- [ ] **Step 1: Inspect existing hook test setup**

Open `__tests__/hooks/use-episode-actions.test.ts`. The mock for `markEpisodeWatched` currently returns a bare `UserEpisodeWatch` via something like `mockMarkEpisodeWatched.mockResolvedValue(makeEpisodeWatch({...}))`. After Task 2, the service function returns `{ watch, flipped }` — update the helper.

Find the test file's mock setup and locate the helper (there should be a `makeEpisodeWatch` factory and somewhere `mockMarkEpisodeWatched.mockResolvedValue(...)` is called). In the existing tests, update all calls that mock `markEpisodeWatched`'s resolved value to return the new shape:

```ts
mockMarkEpisodeWatched.mockResolvedValue({
  watch: makeEpisodeWatch({...}),
  flipped: false,
});
```

The existing tests were asserting on a bare `UserEpisodeWatch`; with this change they receive `{ watch, flipped }`. Any test that reads the mutation's return value needs to be updated to destructure.

**Important:** the Phase 4c tactical PR #390 added Returning Series guard tests to this file. Those mock `mockMarkEpisodeWatched` — update their resolved value too.

- [ ] **Step 2: Write failing tests for flipped-branching**

Add this describe block at the end of the `describe('useEpisodeActions', ...)` outer block:

```ts
  describe('markWatched — flipped signal from RPC', () => {
    function makeUserTvShow(overrides: Partial<UserTvShow> = {}): UserTvShow {
      return {
        id: USER_TV_SHOW_ID,
        user_id: USER_ID,
        tmdb_id: TMDB_SHOW_ID,
        status: 'watching',
        name: 'Warrior Nun',
        number_of_episodes: 20,
        episodes_watched: 19,
        backdrop_path: null,
        poster_path: null,
        number_of_seasons: 2,
        vote_average: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        last_watched_at: null,
        tmdb_status: 'Ended',
        ...overrides,
      } as UserTvShow;
    }

    it('fires "Series complete!" toast and skips onAllWatched when RPC returns flipped=true', async () => {
      const episode = makeEpisode({ episode_number: 10, air_date: '2024-12-01' });
      mockMarkEpisodeWatched.mockResolvedValue({
        watch: makeEpisodeWatch({ episode_number: 10 }),
        flipped: true,
      });
      const onAllWatched = jest.fn();

      const { queryClient, wrapper } = createTestHarness();
      queryClient.setQueryData(
        ['userTvShow', USER_ID, TMDB_SHOW_ID],
        makeUserTvShow({ status: 'watching' }),
      );

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER, { onAllWatched }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.markWatched(episode, 10);
      });

      // Toast fires because RPC authoritatively reported the flip
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({
        type: 'success',
        text1: expect.stringContaining('Series complete'),
      }));
      // onAllWatched NOT called — RPC already promoted status='watched'
      expect(onAllWatched).not.toHaveBeenCalled();
    });

    it('falls through to legacy count-based path when flipped=false and threshold met (Ended show)', async () => {
      const episode = makeEpisode({ episode_number: 20, air_date: '2024-12-01' });
      mockMarkEpisodeWatched.mockResolvedValue({
        watch: makeEpisodeWatch({ episode_number: 20 }),
        flipped: false,
      });
      const onAllWatched = jest.fn();

      const { queryClient, wrapper } = createTestHarness();
      queryClient.setQueryData(
        ['userTvShow', USER_ID, TMDB_SHOW_ID],
        makeUserTvShow({ tmdb_status: 'Ended', episodes_watched: 19, number_of_episodes: 20 }),
      );

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER, { onAllWatched }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.markWatched(episode, 20);
      });

      // Legacy path fires toast + onAllWatched
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({
        text1: expect.stringContaining('Series complete'),
      }));
      expect(onAllWatched).toHaveBeenCalled();
    });

    it('does NOT fire toast when flipped=false AND tmdb_status is Returning Series (regression guard from PR #390)', async () => {
      const episode = makeEpisode({ episode_number: 10, air_date: '2024-12-01' });
      mockMarkEpisodeWatched.mockResolvedValue({
        watch: makeEpisodeWatch({ episode_number: 10 }),
        flipped: false,
      });
      const onAllWatched = jest.fn();

      const { queryClient, wrapper } = createTestHarness();
      queryClient.setQueryData(
        ['userTvShow', USER_ID, TMDB_SHOW_ID],
        makeUserTvShow({ tmdb_status: 'Returning Series', episodes_watched: 9, number_of_episodes: 10 }),
      );

      const { result } = renderHook(
        () => useEpisodeActions(USER_TV_SHOW_ID, TMDB_SHOW_ID, SEASON_NUMBER, { onAllWatched }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.markWatched(episode, 10);
      });

      expect(Toast.show).not.toHaveBeenCalled();
      expect(onAllWatched).not.toHaveBeenCalled();
    });
  });
```

**Important:** the exact names `createTestHarness`, `makeEpisode`, `makeEpisodeWatch`, `USER_ID`, `TMDB_SHOW_ID`, `USER_TV_SHOW_ID`, `SEASON_NUMBER` need to match existing helpers in this file. If any name differs, adapt to match the existing convention — run `grep -n "function create\|const USER_" __tests__/hooks/use-episode-actions.test.ts` to check.

- [ ] **Step 3: Run new tests to verify FAIL**

```bash
npx jest __tests__/hooks/use-episode-actions.test.ts -t 'flipped signal from RPC'
```

Expected: all 3 new tests FAIL (current onSuccess ignores the data argument).

- [ ] **Step 4: Update `markWatchedMutation.onSuccess` in `hooks/use-episode-actions.ts`**

Find `markWatchedMutation` (around line 59). Replace the entire mutation with:

```ts
  const markWatchedMutation = useMutation({
    mutationFn: async ({ episode, totalEpisodesInSeason }: { episode: TMDBEpisode; totalEpisodesInSeason: number }) => {
      if (!user) throw new Error('Not authenticated');
      return markEpisodeWatched(user.id, userTvShowId, tmdbShowId, episode, totalEpisodesInSeason);
    },
    onSuccess: (data) => {
      invalidateRelated();

      // Authoritative signal from the RPC: if the auto-flip branch fired,
      // the DB has already been updated to status='watched'. Fire the toast
      // and skip the client-side auto-promote.
      if (data.flipped) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        Toast.show({
          type: 'success',
          text1: '🎉 Series complete!',
          text2: cachedShow ? `${cachedShow.name} has been marked as Watched.` : 'Show has been marked as Watched.',
          visibilityTime: 4000,
        });
        return;
      }

      // Legacy path: RPC did not auto-flip (show has no tmdb_status, or
      // is Returning Series, or count didn't hit threshold). Fall back to
      // the client-side count heuristic, with the existing Returning Series
      // guard from PR #390.
      if (options?.onAllWatched) {
        const cachedShow = queryClient.getQueryData<UserTvShow | null>(['userTvShow', user?.id, tmdbShowId]);
        if (cachedShow && cachedShow.status !== 'watched' && cachedShow.tmdb_status !== 'Returning Series') {
          const total = cachedShow.number_of_episodes ?? 0;
          const watched = cachedShow.episodes_watched ?? 0;
          if (total > 0 && watched + 1 >= total) {
            Toast.show({ type: 'success', text1: '🎉 Series complete!', text2: `${cachedShow.name} has been marked as Watched.`, visibilityTime: 4000 });
            options.onAllWatched();
          }
        }
      }
    },
  });
```

- [ ] **Step 5: Run new tests to verify PASS**

```bash
npx jest __tests__/hooks/use-episode-actions.test.ts -t 'flipped signal from RPC'
```

Expected: all 3 new tests pass.

- [ ] **Step 6: Run full hook test file**

```bash
npx jest __tests__/hooks/use-episode-actions.test.ts
```

Expected: all tests pass. Existing tests from PR #390 (Returning Series guard) should still pass — the new logic preserves their assertions via the legacy-path branch.

If existing tests break because `mockMarkEpisodeWatched.mockResolvedValue(...)` returned the old shape (bare `UserEpisodeWatch`), update them to the new shape per Step 1 guidance.

- [ ] **Step 7: Run tsc + full test suite**

```bash
npx tsc --noEmit
npm test
```

Expected: 0 tsc errors, all tests pass (should be 760 — was 757 pre-Task-3; +3 new flipped-signal tests).

- [ ] **Step 8: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add hooks/use-episode-actions.ts __tests__/hooks/use-episode-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): hook onSuccess branches on RPC's flipped signal

markWatchedMutation.onSuccess now reads data.flipped from the
RPC's authoritative response. flipped=true → fire "Series
complete!" toast directly, skip options.onAllWatched() to avoid
a redundant changeStatus('watched') DB write. flipped=false →
legacy count-based path with the Returning Series guard from
PR #390 intact.

Closes the known limitation from PR #389 (stale cache could
miss the toast or double-write the promote on Ended/Canceled
shows).

Part of Phase 4c stale-cache hook fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verification + PR

- [ ] **Step 1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-flipped
npm run lint && npx tsc --noEmit && npm test
```

Expected: 0 lint errors, 0 tsc errors, all tests pass.

- [ ] **Step 2: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-04-20-widget-phase-4c-flipped-signal.md
git commit -m "$(cat <<'EOF'
chore(widget): add Phase 4c flipped-signal implementation plan

Plan decomposing the stale-cache hook fix spec into 3 TDD tasks
plus verification.

Part of Phase 4c stale-cache hook fix.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/widget-4c-flipped-signal

gh pr create --title "feat(tv): Phase 4c — RPC returns flipped signal, hook skips stale-cache heuristic" --body "$(cat <<'EOF'
## Summary

- \`mark_episode_watched\` RPC return type changes from \`void\` to \`jsonb\`; returns \`{ flipped: boolean }\`
- \`lib/tv-show-service.ts markEpisodeWatched\` return changes to \`{ watch, flipped }\`
- \`hooks/use-episode-actions.ts markWatchedMutation.onSuccess\` branches on \`data.flipped\`: \`true\` fires the \"Series complete!\" toast directly (skips client-side auto-promote); \`false\` falls through to the existing count-based legacy path (Returning Series guard from #390 preserved)
- Idempotent re-marks of an already-watched final episode return \`{ flipped: false }\` via \`AND status <> 'watched'\` WHERE clause + \`IF FOUND\` guard — no spam toasts

## Why

Closes the known limitation flagged in [PR #389](https://github.com/TyShaneONeill/movie-tracker/pull/389) body: the hook read React Query cache after \`invalidateRelated()\` (which marks stale but doesn't await a refetch), so post-RPC-auto-flip the cache still showed \`status='watching'\`. Consequences: possible missed \"Series complete!\" toast when \`episodes_watched\` was stale, and redundant \`changeStatus('watched')\` DB write when the RPC had already done it.

Spec: \`docs/superpowers/specs/2026-04-20-widget-phase-4c-stale-cache-hook-design.md\`.

## Test plan

- [x] \`npm run lint && npx tsc --noEmit && npm test\` — all green (760 tests)
- [ ] Device: Mark the final episode of an Ended show (e.g., Warrior Nun) → \"Series complete!\" toast fires exactly once, status flips to watched
- [ ] Device: Re-mark the same episode → no toast re-fire, no double-promote
- [ ] Device: Mark any episode of a Returning Series (e.g., a live show mid-season) → no toast (Phase 4c tactical #390 guard intact)
- [ ] Device: Mark a mid-season episode where \`episodes_watched\` in cache is stale (e.g., widget marked one while app was on another screen) → no false toast

## Migration footprint

Applied via Supabase MCP (no local migration file — CineTrak convention):
- \`update_mark_episode_watched_return_flipped_signal\` — DROP old 5-arg void-returning + CREATE OR REPLACE 5-arg jsonb-returning with FOUND guard

Rollback: revert PR + re-apply the Phase 4b.4 void-returning migration + hand-edit types Returns back to undefined.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Record the PR URL.

- [ ] **Step 4: Wait for CI**

Monitor via \`gh pr checks <PR_NUMBER> --watch\`. Address any CI failures before requesting review.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Migration with FOUND guard (Task 1)
- ✅ Types hand-edit (Task 1)
- ✅ Service function return-shape change + tests (Task 2)
- ✅ Hook onSuccess branching + tests (Task 3)
- ✅ Device validation + PR body (Task 4)
- ✅ Non-goals explicitly noted (bulk paths, Swift caller, optimistic updates)

**Placeholder scan:** none found.

**Type consistency:**
- `{ watch: UserEpisodeWatch; flipped: boolean }` used consistently across service function + test mocks + hook's `onSuccess(data)`
- `data.flipped` referenced consistently in Task 3 tests + impl

**Test count projection:** baseline 757 → +3 new (Task 3) = 760. Task 2 reshaped existing tests but didn't add net count to the file (it restructured 1 existing test into 1 about the new shape + added 2 new flipped-propagation tests, so net +2 on tv-show-service file, but overall file was already at 757 with the 8 pre-existing markEpisodeWatched tests).

Actually recounting: Task 2 tv-show-service tests — old count was 8 markEpisodeWatched tests; new count is 10 (2 new flipped-propagation tests). Task 3 hook tests — +3 new. Total: 757 + 2 + 3 = 762 final.

**Rollback:** documented in spec + PR body.
