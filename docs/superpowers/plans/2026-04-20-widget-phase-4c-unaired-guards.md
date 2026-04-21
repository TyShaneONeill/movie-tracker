# Widget Phase 4c (tactical) — Unaired-Episode Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject or silently skip attempts to mark unaired TV episodes as watched — closing the data-integrity gap Tyshane hit on Daredevil: Born Again S2 (2026-04-20) where bulk-mark recorded 6 future episodes as "watched."

**Architecture:** Client-side filter in `lib/tv-show-service.ts` at three call sites (`markSeasonWatched`, `batchMarkEpisodesWatched`, `markEpisodeWatched`) — reject episodes whose `air_date > today`. UI polish in `app/tv/[id]/index.tsx` adjusts the "Mark All Watched" button copy + disables unaired rows visually. No DB changes, no migration. Widget-side protection (next-episode-air_date in payload) deferred to Phase 4c catalog work — the app-side filter addresses the actual bug reported.

**Tech Stack:** TypeScript, Jest, React Native (show-detail UI).

**Spec reference:** [[Projects/CineTrak/Features/Fix - Unaired Episode Guards]] in the Obsidian vault (parent: [[Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards]])
**Branch:** `feature/widget-4c-unaired-guards`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-unaired`

---

## Scope

### In scope
1. `markSeasonWatched` — filter out episodes with `air_date > today` before insert. No error thrown — "Mark All" should proceed with the aired subset.
2. `batchMarkEpisodesWatched` — same filter.
3. `markEpisodeWatched` — single-episode path throws `Error('Episode has not aired yet')` when `air_date > today`. The UI never calls this for unaired episodes once Task 4 lands, so this is a defence-in-depth guard for regression.
4. `app/tv/[id]/index.tsx` — "Mark All Watched" becomes "Mark All Aired Watched" when the season has unaired episodes. Unaired episode rows render at 0.4 opacity, non-pressable, with an "Airs {date}" subtitle under the episode name.

### Out of scope (deferred to Phase 4c catalog)
- New `tv_show_episodes` catalog table
- Widget payload extension with `next_episode_air_date`
- Widget button disable for unaired
- Server-side RPC validation of `air_date`
- Cleanup of any already-inserted bogus rows (Tyshane can unmark Daredevil S2 manually via the UI)
- Fix for the stale-cache hook from 4b.4

---

## Design decisions

| Decision | Value | Rationale |
|--|--|--|
| Button copy when any unaired | "Mark All Aired Watched" | Specific + describes behavior |
| Episode air_date comparison | `air_date <= today` (UTC date string) | TMDB stores `air_date` as `YYYY-MM-DD`; string comparison works for sortable date format |
| Single-episode unaired behavior | Throws + toast at UI layer | Explicit, loud; distinguishes from "already watched" silent no-op |
| Null `air_date` (TBA episodes) | Treat as unaired (filter out) | TBA episodes cannot have legitimately aired |
| Today's date source | `new Date().toISOString().slice(0, 10)` | No timezone gymnastics needed — TMDB uses date-only field |

---

## File inventory

**Modify:**
- `lib/tv-show-service.ts` — `markSeasonWatched`, `batchMarkEpisodesWatched`, `markEpisodeWatched`
- `app/tv/[id]/index.tsx` — `SeasonAccordionItem` button text + unaired row styling

**Test:**
- `__tests__/lib/tv-show-service.test.ts` — 5 new tests (2 per bulk function + 1 for single-episode)

---

### Task 1: Add air_date filter to `markSeasonWatched` (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` (`markSeasonWatched` around line 390)
- Test: `__tests__/lib/tv-show-service.test.ts` (add 2 tests to existing `markSeasonWatched` describe block)

- [ ] **Step 1: Inspect existing markSeasonWatched tests to confirm fixtures + mock shape**

