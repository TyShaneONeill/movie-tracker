# Widget Phase 4a Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 4a layout PR — stats header redesign, movie thumbnail column, featured center poster, Q5 hybrid trophy-backfill. Widget payload schema bumps v1 → v2.

**Architecture:** RN side extends `syncWidgetCache()` with a backfill query (fires when &lt;3 active shows), a movies query (top 2 watched), and computes `last_updated` + index-1 reorder in `buildWidgetPayload()`. Swift side adds 2 new view files (`MovieThumb`, `TrophyOverlay`), extends `WidgetData.swift` structs with new fields + movies array, and restructures `WidgetView.swift` to apply flex ratios + the movie column.

**Tech Stack:** React Native (Expo managed workflow), Swift / SwiftUI widget extension via `@bacons/apple-targets`, Supabase Postgres, Jest, TypeScript strict.

**Spec reference:** `docs/superpowers/specs/2026-04-19-widget-phase-4a-design.md`
**Branch:** `feature/widget-4a-layout` (already created)
**Worktree target:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a` (create on execution kickoff)

---

## File inventory

**RN modify:**
- `lib/widget-bridge.ts` — extend `WidgetPayload` type (add `is_trophy`, `last_updated`, `movies`)
- `lib/widget-cache.ts` — add backfill, movies query, reorder, version bump
- `lib/widget-constants.ts` — add `MOVIE_POSTER_PREFIX`

**RN tests:**
- `__tests__/lib/widget-cache.integration.test.ts` — extend with backfill, movies, reorder cases

**Swift modify:**
- `expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift` — add Movie struct, new Show fields, optional movies array on root
- `expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift` — new StatsBar text, flex ratios, movie column
- `expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift` — hide when `isTrophy=true`

**Swift create:**
- `expo-plugins/widget-extension/src/PocketStubsWidget/Views/MovieThumb.swift` — 32pt-wide movie poster component
- `expo-plugins/widget-extension/src/PocketStubsWidget/Views/TrophyOverlay.swift` — ViewModifier for dim + checkmark

**Conditionally modify (device-test driven):**
- `expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift` — tighten for side-poster rendering if cramped (decision: during Task 13 device validation)

---

### Task 1: Extend payload type + constants (v2 schema)

**Files:**
- Modify: `lib/widget-bridge.ts:5-24`
- Modify: `lib/widget-constants.ts:1-7`
- Test: `__tests__/lib/widget-cache.integration.test.ts`

- [ ] **Step 1: Add MOVIE_POSTER_PREFIX constant**

In `lib/widget-constants.ts`, append:

```ts
export const MOVIE_POSTER_PREFIX = 'movie_poster_';
```

- [ ] **Step 2: Extend `WidgetPayload` type in widget-bridge.ts**

Replace the `WidgetPayload` type block (lines 5–24) with:

```ts
export type WidgetPayload = {
  version: number;
  cached_at: number;
  stats: { films_watched: number; shows_watched: number };
  shows: Array<{
    user_tv_show_id: string;
    tmdb_id: number;
    name: string;
    poster_filename: string | null;
    current_season: number;
    current_episode: number;
    total_seasons: number;
    total_episodes_in_current_season: number | null;
    episodes_by_season: Record<string, number>;
    is_season_complete: boolean;
    has_next_season: boolean;
    next_season_number: number | null;
    is_show_complete: boolean;
    is_trophy: boolean;
    last_updated: boolean;
  }>;
  movies: Array<{
    tmdb_id: number;
    name: string;
    poster_filename: string | null;
  }>;
};
```

- [ ] **Step 3: Run typecheck — expect failures in widget-cache.ts**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx tsc --noEmit`

Expected: errors in `lib/widget-cache.ts` at `buildWidgetPayload` since the returned payload is missing `is_trophy`, `last_updated`, `movies`. These will be fixed by Tasks 2–5.

- [ ] **Step 4: Commit**