Open `__tests__/lib/tv-show-service.test.ts` and find the `describe('markSeasonWatched', ...)` block. Note:
- Fixture `makeTMDBEpisode()` at line 107 returns `air_date: '2008-01-20'` by default — safely past, so existing tests won't break when the filter lands. The new tests below explicitly override `air_date` for the unaired cases.
- Existing test pattern for supabase mock chain (`setupQueryChain` helper already exists in the file).

- [ ] **Step 2: Write the failing tests**

Add these two tests at the end of the existing `describe('markSeasonWatched', ...)` block (do not replace existing tests):

```ts
  it('filters out episodes with future air_date before inserting', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const airedEp = makeTMDBEpisode({ episode_number: 1, air_date: yesterday });
    const todayEp = makeTMDBEpisode({ episode_number: 2, air_date: today });
    const unairedEp = makeTMDBEpisode({ episode_number: 3, air_date: tomorrow });

    // existing-watches query returns empty
    const selectChain = setupQueryChain({ data: [], error: null });
    const insertChain = { insert: jest.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValue(insertChain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markSeasonWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, [airedEp, todayEp, unairedEp]);

    // Only 2 aired episodes should be inserted (the future one is filtered)
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ episode_number: 1 }),
        expect.objectContaining({ episode_number: 2 }),
      ])
    );
    const inserted = insertChain.insert.mock.calls[0]?.[0] as Array<{ episode_number: number }>;
    expect(inserted).toHaveLength(2);
    expect(inserted.some((e) => e.episode_number === 3)).toBe(false);
  });

  it('skips insert entirely and calls sync when ALL episodes are unaired', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const episodes = [
      makeTMDBEpisode({ episode_number: 1, air_date: tomorrow }),
      makeTMDBEpisode({ episode_number: 2, air_date: tomorrow }),
    ];

    const selectChain = setupQueryChain({ data: [], error: null });
    const insertChain = { insert: jest.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValue(insertChain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await markSeasonWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episodes);

    expect(insertChain.insert).not.toHaveBeenCalled();
    // sync_tv_show_progress should still fire so any downstream state recalculates
    expect(mockRpc).toHaveBeenCalledWith('sync_tv_show_progress', { p_user_tv_show_id: USER_TV_SHOW_ID });
  });
```

Note: `makeTMDBEpisode` is defined in the test file — verify what it produces for `air_date` by default. If default is `null`, the tests above need `{ air_date: yesterday }` explicitly even for "aired" cases. Adjust if needed.

- [ ] **Step 3: Run the new tests to verify they FAIL**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-unaired
npx jest __tests__/lib/tv-show-service.test.ts -t 'markSeasonWatched'
```

Expected: both new tests FAIL (first test inserts 3 episodes; second test inserts all 2 + doesn't skip).

- [ ] **Step 4: Implement the filter in `markSeasonWatched`**

In `lib/tv-show-service.ts`, find `markSeasonWatched` (line ~390). Add the air_date filter BEFORE the existing already-watched filter. Replace:

```ts
export async function markSeasonWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episodes: TMDBEpisode[]
): Promise<void> {
  // Pre-filter: skip episodes already recorded as watch_number=1 to avoid
  // conflict errors with the partial unique index (PostgREST cannot express
  // ON CONFLICT ... WHERE watch_number=1 through the upsert API).
  const { data: existing } = await supabase
    .from('user_episode_watches')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('watch_number', 1);
```

with:

```ts
export async function markSeasonWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episodes: TMDBEpisode[]
): Promise<void> {
  // Filter unaired episodes: TMDB `air_date` is YYYY-MM-DD. Null air_date means
  // TBA — also filtered out. String comparison works because the format is sortable.
  const today = new Date().toISOString().slice(0, 10);
  const airedEpisodes = episodes.filter(
    (ep) => ep.air_date != null && ep.air_date <= today
  );

  // Pre-filter: skip episodes already recorded as watch_number=1 to avoid
  // conflict errors with the partial unique index (PostgREST cannot express
  // ON CONFLICT ... WHERE watch_number=1 through the upsert API).
  const { data: existing } = await supabase
    .from('user_episode_watches')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('watch_number', 1);
```

Then in the same function, replace the next-line filter:

```ts
  const toInsert = episodes.filter(
    (ep) => !watchedKeys.has(`${ep.season_number}:${ep.episode_number}`)
  );
```

with:

```ts
  const toInsert = airedEpisodes.filter(
    (ep) => !watchedKeys.has(`${ep.season_number}:${ep.episode_number}`)
  );
```

(Changed `episodes.filter` → `airedEpisodes.filter`.)

- [ ] **Step 5: Run the full `markSeasonWatched` test block to verify green**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'markSeasonWatched'
```

Expected: ALL tests in that describe block pass (old tests + 2 new).

Existing tests use `makeTMDBEpisode()` which defaults `air_date` to `'2008-01-20'` (past). The new filter should not cause regressions. If any test unexpectedly fails, check whether a pre-existing test explicitly sets `air_date: null` — if so, decide per test whether to update the fixture or accept that the test case semantically means "unaired, should be filtered."

- [ ] **Step 6: Run the full tv-show-service test file**

```bash
npx jest __tests__/lib/tv-show-service.test.ts
```

Expected: all tests pass. If `makeTMDBEpisode` default changed, there may be cascading effects on other tests — triage and adjust the shared fixture default if needed.

- [ ] **Step 7: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): filter unaired episodes from markSeasonWatched

Prevents future episodes from being bulk-marked as watched when
the user taps "Mark All Watched" on a season that contains some
unaired episodes. TMDB's air_date (YYYY-MM-DD) is compared to
today's UTC date; null air_date (TBA) is treated as unaired.

Fixes the Daredevil: Born Again S2 case where 6 unaired episodes
got recorded as watched during device validation of #389.

Part of Phase 4c tactical unaired-episode guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add air_date filter to `batchMarkEpisodesWatched` (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` (`batchMarkEpisodesWatched` around line 473)
- Test: `__tests__/lib/tv-show-service.test.ts` (extend existing batch describe block)

- [ ] **Step 1: Add import + create the `batchMarkEpisodesWatched` describe block**

`batchMarkEpisodesWatched` is NOT currently imported or tested in `__tests__/lib/tv-show-service.test.ts`. You need to:

(a) Add `batchMarkEpisodesWatched` to the import block at line 23. The existing imports include `markSeasonWatched` — add the new name alphabetically adjacent:

Before:
```ts
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
  getWatchedEpisodes,
} from '@/lib/tv-show-service';
```

After:
```ts
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
  batchMarkEpisodesWatched,
  getWatchedEpisodes,
} from '@/lib/tv-show-service';
```

(b) Create a new `describe('batchMarkEpisodesWatched', ...)` block in the test file. Place it AFTER the existing `markSeasonWatched` block and BEFORE the `getWatchedEpisodes` block. Include both failing tests:

```ts
  it('filters out episodes with future air_date before inserting', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const aired = makeTMDBEpisode({ season_number: 1, episode_number: 1, air_date: yesterday });
    const unaired = makeTMDBEpisode({ season_number: 2, episode_number: 1, air_date: tomorrow });

    const selectChain = setupQueryChain({ data: [], error: null });
    const insertChain = { insert: jest.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValue(insertChain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await batchMarkEpisodesWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, [aired, unaired]);

    const inserted = insertChain.insert.mock.calls[0]?.[0] as Array<{ season_number: number; episode_number: number }>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ season_number: 1, episode_number: 1 });
  });

  it('skips insert entirely and calls sync when ALL episodes are unaired', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const episodes = [
      makeTMDBEpisode({ season_number: 2, episode_number: 1, air_date: tomorrow }),
      makeTMDBEpisode({ season_number: 2, episode_number: 2, air_date: tomorrow }),
    ];

    const selectChain = setupQueryChain({ data: [], error: null });
    const insertChain = { insert: jest.fn().mockResolvedValue({ error: null }) };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValue(insertChain);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await batchMarkEpisodesWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episodes);

    expect(insertChain.insert).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('sync_tv_show_progress', { p_user_tv_show_id: USER_TV_SHOW_ID });
  });