```bash
git add lib/widget-bridge.ts lib/widget-constants.ts
git commit -m "$(cat <<'EOF'
feat(widget): extend payload type to v2 (is_trophy, last_updated, movies)

Adds the new fields on WidgetPayload required for Phase 4a layout.
Introduces MOVIE_POSTER_PREFIX constant for the movie thumb column's
poster files. Implementation of the fields' population in
widget-cache.ts follows in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Show backfill query (TDD)

**Files:**
- Modify: `lib/widget-cache.ts` — `syncWidgetCache()` function (line ~191)
- Test: `__tests__/lib/widget-cache.integration.test.ts`

Spec: when primary `status='watching'` query returns &lt;3 rows, fire a secondary `status='watched'` query for `3 - count` rows, mark those with `is_trophy: true`. When primary returns ≥3, skip secondary.

- [ ] **Step 1: Write the failing test for &lt;3 active triggering backfill**

Append to `__tests__/lib/widget-cache.integration.test.ts`, inside the `describe('syncWidgetCache orchestrator (integration)', ...)` block:

```ts
  it('backfills with status=watched shows when fewer than 3 are actively watching', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // Primary query (status='watching') returns 1 row
    const watchingChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'utv-active-1', tmdb_id: 101, name: 'Active Show',
          poster_path: null, current_season: 1, current_episode: 1,
          number_of_seasons: 1, updated_at: '2026-04-17',
        }],
        error: null,
      }),
    };

    // Backfill query (status='watched') returns 2 rows
    const watchedChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: 'utv-trophy-1', tmdb_id: 201, name: 'Old Completed Show',
            poster_path: null, current_season: 3, current_episode: 10,
            number_of_seasons: 3, updated_at: '2026-03-01' },
          { id: 'utv-trophy-2', tmdb_id: 202, name: 'Another Completed',
            poster_path: null, current_season: 2, current_episode: 8,
            number_of_seasons: 2, updated_at: '2026-02-15' },
        ],
        error: null,
      }),
    };

    // Movies query returns empty
    const moviesChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    // Stats count chains
    const filmsCountChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    filmsCountChain.eq
      .mockReturnValueOnce(filmsCountChain)
      .mockResolvedValueOnce({ count: 0, error: null });

    const showsCountChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ count: 3, error: null }),
    };

    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx === 1) return watchingChain;
      if (table === 'user_tv_shows' && fromCallIdx === 2) return watchedChain;
      if (table === 'user_movies' && fromCallIdx === 3) return moviesChain;
      if (table === 'user_movies') return filmsCountChain;
      if (table === 'user_tv_shows') return showsCountChain;
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
    });

    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.shows).toHaveLength(3);

    const trophyShows = payload.shows.filter((s: any) => s.is_trophy === true);
    const activeShows = payload.shows.filter((s: any) => s.is_trophy === false);
    expect(trophyShows).toHaveLength(2);
    expect(activeShows).toHaveLength(1);
    expect(activeShows[0].tmdb_id).toBe(101);
  });

  it('does NOT backfill when 3 or more active shows exist', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const watchingChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: 'a', tmdb_id: 1, name: 'A', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-17' },
          { id: 'b', tmdb_id: 2, name: 'B', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-16' },
          { id: 'c', tmdb_id: 3, name: 'C', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-15' },
        ],
        error: null,
      }),
    };

    const moviesChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue({ data: [], error: null }) };
    const filmsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    filmsCountChain.eq.mockReturnValueOnce(filmsCountChain).mockResolvedValueOnce({ count: 0, error: null });
    const showsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ count: 3, error: null }) };

    const fromMock = jest.fn();
    let called = { watching: 0, watched: 0, movies: 0 };
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_tv_shows') {
        if (called.watching === 0) { called.watching++; return watchingChain; }
        called.watched++;
        return showsCountChain;
      }
      if (table === 'user_movies') {
        called.movies++;
        return called.movies === 1 ? moviesChain : filmsCountChain;
      }
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
    });
    (supabase.from as jest.Mock).mockImplementation(fromMock);
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.shows).toHaveLength(3);
    expect(payload.shows.every((s: any) => s.is_trophy === false)).toBe(true);
    expect(called.watched).toBe(1); // only the count query, no backfill select
  });
```

- [ ] **Step 2: Run tests — expect BOTH to FAIL**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx jest __tests__/lib/widget-cache.integration.test.ts -t "backfills\|does NOT backfill" --no-coverage`

Expected: both tests fail because (a) `is_trophy` isn't populated, (b) backfill query isn't fired.

- [ ] **Step 3: Implement the backfill logic in `syncWidgetCache`**

In `lib/widget-cache.ts`, locate the primary query block (starts at ~line 202 with `const { data: tvRows, error: tvErr } = await supabase.from('user_tv_shows')`). After the existing `rows: WatchingRow[] = tvRows.map(...)` block, insert the backfill:

```ts
  // Q5 hybrid: if fewer than 3 active shows, backfill with recently-watched (trophies)
  type BackfillRow = WatchingRow & { is_trophy: boolean };
  let allRows: BackfillRow[] = rows.map((r) => ({ ...r, is_trophy: false }));
  if (allRows.length < 3) {
    const needed = 3 - allRows.length;
    const { data: trophyRows } = await supabase
      .from('user_tv_shows')
      .select('id, tmdb_id, name, poster_path, current_season, current_episode, number_of_seasons, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'watched')
      .order('updated_at', { ascending: false })
      .limit(needed);
    if (trophyRows) {
      allRows = allRows.concat(
        trophyRows.map((r) => ({
          user_tv_show_id: r.id,
          tmdb_id: r.tmdb_id,
          name: r.name,
          poster_path: r.poster_path,
          current_season: r.current_season ?? 1,
          current_episode: r.current_episode ?? 1,
          number_of_seasons: r.number_of_seasons ?? 1,
          updated_at: r.updated_at ?? new Date(0).toISOString(),
          is_trophy: true,
        }))
      );
    }
  }
```

Update downstream references: `top3ForFetch` should use `allRows` rather than `rows`. Also the `rows.find(...)` in the poster-writing loop further down needs to become `allRows.find(...)`. Also update the `BuildInput` type + buildWidgetPayload signature to accept `allRows` (below in Task 4).

Update `WatchingRow` type at top of file:

```ts
type WatchingRow = {
  user_tv_show_id: string;
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  current_season: number;
  current_episode: number;
  number_of_seasons: number;
  updated_at: string;
  is_trophy: boolean;
};
```

Remove the separate `BackfillRow` alias now that `WatchingRow` carries `is_trophy`. Update the initial `rows.map(...)` to include `is_trophy: false`. Rename `allRows` back to `rows` for consistency — the single array shape is fine now.

- [ ] **Step 4: Update `buildWidgetPayload` to propagate `is_trophy`**