```

Wrap both tests in the new describe block:

```ts
describe('batchMarkEpisodesWatched', () => {
  // [the two tests above]
});
```

- [ ] **Step 2: Run the tests to verify FAIL**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'batchMarkEpisodesWatched'
```

Expected: both new tests FAIL.

- [ ] **Step 3: Implement the filter**

In `lib/tv-show-service.ts`, find `batchMarkEpisodesWatched` (line ~473). Add the air_date filter BEFORE the existing early-return check. Replace:

```ts
export async function batchMarkEpisodesWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episodes: TMDBEpisode[]
): Promise<void> {
  if (episodes.length === 0) return;

  // Fetch existing first-watch records to exclude already-watched episodes
  const { data: existing } = await supabase
    .from('user_episode_watches')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('watch_number', 1);
```

with:

```ts
export async function batchMarkEpisodesWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episodes: TMDBEpisode[]
): Promise<void> {
  if (episodes.length === 0) return;

  // Filter unaired episodes (see markSeasonWatched for rationale).
  const today = new Date().toISOString().slice(0, 10);
  const airedEpisodes = episodes.filter(
    (ep) => ep.air_date != null && ep.air_date <= today
  );

  // Fetch existing first-watch records to exclude already-watched episodes
  const { data: existing } = await supabase
    .from('user_episode_watches')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('watch_number', 1);
```

Then replace the `toInsert` line:

```ts
  const toInsert = episodes.filter(
    (ep) => !watchedKeys.has(`${ep.season_number}:${ep.episode_number}`)
  );
```

with:

```ts
  const toInsert = airedEpisodes.filter(
    (ep) => !watchedKeys.has(`${ep.season_number}:${ep.episode_number}`)
  );
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'batchMarkEpisodesWatched'
```

Expected: all pass.

- [ ] **Step 5: Run full file + tsc**

```bash
npx jest __tests__/lib/tv-show-service.test.ts
npx tsc --noEmit
```

Both green.

- [ ] **Step 6: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): filter unaired episodes from batchMarkEpisodesWatched