In `lib/widget-cache.ts` inside `buildWidgetPayload` (line ~134), inside the `top3.map((row, idx) => { ... })`, add to the returned object:

```ts
      is_trophy: row.is_trophy,
      last_updated: false,   // Task 4 computes this correctly
```

Also update `BuildInput['rows']` type annotation if it references `WatchingRow` — it should now carry `is_trophy`.

- [ ] **Step 5: Run the two backfill tests — expect PASS**

Run: `npx jest __tests__/lib/widget-cache.integration.test.ts -t "backfills\|does NOT backfill" --no-coverage`

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add lib/widget-cache.ts __tests__/lib/widget-cache.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): add Q5 hybrid backfill for light users

When fewer than 3 shows are in status='watching', the widget now
backfills remaining slots with recently-watched shows (status='watched')
marked as is_trophy=true. Heavy users see only actionable shows;
light users never see empty slots.

Adds 2 integration tests covering the triggered + not-triggered paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Movies query + poster download (TDD)

**Files:**
- Modify: `lib/widget-cache.ts` — `syncWidgetCache()`, `buildWidgetPayload`
- Test: `__tests__/lib/widget-cache.integration.test.ts`

Spec: query `user_movies` where `status='watched'`, order by `updated_at` DESC, limit 2. Download posters to `movie_poster_0.jpg` / `movie_poster_1.jpg`. Include `movies` array in payload.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/widget-cache.integration.test.ts`:

```ts
  it('populates top-2 recently-watched movies in payload', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // Empty shows — not the focus of this test
    const emptyChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    const moviesChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { tmdb_id: 601, name: 'Dune', poster_path: '/dune.jpg', updated_at: '2026-04-17' },
          { tmdb_id: 602, name: 'Oppenheimer', poster_path: null, updated_at: '2026-04-16' },
        ],
        error: null,
      }),
    };

    const filmsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    filmsCountChain.eq.mockReturnValueOnce(filmsCountChain).mockResolvedValueOnce({ count: 2, error: null });
    const showsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ count: 0, error: null }) };

    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx <= 2) return emptyChain; // watching + watched both empty
      if (table === 'user_movies' && fromCallIdx === 3) return moviesChain;
      if (table === 'user_movies') return filmsCountChain;
      if (table === 'user_tv_shows') return showsCountChain;
      return emptyChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.movies).toHaveLength(2);
    expect(payload.movies[0]).toEqual({ tmdb_id: 601, name: 'Dune', poster_filename: 'movie_poster_0.jpg' });
    expect(payload.movies[1]).toEqual({ tmdb_id: 602, name: 'Oppenheimer', poster_filename: null });
  });

  it('emits empty movies array when user has no watched movies', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const emptyChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const filmsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    filmsCountChain.eq.mockReturnValueOnce(filmsCountChain).mockResolvedValueOnce({ count: 0, error: null });
    const showsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ count: 0, error: null }) };

    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx <= 2) return emptyChain;
      if (table === 'user_movies' && fromCallIdx === 3) return emptyChain;
      if (table === 'user_movies') return filmsCountChain;
      return showsCountChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.movies).toEqual([]);
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx jest __tests__/lib/widget-cache.integration.test.ts -t "populates top-2\|emits empty movies" --no-coverage`

Expected: both fail — no `movies` field is emitted by current code.

- [ ] **Step 3: Implement movies query in `syncWidgetCache`**

In `lib/widget-cache.ts`, BEFORE the poster-write loop at the end of `syncWidgetCache`, and AFTER the `buildWidgetPayload` call, add:

```ts
  // Movies — top 2 recently-watched (Phase 4a)
  const { data: movieRows } = await supabase
    .from('user_movies')
    .select('tmdb_id, name, poster_path, updated_at')
    .eq('user_id', user.id)
    .eq('status', 'watched')
    .order('updated_at', { ascending: false })
    .limit(2);
```

Actually — this query must fire BEFORE `buildWidgetPayload` so the returned payload contains `movies`. Move it before the `const payload = buildWidgetPayload(...)` call, and pass `movieRows` (or a mapped version) into `buildWidgetPayload`.

Update `BuildInput` in the same file:

```ts
type BuildInput = {
  rows: WatchingRow[];
  stats: { films_watched: number; shows_watched: number };
  episodesBySeason: Record<string, number>;
  liveNumberOfSeasons: Record<string, number>;
  movieRows: Array<{ tmdb_id: number; name: string; poster_path: string | null }>;
};
```

In `buildWidgetPayload`, after the `shows` map, add:

```ts
  const movies = movieRows.slice(0, 2).map((m, idx) => ({
    tmdb_id: m.tmdb_id,
    name: m.name,
    poster_filename: m.poster_path ? `movie_poster_${idx}.jpg` : null,
  }));
```

And include `movies` in the returned payload object.

- [ ] **Step 4: Download movie posters in `syncWidgetCache`**

AFTER the existing show-poster-write loop, add the parallel movie-poster-write loop. Locate the closing `}` of the `for (let i = 0; i < payload.shows.length; i++) { ... }` loop and append:

```ts
  // Movie posters — top 2 recently-watched (Phase 4a)
  for (let i = 0; i < payload.movies.length; i++) {
    const movie = payload.movies[i];
    const row = movieRows?.find((r) => r.tmdb_id === movie.tmdb_id);
    if (!row?.poster_path) continue;
    if (!TMDB_POSTER_PATH_PATTERN.test(row.poster_path)) continue;
    const url = `https://image.tmdb.org/t/p/w342${row.poster_path}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (blob.size > MAX_POSTER_BYTES) continue;
      const base64 = await blobToBase64(blob);
      await writePosterFile(`${MOVIE_POSTER_PREFIX}${i}.jpg`, base64);
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'widget-cache',
        level: 'warning',
        message: 'movie poster write failed',
        data: { tmdb_id: movie.tmdb_id, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
```

Import `MOVIE_POSTER_PREFIX` at the top of the file:

```ts
import { MOVIE_POSTER_PREFIX } from '@/lib/widget-constants';
```

Reuse the existing `blobToBase64` helper already used for show posters. If that helper isn't named exactly `blobToBase64`, locate the equivalent used in the show-poster loop and reuse the same pattern.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx jest __tests__/lib/widget-cache.integration.test.ts --no-coverage`

Expected: all tests pass (including existing ones).

- [ ] **Step 6: Commit**

```bash
git add lib/widget-cache.ts __tests__/lib/widget-cache.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): add top-2 watched movies to payload + poster download

Queries user_movies status='watched' ordered by updated_at, emits the
top 2 into payload.movies, and writes their TMDB posters to
movie_poster_0.jpg / movie_poster_1.jpg via App Groups. Widget-side
MovieThumb view in a following commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `last_updated` flag + index-1 reorder (TDD)

**Files:**
- Modify: `lib/widget-cache.ts` — `buildWidgetPayload`
- Test: `__tests__/lib/widget-cache.integration.test.ts`

Spec: among shows with `is_trophy=false`, mark the one with highest `updated_at` as `last_updated=true`, then reorder the 3-show array so that entry sits at index 1 (center slot). If all 3 are trophies, skip — natural order, no flag.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/widget-cache.integration.test.ts`:

```ts
  it('sets last_updated on the most-recent non-trophy show and places it at index 1', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const watchingChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: 'a', tmdb_id: 1, name: 'Newest', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-17' },
          { id: 'b', tmdb_id: 2, name: 'Middle', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-16' },
          { id: 'c', tmdb_id: 3, name: 'Oldest', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-15' },
        ],
        error: null,
      }),
    };
    const emptyChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue({ data: [], error: null }) };
    const filmsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    filmsCountChain.eq.mockReturnValueOnce(filmsCountChain).mockResolvedValueOnce({ count: 0, error: null });
    const showsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ count: 3, error: null }) };

    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx === 1) return watchingChain;
      if (table === 'user_movies' && fromCallIdx === 2) return emptyChain;
      if (table === 'user_movies') return filmsCountChain;
      if (table === 'user_tv_shows') return showsCountChain;
      return emptyChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.shows[1].tmdb_id).toBe(1); // 'Newest' moved to center
    expect(payload.shows[1].last_updated).toBe(true);
    expect(payload.shows[0].last_updated).toBe(false);
    expect(payload.shows[2].last_updated).toBe(false);
  });

  it('does not set last_updated when all 3 shows are trophies', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const emptyChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue({ data: [], error: null }) };
    const watchedChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [
          { id: 't1', tmdb_id: 101, name: 'T1', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-04-01' },
          { id: 't2', tmdb_id: 102, name: 'T2', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-03-15' },
          { id: 't3', tmdb_id: 103, name: 'T3', poster_path: null, current_season: 1, current_episode: 1, number_of_seasons: 1, updated_at: '2026-03-01' },
        ],
        error: null,
      }),
    };
    const filmsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    filmsCountChain.eq.mockReturnValueOnce(filmsCountChain).mockResolvedValueOnce({ count: 0, error: null });
    const showsCountChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ count: 3, error: null }) };

    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx === 1) return emptyChain;
      if (table === 'user_tv_shows' && fromCallIdx === 2) return watchedChain;
      if (table === 'user_movies' && fromCallIdx === 3) return emptyChain;
      if (table === 'user_movies') return filmsCountChain;
      return showsCountChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    await syncWidgetCache();

    const payload = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(payload.shows.every((s: any) => s.last_updated === false)).toBe(true);
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx jest __tests__/lib/widget-cache.integration.test.ts -t "last_updated" --no-coverage`

Expected: both fail. First fails because center slot is currently 'Middle' not 'Newest' (no reorder logic). Second may pass accidentally because current code doesn't set `last_updated=true` anywhere — keep it green as a regression guard.

- [ ] **Step 3: Implement in `buildWidgetPayload`**

In `lib/widget-cache.ts`, inside `buildWidgetPayload`, after the existing `top3.map((row, idx) => ({ ... }))` produces the `shows` array, add:

```ts
  // Compute last_updated flag + reorder so center (index 1) is the last-updated non-trophy
  const nonTrophyShows = shows.filter((s) => !s.is_trophy);
  if (nonTrophyShows.length > 0) {
    const latestUpdatedAt = nonTrophyShows.reduce((max, s) => {
      const rowMatch = rows.find((r) => r.user_tv_show_id === s.user_tv_show_id);
      const ts = rowMatch ? Date.parse(rowMatch.updated_at) : 0;
      return ts > max.ts ? { id: s.user_tv_show_id, ts } : max;
    }, { id: '', ts: -Infinity });

    const flaggedShows = shows.map((s) => ({
      ...s,
      last_updated: s.user_tv_show_id === latestUpdatedAt.id,
    }));

    // Reorder: put last_updated at index 1 (center), others around it
    const lastIdx = flaggedShows.findIndex((s) => s.last_updated);
    if (lastIdx !== 1 && lastIdx !== -1) {
      const [featured] = flaggedShows.splice(lastIdx, 1);
      flaggedShows.splice(1, 0, featured);
    }
    return {
      version: 2,
      cached_at: Date.now(),
      stats,
      shows: flaggedShows,
      movies,
    };
  }

  return {
    version: 2,
    cached_at: Date.now(),
    stats,
    shows,
    movies,
  };
```

Remove the earlier placeholder `last_updated: false` in the initial shows.map — it's now set via the flaggedShows step. Also remove any prior duplicate `return { version: 1, ... }` block.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx jest __tests__/lib/widget-cache.integration.test.ts --no-coverage`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/widget-cache.ts __tests__/lib/widget-cache.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): compute last_updated flag + reorder center poster

buildWidgetPayload now flags the most-recently-updated non-trophy
show as last_updated=true and reorders the shows array so it sits at
index 1 (center slot). If all 3 are trophies, no flag is set and
natural order is preserved.

Also bumps payload version to 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extend Swift WidgetData.swift

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift`

- [ ] **Step 1: Extend Show struct with new fields + add Movie struct + add movies to root**

Replace the entire contents of `WidgetData.swift` with:

```swift
import Foundation

struct WidgetData: Codable {
    let version: Int
    let cachedAt: TimeInterval
    let stats: Stats
    let shows: [Show]
    let movies: [Movie]?   // Optional for v1 → v2 compat

    enum CodingKeys: String, CodingKey {
        case version
        case cachedAt = "cached_at"
        case stats
        case shows
        case movies
    }
}

struct Stats: Codable {
    let filmsWatched: Int
    let showsWatched: Int

    enum CodingKeys: String, CodingKey {
        case filmsWatched = "films_watched"
        case showsWatched = "shows_watched"
    }
}

struct Show: Codable {
    let userTvShowId: String
    let tmdbId: Int
    let name: String
    let posterFilename: String?
    let currentSeason: Int
    let currentEpisode: Int
    let totalSeasons: Int
    let totalEpisodesInCurrentSeason: Int?
    let episodesBySeason: [String: Int]
    let isSeasonComplete: Bool
    let hasNextSeason: Bool
    let nextSeasonNumber: Int?
    let isShowComplete: Bool
    let isTrophy: Bool
    let lastUpdated: Bool

    enum CodingKeys: String, CodingKey {
        case userTvShowId = "user_tv_show_id"
        case tmdbId = "tmdb_id"
        case name
        case posterFilename = "poster_filename"
        case currentSeason = "current_season"
        case currentEpisode = "current_episode"
        case totalSeasons = "total_seasons"
        case totalEpisodesInCurrentSeason = "total_episodes_in_current_season"
        case episodesBySeason = "episodes_by_season"
        case isSeasonComplete = "is_season_complete"
        case hasNextSeason = "has_next_season"
        case nextSeasonNumber = "next_season_number"
        case isShowComplete = "is_show_complete"
        case isTrophy = "is_trophy"
        case lastUpdated = "last_updated"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userTvShowId = try c.decode(String.self, forKey: .userTvShowId)
        tmdbId = try c.decode(Int.self, forKey: .tmdbId)
        name = try c.decode(String.self, forKey: .name)
        posterFilename = try c.decodeIfPresent(String.self, forKey: .posterFilename)
        currentSeason = try c.decode(Int.self, forKey: .currentSeason)
        currentEpisode = try c.decode(Int.self, forKey: .currentEpisode)
        totalSeasons = try c.decode(Int.self, forKey: .totalSeasons)
        totalEpisodesInCurrentSeason = try c.decodeIfPresent(Int.self, forKey: .totalEpisodesInCurrentSeason)
        episodesBySeason = try c.decode([String: Int].self, forKey: .episodesBySeason)
        isSeasonComplete = try c.decode(Bool.self, forKey: .isSeasonComplete)
        hasNextSeason = try c.decode(Bool.self, forKey: .hasNextSeason)
        nextSeasonNumber = try c.decodeIfPresent(Int.self, forKey: .nextSeasonNumber)
        isShowComplete = try c.decode(Bool.self, forKey: .isShowComplete)
        // v2 fields default to false when decoding v1 cache
        isTrophy = try c.decodeIfPresent(Bool.self, forKey: .isTrophy) ?? false
        lastUpdated = try c.decodeIfPresent(Bool.self, forKey: .lastUpdated) ?? false
    }
}

struct Movie: Codable {
    let tmdbId: Int
    let name: String
    let posterFilename: String?

    enum CodingKeys: String, CodingKey {
        case tmdbId = "tmdb_id"
        case name
        case posterFilename = "poster_filename"
    }
}
```

Note the custom `init(from:)` on `Show` — required so that a v1 cache (no `is_trophy` / `last_updated` keys) decodes gracefully with defaulted `false`. The `Movie` struct and root `movies: [Movie]?` field use optional decoding via `decodeIfPresent` (automatic for Optional properties).

- [ ] **Step 2: Trigger a prebuild to verify Swift compiles**

Run from the worktree root: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx expo prebuild --platform ios --clean`

Expected: prebuild succeeds. If Swift compile errors occur (e.g., from an unused `Movie` type), they will surface at the later xcodebuild stage in Task 13's device build. Logged; move on if prebuild itself succeeds.

- [ ] **Step 3: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift
git commit -m "$(cat <<'EOF'
feat(widget): extend Swift WidgetData for v2 payload

Adds Movie struct + optional root movies array, and is_trophy +
last_updated fields on Show. Custom Show decoder defaults the new
Bool fields to false so pre-v2 caches decode cleanly during rollout
(no explicit migration).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Create MovieThumb view

**Files:**
- Create: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/MovieThumb.swift`

- [ ] **Step 1: Create the new file**

```swift
import SwiftUI
import WidgetKit

struct MovieThumb: View {
    let movie: Movie

    var body: some View {
        Link(destination: URL(string: "pocketstubs://movie/\(movie.tmdbId)")!) {
            PosterContent(movie: movie)
                .aspectRatio(2/3, contentMode: .fit)
                .frame(width: 32)
                .clipShape(RoundedRectangle(cornerRadius: 5))
                .contentShape(RoundedRectangle(cornerRadius: 5).inset(by: -6))
        }
    }
}

private struct PosterContent: View {
    let movie: Movie

    var body: some View {
        if let filename = movie.posterFilename,
           let image = WidgetDataReader.loadPoster(filename: filename) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            ZStack {
                LinearGradient(
                    colors: [Color.black, Color(white: 0.18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(movie.name)
                    .font(.system(size: 6, weight: .semibold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(2)
                    .lineLimit(3)
            }
        }
    }
}
```

Note: `.contentShape(...inset(by: -6))` expands the tap target by 6pt on every side — effective hit area becomes 44pt × 66pt (meeting HIG minimum). Mirrors the pattern used in `EyeballButton.swift`.

`WidgetDataReader.loadPoster(filename:)` is the existing utility from Phase 1 that reads a named poster file from the App Groups container. No changes to it needed.

- [ ] **Step 2: Verify Swift compiles via prebuild**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx expo prebuild --platform ios --clean`

Expected: prebuild succeeds.

- [ ] **Step 3: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Views/MovieThumb.swift
git commit -m "$(cat <<'EOF'
feat(widget): add MovieThumb view for right column

Small 32pt-wide movie poster with deep-link to pocketstubs://movie/{id}.
Hit area expanded to HIG-compliant 44pt via .contentShape inset.
Reuses WidgetDataReader.loadPoster for the App Groups image read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Create TrophyOverlay view modifier

**Files:**
- Create: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/TrophyOverlay.swift`

- [ ] **Step 1: Create the file**

```swift
import SwiftUI

struct TrophyOverlay: ViewModifier {
    func body(content: Content) -> some View {
        content
            .opacity(0.45)
            .saturation(0.4)
            .overlay(
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.9))
                        .frame(width: 26, height: 26)
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundColor(Color(red: 0.04, green: 0.17, blue: 0.08))
                }
            )
    }
}

extension View {
    func trophyOverlay(enabled: Bool) -> some View {
        self.modifier(TrophyModifierConditional(enabled: enabled))
    }
}

private struct TrophyModifierConditional: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled {
            content.modifier(TrophyOverlay())
        } else {
            content
        }
    }
}
```

- [ ] **Step 2: Verify Swift compiles via prebuild**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx expo prebuild --platform ios --clean`