Mirror of the markSeasonWatched filter — the batch path was
missing the same air_date guard. Used internally by flows that
cross season boundaries (e.g., a future "mark all up to season
N" control). Same YYYY-MM-DD comparison, same null-air_date
treated as unaired.

Part of Phase 4c tactical unaired-episode guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add air_date guard to `markEpisodeWatched` (TDD)

**Files:**
- Modify: `lib/tv-show-service.ts` (`markEpisodeWatched` around line 323)
- Test: `__tests__/lib/tv-show-service.test.ts` (add 1 test)

- [ ] **Step 1: Write the failing test**

Add this test at the end of the existing `describe('markEpisodeWatched', ...)` block:

```ts
  it('throws "Episode has not aired yet" when episode.air_date is in the future', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const unairedEpisode = makeTMDBEpisode({ air_date: tomorrow });

    await expect(
      markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, unairedEpisode, TOTAL_IN_SEASON)
    ).rejects.toThrow('Episode has not aired yet');

    // The RPC must NOT be called for unaired episodes
    expect(mockRpc).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify FAIL**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'Episode has not aired yet'
```

Expected: FAIL — current code calls RPC then throws from the RPC error, not from the air_date check.

- [ ] **Step 3: Add the guard**

In `lib/tv-show-service.ts`, find `markEpisodeWatched` (line ~323). Add the guard at the very top of the function, before the RPC call. Replace:

```ts
export async function markEpisodeWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episode: TMDBEpisode,
  totalEpisodesInSeason: number
): Promise<UserEpisodeWatch> {
  const { error } = await supabase.rpc('mark_episode_watched', {
```

with:

```ts
export async function markEpisodeWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episode: TMDBEpisode,
  totalEpisodesInSeason: number
): Promise<UserEpisodeWatch> {
  // Guard: reject unaired episodes (null air_date treated as unaired).
  // Defence-in-depth — the show-detail UI disables unaired rows so this
  // path is only hit by programmatic callers (widget, future Shortcuts).
  const today = new Date().toISOString().slice(0, 10);
  if (episode.air_date == null || episode.air_date > today) {
    throw new Error('Episode has not aired yet');
  }

  const { error } = await supabase.rpc('mark_episode_watched', {
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/tv-show-service.test.ts -t 'markEpisodeWatched'
```

Expected: all `markEpisodeWatched` tests pass (6 existing + 1 new = 7 total).

The `makeTMDBEpisode` fixture default is `'2008-01-20'` (past), so existing `markEpisodeWatched` tests should continue passing. The new test explicitly sets `tomorrow` to trigger the guard.

- [ ] **Step 5: Run full file + tsc**

```bash
npx jest __tests__/lib/tv-show-service.test.ts
npx tsc --noEmit
```

Both green.

- [ ] **Step 6: Commit**

```bash
git add lib/tv-show-service.ts __tests__/lib/tv-show-service.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): reject markEpisodeWatched when episode is unaired

Adds an early-throw guard for unaired episodes. Fires before
the RPC call so no wasted round-trip. Throws a specific message
("Episode has not aired yet") so UI toasts can distinguish this
from generic failures.

Defence-in-depth: the show-detail UI disables unaired rows so
this path is normally unreachable from the app UI. The widget's
MarkEpisodeWatchedIntent doesn't yet have air_date data in its
payload (deferred to the Phase 4c catalog work), but the silent-
failure pattern there means any error raises a breadcrumb without
surfacing to the user.

Part of Phase 4c tactical unaired-episode guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: UI polish in show-detail screen

**Files:**
- Modify: `app/tv/[id]/index.tsx` (`SeasonAccordionItem` around lines 174-216)

No new tests — the UI is declarative + already covered via integration in `__tests__/hooks/use-episode-actions.test.ts` behavior.

- [ ] **Step 1: Add unaired-episode computation to `SeasonAccordionItem`**

In `app/tv/[id]/index.tsx`, find `SeasonAccordionItem` (around line 100). Inside the component function, after the existing `useEpisodeActions` destructuring and before `isAllWatched` declaration (~line 133), add:

```ts
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isEpisodeAired = (episode: TMDBEpisode) =>
    episode.air_date != null && episode.air_date <= today;
  const airedEpisodes = useMemo(
    () => episodes.filter(isEpisodeAired),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [episodes, today]
  );
  const hasUnaired = airedEpisodes.length < episodes.length;
```

Ensure `useMemo` is imported at the top of the file (it likely already is — verify).

- [ ] **Step 2: Update the "Mark All" button**

Still in `SeasonAccordionItem`, find the button (around line 176). Replace:

```tsx
                <Pressable
                  onPress={() => isAllWatched ? unmarkAllWatched() : markAllWatched(episodes)}
                  disabled={isMarkingAllWatched || isUnmarkingAllWatched}
                  style={({ pressed }) => [
                    dynamicStyles.markAllButton,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {(isMarkingAllWatched || isUnmarkingAllWatched) ? (
                    <ActivityIndicator size="small" color={colors.tint} />
                  ) : (
                    <Text style={dynamicStyles.markAllText}>
                      {isAllWatched ? 'Unmark All Watched' : 'Mark All Watched'}
                    </Text>
                  )}
                </Pressable>
```

with:

```tsx
                <Pressable
                  onPress={() => isAllWatched ? unmarkAllWatched() : markAllWatched(airedEpisodes)}
                  disabled={isMarkingAllWatched || isUnmarkingAllWatched || airedEpisodes.length === 0}
                  style={({ pressed }) => [
                    dynamicStyles.markAllButton,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {(isMarkingAllWatched || isUnmarkingAllWatched) ? (
                    <ActivityIndicator size="small" color={colors.tint} />
                  ) : (
                    <Text style={dynamicStyles.markAllText}>
                      {isAllWatched
                        ? 'Unmark All Watched'
                        : hasUnaired
                          ? 'Mark All Aired Watched'
                          : 'Mark All Watched'}
                    </Text>
                  )}
                </Pressable>
```

Three changes: `markAllWatched(episodes)` → `markAllWatched(airedEpisodes)`, `disabled` adds the `airedEpisodes.length === 0` clause, button text has a three-way conditional.

**IMPORTANT:** Now update `allWatched(episodes.length)` at line 133 of the original file — since we filter to aired episodes, the "all watched" predicate should compare against `airedEpisodes.length`, not `episodes.length`. Replace:

```ts
  const isAllWatched = allWatched(episodes.length);
```

with:

```ts
  const isAllWatched = allWatched(airedEpisodes.length);
```

Otherwise a season with all aired-episodes watched would still show "Mark All Aired Watched" because the unaired episodes would drag the denominator up.

- [ ] **Step 3: Update the episode row to style unaired rows + show air date**

Still in `SeasonAccordionItem`, find the `episodes.map((episode) => ...)` block (around line 193). Replace:

```tsx
              {episodes.map((episode) => {
                const watched = isSaved && userTvShowId ? isEpisodeWatched(episode.episode_number) : false;
                return (
                  <Pressable
                    key={episode.id}
                    onPress={() => handleToggleEpisode(episode)}
                    disabled={!isSaved || !userTvShowId}
                    style={dynamicStyles.episodeRow}
                  >
                    <View style={[
                      dynamicStyles.episodeCheckbox,
                      watched && dynamicStyles.episodeCheckboxChecked,
                      (!isSaved || !userTvShowId) && { opacity: 0.3 },
                    ]}>
                      {watched && <Text style={dynamicStyles.checkmark}>{'\u2713'}</Text>}
                    </View>
                    <Text style={dynamicStyles.episodeNumber}>E{episode.episode_number}</Text>
                    <Text style={dynamicStyles.episodeName} numberOfLines={1}>{episode.name}</Text>
                    {episode.runtime && (
                      <Text style={dynamicStyles.episodeRuntime}>{episode.runtime}m</Text>
                    )}
                  </Pressable>
                );
              })}
```

with:

```tsx
              {episodes.map((episode) => {
                const watched = isSaved && userTvShowId ? isEpisodeWatched(episode.episode_number) : false;
                const aired = isEpisodeAired(episode);
                const rowDisabled = !isSaved || !userTvShowId || !aired;
                return (
                  <Pressable
                    key={episode.id}
                    onPress={() => handleToggleEpisode(episode)}
                    disabled={rowDisabled}
                    style={[
                      dynamicStyles.episodeRow,
                      !aired && { opacity: 0.4 },
                    ]}
                  >
                    <View style={[
                      dynamicStyles.episodeCheckbox,
                      watched && dynamicStyles.episodeCheckboxChecked,
                      (!isSaved || !userTvShowId) && { opacity: 0.3 },
                    ]}>
                      {watched && <Text style={dynamicStyles.checkmark}>{'\u2713'}</Text>}
                    </View>
                    <Text style={dynamicStyles.episodeNumber}>E{episode.episode_number}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={dynamicStyles.episodeName} numberOfLines={1}>{episode.name}</Text>
                      {!aired && episode.air_date && (
                        <Text style={[dynamicStyles.episodeRuntime, { fontSize: 11 }]}>
                          Airs {episode.air_date}
                        </Text>
                      )}
                    </View>
                    {aired && episode.runtime && (
                      <Text style={dynamicStyles.episodeRuntime}>{episode.runtime}m</Text>
                    )}
                  </Pressable>
                );
              })}
```

Four changes:
1. Added `aired` variable derived from the memoized helper.
2. `disabled={rowDisabled}` — now disables unaired rows.
3. Row style array includes `{ opacity: 0.4 }` when unaired (visual deemphasis).
4. Episode name wrapped in a column View so the "Airs YYYY-MM-DD" subtitle renders below it when unaired. Runtime badge hidden for unaired episodes (TMDB often doesn't populate runtime for unaired episodes anyway).

- [ ] **Step 4: Update handleToggleEpisode to no-op on unaired**

Find `handleToggleEpisode` (around line 138). Replace:

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

with:

```ts
  const handleToggleEpisode = async (episode: TMDBEpisode) => {
    if (!isSaved || !userTvShowId) return;
    if (!isEpisodeAired(episode)) return;  // Belt-and-suspenders — disabled row should never reach here
    if (isEpisodeWatched(episode.episode_number)) {
      await unmarkWatched(episode.episode_number);
    } else {
      // airedEpisodes.length is the authoritative aired count for this season —
      // matches what the RPC would evaluate for auto-flip purposes.
      await markWatched(episode, airedEpisodes.length);
    }
  };
```

Two changes:
1. Early return on unaired (defence-in-depth — the Pressable is already disabled).
2. `markWatched(episode, episodes.length)` → `markWatched(episode, airedEpisodes.length)`. The RPC auto-flip logic should compare against aired episodes only (a Returning Series on its final-known season with unaired future episodes shouldn't trigger the flip yet). This is a subtle correctness improvement — `airedEpisodes.length` is the count of episodes the user could possibly have watched, which is the correct denominator.

**Wait — does this break the Phase 4b.4 RPC's auto-flip behavior?** Review: the RPC auto-flip fires when `v_latest_episode >= p_total_episodes_in_season AND tmdb_status IN ('Ended', 'Canceled')`. For `'Ended'` shows, all episodes are already aired so `airedEpisodes.length === episodes.length`. For `'Returning Series'` that haven't finished (but are caught up to aired), the auto-flip wouldn't fire anyway because tmdb_status isn't in the whitelist. So this change is safe — it aligns the signal for the `'Canceled'` edge case too (a canceled show where future episodes have TMDB placeholders but will never air).

- [ ] **Step 5: Run tsc + lint + tests**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-unaired
npx tsc --noEmit
npm run lint
npm test
```

All green. Any new lint warnings from the `useMemo` + dependency array should be suppressed via the existing `eslint-disable-next-line` comment or corrected.

- [ ] **Step 6: Commit**

```bash
git add app/tv/[id]/index.tsx
git commit -m "$(cat <<'EOF'
feat(tv): show-detail UI disables unaired episode rows + adjusts button copy

Episode rows whose air_date > today render at 0.4 opacity,
non-pressable, with an "Airs YYYY-MM-DD" subtitle under the
episode name. "Mark All Watched" becomes "Mark All Aired
Watched" when the current season mixes aired and unaired.

handleToggleEpisode now passes airedEpisodes.length to
markWatched (not episodes.length) so the RPC's auto-flip
branch evaluates against the denominator that actually
reflects what the user could have watched. Safe for Ended
shows (airedEpisodes === episodes) and consistent with the
Canceled show case.

Part of Phase 4c tactical unaired-episode guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Verification + PR

- [ ] **Step 1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-unaired
npm run lint && npx tsc --noEmit && npm test
```

Expected: 0 lint errors, 0 tsc errors, all tests pass (should be 747 + 5 new = 752).

- [ ] **Step 2: Grep for any stray `episodes.length` where `airedEpisodes.length` is intended**

```bash
grep -n "episodes.length" app/tv/[id]/index.tsx
```

Review each match. In `SeasonAccordionItem`, anywhere we're counting "how many episodes could the user have watched," use `airedEpisodes.length`. Anywhere we're rendering the full list or checking array bounds, keep `episodes.length`.

- [ ] **Step 3: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-04-20-widget-phase-4c-unaired-guards.md
git commit -m "$(cat <<'EOF'
chore(tv): add Phase 4c tactical unaired-guards plan

Plan decomposing the spec into 4 TDD tasks. Executed via
superpowers:subagent-driven-development; committing alongside
the feature for archival consistency with prior phases.

Part of Phase 4c tactical unaired-episode guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feature/widget-4c-unaired-guards

gh pr create --title "feat(tv): Phase 4c tactical — reject/filter unaired episodes" --body "$(cat <<'EOF'
## Summary

- `markSeasonWatched` + `batchMarkEpisodesWatched`: filter out episodes with `air_date > today` (or null) before insert
- `markEpisodeWatched`: throw \"Episode has not aired yet\" when called for an unaired episode
- Show-detail UI: \"Mark All Watched\" becomes \"Mark All Aired Watched\" when season mixes aired + unaired; unaired rows render greyed + non-tappable with an \"Airs YYYY-MM-DD\" subtitle
- `handleToggleEpisode` passes `airedEpisodes.length` to `markWatched` (was `episodes.length`) so the RPC's auto-flip branch evaluates the right denominator

## Why

During [PR #389](https://github.com/TyShaneONeill/movie-tracker/pull/389) device validation, Tyshane marked Daredevil: Born Again S2 as watched despite ~6 of 8 episodes being unaired. TMDB returned all 8 episodes because the season has been announced; bulk \"Mark All Watched\" inserted all of them. This PR prevents that.

Full rationale: [[Projects/CineTrak/Features/Fix - Unaired Episode Guards]] in the vault.

## Non-goals (deferred to Phase 4c catalog)

- Widget payload extension with `next_episode_air_date`
- Server-side RPC `air_date` validation
- Cleanup of already-inserted bogus rows (Tyshane can unmark Daredevil S2 manually)
- TMDB `tv_show_episodes` catalog table

See [[Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards]] for the full scope.

## Test plan

- [x] `npm run lint && npx tsc --noEmit && npm test` — all green
- [ ] Device: Daredevil: Born Again show detail → S2 shows unaired episodes greyed out with \"Airs 2026-XX-XX\" subtitle
- [ ] Device: S2 button reads \"Mark All Aired Watched\"; tapping marks only the aired episodes
- [ ] Device: Tapping an unaired episode row → nothing happens (disabled)
- [ ] Device: Marking the last aired episode of a Returning Series' latest season → auto-flip does NOT fire (correct — future episodes exist)
- [ ] Device: Unmark the bogus Daredevil S2 rows from the prior session

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Record the PR URL for the daily note.

---

## Self-Review Notes

**Spec coverage:**
- Fix 3 call sites in `tv-show-service.ts`: Tasks 1, 2, 3 ✓
- UI polish in show-detail: Task 4 ✓
- Non-goals (widget payload, catalog, cleanup): explicitly noted ✓

**Fixture-default risk: resolved.**
- `makeTMDBEpisode` default `air_date = '2008-01-20'` (past) — existing tests continue to pass with new filters in place.

**No placeholders detected.**

**Type consistency:**
- `isEpisodeAired` helper defined once in `SeasonAccordionItem`, used in Step 3 + Step 4.
- `airedEpisodes` memoized var used consistently.
- `TMDBEpisode.air_date: string | null` confirmed in `lib/tmdb.types.ts:288`.

---

## Rollback

- Revert PR. No migration, no data written — pure client-side + UI. Re-inserting the 6 unaired Daredevil rows would require manual action from the user.