Expected: prebuild succeeds.

- [ ] **Step 3: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Views/TrophyOverlay.swift
git commit -m "$(cat <<'EOF'
feat(widget): add TrophyOverlay view modifier

Applies opacity 0.45 + saturation 0.4 to a poster and overlays a 26pt
green checkmark badge. Exposed as .trophyOverlay(enabled:) so
WidgetView can toggle per-show without conditional tree duplication.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Update EyeballButton for trophy state

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift`

- [ ] **Step 1: Guard the button on `!isTrophy`**

Read the file first: `cat expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift`

Locate the top-level `body: some View` return. Wrap its entire content in:

```swift
    var body: some View {
        if show.isTrophy {
            EmptyView()
        } else {
            // ... existing body contents ...
        }
    }
```

If the current file's `body` returns directly (no outer container), the simplest safe transform is to use an explicit `Group { }` block:

```swift
    var body: some View {
        Group {
            if show.isTrophy {
                EmptyView()
            } else {
                // paste existing body here unchanged
            }
        }
    }
```

- [ ] **Step 2: Verify Swift compiles via prebuild**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx expo prebuild --platform ios --clean`

Expected: prebuild succeeds.

- [ ] **Step 3: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift
git commit -m "$(cat <<'EOF'
feat(widget): hide EyeballButton for trophy shows

A trophy show (status='watched', surfaced via Q5 hybrid backfill) has
nothing to mark — the button is dead UI. Hide it entirely so the
poster area is pure trophy treatment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Restructure WidgetView — stats text, flex ratios, movie column

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift`

- [ ] **Step 1: Replace the entire file**

```swift
import SwiftUI
import WidgetKit

struct WidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StatsBar(stats: entry.data.stats)
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { idx in
                    if idx < entry.data.shows.count {
                        let show = entry.data.shows[idx]
                        ShowCard(show: show)
                            .layoutPriority(show.lastUpdated ? 1.4 : 1)
                    } else {
                        EmptySlot()
                            .layoutPriority(1)
                    }
                }
                if let movies = entry.data.movies, !movies.isEmpty {
                    MovieColumn(movies: movies)
                }
            }
        }
        .widgetURL(URL(string: "pocketstubs://"))
    }
}

private struct StatsBar: View {
    let stats: Stats
    var body: some View {
        Text("Watched: \(stats.filmsWatched) Movies · \(stats.showsWatched) TV Shows")
            .font(.caption)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

private struct ShowCard: View {
    let show: Show

    var body: some View {
        VStack(spacing: 4) {
            Link(destination: URL(string: "pocketstubs://tv/\(show.tmdbId)")!) {
                PosterView(show: show)
                    .aspectRatio(2/3, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(
                        show.lastUpdated && !show.isTrophy
                            ? RoundedRectangle(cornerRadius: 6)
                                .strokeBorder(Color.orange.opacity(0.5), lineWidth: 1.5)
                            : nil
                    )
                    .trophyOverlay(enabled: show.isTrophy)
            }

            if show.isTrophy {
                // No action row — trophy poster stands alone
                EmptyView()
            } else if show.isSeasonComplete {
                SeasonCompleteBadge(show: show)
            } else {
                VStack(spacing: 3) {
                    Text(episodeLabel)
                        .font(.caption2)
                        .foregroundColor(.primary)
                    EyeballButton(show: show)
                }
            }
        }
    }

    private var episodeLabel: String {
        String(format: "S%02d · E%02d", show.currentSeason, show.currentEpisode)
    }
}

private struct MovieColumn: View {
    let movies: [Movie]

    var body: some View {
        VStack(spacing: 4) {
            if movies.count >= 1 {
                MovieThumb(movie: movies[0])
            }
            if movies.count >= 2 {
                MovieThumb(movie: movies[1])
            } else if movies.count == 1 {
                Spacer().frame(width: 32)
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

private struct PosterView: View {
    let show: Show

    var body: some View {
        if let filename = show.posterFilename,
           let image = WidgetDataReader.loadPoster(filename: filename) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            TitleFallback(title: show.name)
        }
    }
}

private struct TitleFallback: View {
    let title: String
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(white: 0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(4)
                .lineLimit(3)
        }
    }
}

private struct EmptySlot: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Color(.systemGray5))
            .aspectRatio(2/3, contentMode: .fit)
    }
}
```

Key changes from the Phase 3 version:
- **StatsBar text**: new format `"Watched: X Movies · X TV Shows"`, centered via `frame(maxWidth: .infinity, alignment: .center)`
- **ShowCard layoutPriority**: flex ratio 1.4 for last-updated posters, 1 otherwise
- **Amber ring** overlay on last-updated non-trophy posters
- **Trophy overlay** via the new `.trophyOverlay(enabled:)` modifier
- **Trophy branch** in bottom strip — no EyeballButton, no SeasonCompleteBadge, no episode label
- **MovieColumn** appended to the HStack, hidden when `movies.isEmpty`

- [ ] **Step 2: Verify Swift compiles via prebuild**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a && npx expo prebuild --platform ios --clean`

Expected: prebuild succeeds.

- [ ] **Step 3: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift
git commit -m "$(cat <<'EOF'
feat(widget): restructure layout — stats, flex ratios, movie column

- StatsBar: "Watched: X Movies · X TV Shows" centered, HIG middle dot
- ShowCard: layoutPriority(1.4) when lastUpdated, 1 otherwise
- Amber ring overlay on last-updated non-trophy posters
- Trophy overlay via .trophyOverlay(enabled:) modifier
- Trophy branch hides both the episode label and eyeball button
- New MovieColumn (hidden when movies is empty) rendered after the
  3-show HStack

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check chain**

Run all three in sequence:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a
npm run lint
npx tsc --noEmit
npm test -- --no-coverage
```

Expected:
- lint: 0 errors, 0 new warnings
- tsc: no errors
- jest: 721+ tests pass (baseline + 4 new tests from Tasks 2, 3, 4)

If any fail, fix inline — do NOT advance to Task 11 with red CI.

- [ ] **Step 2: If prior lint/tsc surfaced issues needing fixes, commit them**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore(widget): fix lint and type errors surfaced during Phase 4a

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Skip if nothing needed fixing.

---

### Task 11: Build a preview on device for validation

**Files:** none (build step)

- [ ] **Step 1: Run EAS build for iOS simulator or development-device**

Tyshane chooses the path. Default: build for physical device.

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a
eas build --platform ios --profile development --local
# or for cloud build:
# eas build --platform ios --profile development
```

After install: long-press the widget, select Edit Widget, confirm medium size is selected.

- [ ] **Step 2: Device validation checklist (Tyshane)**

- [ ] Happy path: 3 active shows, stats text matches "Watched: X Movies · X TV Shows", center poster visibly enlarged
- [ ] Amber ring visible on center poster in light mode AND dark mode (if invisible in light mode, bump opacity in WidgetView.swift)
- [ ] Movie thumbs tappable — both deep-link correctly to `pocketstubs://movie/{id}` routes
- [ ] Widget renders correctly with 0 movies (column gone), 1 movie (top only + empty 32pt gap), 2 movies
- [ ] Side-poster completed state (force by marking final episode of a non-center show) — banner + "Start S{N+1}" button legible at `flex: 1` size. If cramped, jump to Task 12.
- [ ] Trophy state — sign in with an account having ≤2 active + ≥1 status='watched' show. Confirm dim + checkmark renders, eyeball button is NOT shown.
- [ ] Light user fallback — with 0 active shows and 3 watched shows, confirm all 3 slots fill with trophy state.

- [ ] **Step 3: Capture findings**

Tyshane reports back. If all pass, skip to Task 13. If the side-poster Completed legibility is cramped, proceed to Task 12.

---

### Task 12: Conditional — Tighten SeasonCompleteBadge for side-poster size

**Skip this task if Task 11 Step 2's side-poster Completed check passed.**

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift`

- [ ] **Step 1: Read the current implementation**

```bash
cat expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift
```

Identify the font sizes + padding on the "Completed!" banner and "Start S{N+1}" button.

- [ ] **Step 2: Reduce sizes**

Drop the banner font size by ~2pt (e.g., `.caption2` → `.system(size: 9, weight: .bold)`), reduce internal padding from 4 to 2, and reduce the Start-button corner radius accordingly. Exact values depend on what's there — target ~20% smaller overall footprint.

Alternative (if still cramped): swap the banner for a corner badge — a single green checkmark + ring in the top-right of the poster, with the "Start S{N+1}" button still at bottom.

- [ ] **Step 3: Verify via prebuild + rebuild**

```bash
npx expo prebuild --platform ios --clean
eas build --platform ios --profile development --local
```

Re-validate on device.

- [ ] **Step 4: Commit**

```bash
git add expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift
git commit -m "$(cat <<'EOF'
fix(widget): tighten SeasonCompleteBadge for small side-poster size

After Phase 4a's flex-ratio change, non-center posters are narrower
and the original banner/button were cramped. Reduced text size and
padding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Open PR #1

**Files:** none (git operation)

- [ ] **Step 1: Confirm branch is ready**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-widget-phase-4a
git log --oneline main..HEAD
git status
```

Expected: ~10 commits ahead of main, clean working tree.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/widget-4a-layout
```

- [ ] **Step 3: Create the PR**

```bash
gh pr create --title "feat(widget): Phase 4a layout — movie thumbs, featured poster, Q5 hybrid" --body "$(cat <<'EOF'
## Summary

Phase 4a layout work. Widget medium now renders:
- Stats header in `Watched: X Movies · X TV Shows` format (Apple HIG middle dot)
- 3 TV posters with center (last-updated) poster enlarged (flex 1.4) + subtle amber ring
- 2 recently-watched movie thumbnails in a new right column
- Trophy state (dimmed + checkmark) for completed shows when user has &lt;3 active (Q5 hybrid)

Payload bumped to v2 with backward-compatible Swift decoding — pre-v2 caches decode with defaulted `is_trophy` / `last_updated` / empty `movies`.

Design spec: `docs/superpowers/specs/2026-04-19-widget-phase-4a-design.md`
Plan: `docs/superpowers/plans/2026-04-19-widget-phase-4a-layout.md`

Phase 4a PR #2 (haptics spike) follows separately after this merges.

## Test plan
- [x] 721+ tests pass (baseline + 4 new integration tests for backfill, movies, last_updated + reorder)
- [x] `npm run lint && npx tsc --noEmit && npm test` clean
- [x] Device-tested happy path, side-completed, trophy, light-user fallback (see plan Task 11)
- [x] Amber ring visible in light and dark mode
- [x] Movie thumbs deep-link to `pocketstubs://movie/{id}` correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Return PR URL to Tyshane for review**

---

## Self-review

Spec coverage:
- ✓ Q1 layout (3 shows + 2 movie thumbs) — Tasks 3 (movies query), 6 (MovieThumb view), 9 (WidgetView column)
- ✓ Q2 featured poster (last-updated center, no size change on completed) — Tasks 4 (flag + reorder), 9 (layoutPriority + amber ring)
- ✓ Q3 haptics — EXPLICITLY out of scope for this plan; separate plan for PR #2
- ✓ Q4 stats header format — Task 9 (StatsBar text)
- ✓ Q5 hybrid trophy backfill — Tasks 2 (backfill query), 5 (Show field), 7 (TrophyOverlay), 9 (trophy rendering + EyeballButton hide)
- ✓ Payload v2 bump — Task 4 (version: 2) + Task 5 (Swift decoder compat)
- ✓ Poster download for movies — Task 3
- ✓ `MOVIE_POSTER_PREFIX` constant — Task 1
- ✓ Device validation checklist — Task 11
- ✓ Risk mitigation "tighten SeasonCompleteBadge" — Task 12 (conditional)

Placeholder scan: all tasks have concrete code, exact commands, and expected output. No TBDs.

Type consistency: `WatchingRow.is_trophy: boolean`, Show struct `is_trophy` (TS) ↔ `isTrophy` (Swift) via `CodingKey`. Plan uses snake_case across JSON boundary, camelCase in Swift — matches existing Phase 1–3 convention.

Scope check: single plan, single PR. Haptics work explicitly deferred to a second plan for PR #2 after this ships.

Risk: the exact line numbers referenced (e.g., `lib/widget-bridge.ts:5-24`, `lib/widget-cache.ts` ~202) are accurate as of Phase 3 end state (2026-04-18). Rebasing onto a main that moves significantly may shift numbers — the task descriptions use identifier-anchored replacements (function names, type names) so the engineer can locate the right spot.
