# Widget Phase 4c.3e — Widget UX Unlocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the widget proactive visual feedback for unaired episodes — an orange "Airs Friday" pill replaces the eyeball when the next episode hasn't aired, and replaces the "Start S0N" button when the next season's E01 hasn't aired. Complements PR #394's server-side RPC guard by preventing the misleading tap in the first place.

**Architecture:** Two nullable ISO-date fields added to the widget payload (`nextEpisodeAirDate`, `nextSeasonFirstAirDate`) sourced from the existing `tv_show_episodes` catalog via a single batched Supabase query at sync time. Widget view branches on runtime date comparison against `CURRENT_DATE` (in local timezone) to swap between tappable controls and non-interactive orange pills. No new backend work; all UI changes are iOS 17+ compatible.

**Tech Stack:** React Native (TypeScript) for the payload sync, Swift / SwiftUI (iOS 17+ WidgetKit) for the widget rendering, Supabase PostgREST `.or()` composite-key query for batched catalog lookup. Jest (with Supabase mocking) for RN unit tests.

**Spec:** `docs/superpowers/specs/2026-04-22-widget-phase-4c3e-widget-ux-unlocks-design.md`

**Supabase project ref:** `wliblwulvsrfgqcnbzeh` (read-only use — no migrations in this plan)

---

## File Map

| File | Action | Purpose |
|--|--|--|
| `lib/widget-bridge.ts` | Modify | Extend `WidgetPayload.shows[]` TypeScript type with the two new fields |
| `lib/widget-cache.ts` | Modify | Add `airDatesByShow` to `BuildInput`; new `fetchEpisodeAirDates` helper; wire into `syncWidgetCache` |
| `__tests__/lib/widget-cache.test.ts` | Modify | New tests for `buildWidgetPayload` populating the two fields |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift` | Modify | Add two nullable string fields to `Show` struct + coding keys + decodeIfPresent for v2→v3 compat |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/WidgetDataWriter.swift` | Modify | Propagate two new fields in `markEpisodeWatched` and `advanceSeason` patch mutations |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Views/AirDateBadge.swift` | Create | `formatAirDate`, `isAirDateFuture`, `AirDateBadge` pure functions + view |
| `expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift` | Modify | Branch on `isAirDateFuture(nextEpisodeAirDate)` in the non-complete bottom block |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift` | Modify | Branch on `isAirDateFuture(nextSeasonFirstAirDate)` for the `Start S0N` button replacement |

No new test files. No Swift tests (widget extension has no test target; pure functions are simple enough that device validation covers correctness).

---

## Task 1: RN-side payload type + BuildInput wiring

**Context for implementer:** Extend the RN-side TypeScript types + `buildWidgetPayload` to carry the two new air_date fields. In this task, we're just wiring the plumbing — the `airDatesByShow` input stays empty in real usage until Task 2 populates it. The payload will ship `null` for both fields everywhere, which matches pre-3e behavior (widget falls back to tappable eyeball).

Tests in this task use the same `buildWidgetPayload` pattern as existing tests — passing a mock `BuildInput` and asserting the output.

**Files:**
- Modify: `lib/widget-bridge.ts` (WidgetPayload type)
- Modify: `lib/widget-cache.ts` (BuildInput type + buildWidgetPayload)
- Test: `__tests__/lib/widget-cache.test.ts` (2 new test cases)

- [ ] **Step 1: Write failing test for populated air_date fields**

Append to `__tests__/lib/widget-cache.test.ts` inside the `describe('buildWidgetPayload', ...)` block:

```typescript
  it('populates next_episode_air_date and next_season_first_air_date from airDatesByShow (Phase 4c.3e)', () => {
    const rows = [
      { ...baseRow, user_tv_show_id: 'a', current_season: 2, current_episode: 3, number_of_seasons: 3, updated_at: '2026-04-15' },
    ];
    const payload = buildWidgetPayload({
      rows,
      stats: { films_watched: 0, shows_watched: 0 },
      episodesBySeason: {},
      liveNumberOfSeasons: {},
      airDatesByShow: {
        a: { nextEpisode: '2026-04-29', nextSeasonFirst: '2026-06-01' },
      },
      movieRows: [],
    });
    expect(payload.shows[0].next_episode_air_date).toBe('2026-04-29');
    expect(payload.shows[0].next_season_first_air_date).toBe('2026-06-01');
  });

  it('defaults next_episode_air_date and next_season_first_air_date to null when airDatesByShow has no entry (Phase 4c.3e)', () => {
    const rows = [
      { ...baseRow, user_tv_show_id: 'a', current_season: 1, current_episode: 2, number_of_seasons: 1, updated_at: '2026-04-15' },
    ];
    const payload = buildWidgetPayload({
      rows,
      stats: { films_watched: 0, shows_watched: 0 },
      episodesBySeason: {},
      liveNumberOfSeasons: {},
      airDatesByShow: {},
      movieRows: [],
    });
    expect(payload.shows[0].next_episode_air_date).toBeNull();
    expect(payload.shows[0].next_season_first_air_date).toBeNull();
  });
```

- [ ] **Step 2: Run tests — verify they fail with type / field missing**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npx jest __tests__/lib/widget-cache.test.ts -t "Phase 4c.3e" 2>&1 | tail -15
```

Expected: 2 tests fail. Errors will cite either "airDatesByShow is not a known property of BuildInput" or "next_episode_air_date is undefined" — either confirms the test infrastructure is running against not-yet-implemented code.

- [ ] **Step 3: Extend WidgetPayload TypeScript type**

Modify `lib/widget-bridge.ts`. Use Edit with:

old_string:
```typescript
    is_season_complete: boolean;
    has_next_season: boolean;
    next_season_number: number | null;
    is_show_complete: boolean;
    is_trophy: boolean;
    is_last_updated: boolean;
  }>;
```

new_string:
```typescript
    is_season_complete: boolean;
    has_next_season: boolean;
    next_season_number: number | null;
    is_show_complete: boolean;
    is_trophy: boolean;
    is_last_updated: boolean;
    // Phase 4c.3e: air date (ISO yyyy-MM-dd) of the next episode in currentSeason
    // (episode = currentEpisode+1). Null when catalog has no row or date is unknown.
    next_episode_air_date: string | null;
    // Phase 4c.3e: air date (ISO yyyy-MM-dd) of the first episode of nextSeasonNumber.
    // Null when !hasNextSeason or catalog has no row.
    next_season_first_air_date: string | null;
  }>;
```

- [ ] **Step 4: Extend BuildInput + buildWidgetPayload**

Modify `lib/widget-cache.ts`. Two Edits.

First Edit — update `BuildInput` type with airDatesByShow:

old_string:
```typescript
type BuildInput = {
  rows: WatchingRow[];
  stats: { films_watched: number; shows_watched: number };
  episodesBySeason: Record<string, number>; // key format: `${userTvShowId}-${seasonNumber}`. In Phase 1 this is ALWAYS {}.
  liveNumberOfSeasons: Record<string, number>; // NEW (Phase 3): userTvShowId → live N from TMDB
  movieRows: Array<{ tmdb_id: number; title: string; poster_path: string | null }>;
};
```

new_string:
```typescript
type BuildInput = {
  rows: WatchingRow[];
  stats: { films_watched: number; shows_watched: number };
  episodesBySeason: Record<string, number>; // key format: `${userTvShowId}-${seasonNumber}`. In Phase 1 this is ALWAYS {}.
  liveNumberOfSeasons: Record<string, number>; // NEW (Phase 3): userTvShowId → live N from TMDB
  // Phase 4c.3e: keyed by user_tv_show_id. nextEpisode = air_date of
  // (currentSeason, currentEpisode+1); nextSeasonFirst = air_date of
  // (nextSeasonNumber, 1) when hasNextSeason. Each may be null independently.
  airDatesByShow: Record<string, { nextEpisode: string | null; nextSeasonFirst: string | null }>;
  movieRows: Array<{ tmdb_id: number; title: string; poster_path: string | null }>;
};
```

Second Edit — update `buildWidgetPayload` signature and per-show return to include the new fields:

old_string:
```typescript
export function buildWidgetPayload({ rows, stats, episodesBySeason, liveNumberOfSeasons, movieRows }: BuildInput): WidgetPayload {
```

new_string:
```typescript
export function buildWidgetPayload({ rows, stats, episodesBySeason, liveNumberOfSeasons, airDatesByShow, movieRows }: BuildInput): WidgetPayload {
```

Third Edit — inject the new fields into the per-show object. Edit with:

old_string:
```typescript
      next_season_number: hasNextSeason ? row.current_season + 1 : null,
      is_show_complete: isShowComplete,
      is_trophy: row.is_trophy,
    };
```

new_string:
```typescript
      next_season_number: hasNextSeason ? row.current_season + 1 : null,
      is_show_complete: isShowComplete,
      is_trophy: row.is_trophy,
      // Phase 4c.3e: pulled from airDatesByShow map populated by fetchEpisodeAirDates
      next_episode_air_date: airDatesByShow[row.user_tv_show_id]?.nextEpisode ?? null,
      next_season_first_air_date: airDatesByShow[row.user_tv_show_id]?.nextSeasonFirst ?? null,
    };
```

- [ ] **Step 5: Update existing test call sites that pass to buildWidgetPayload**

There are ~6 existing test cases that call `buildWidgetPayload` without `airDatesByShow`. TypeScript will now flag them all. Update them to pass an empty object. Use Edit with `replace_all: true`:

old_string:
```
      episodesBySeason: {}, liveNumberOfSeasons: {}, movieRows: []
```

new_string:
```
      episodesBySeason: {}, liveNumberOfSeasons: {}, airDatesByShow: {}, movieRows: []
```

Note: this also updates the two new test cases you just wrote — they already have `airDatesByShow` explicitly, so the Edit won't match them (their line content differs). If the edit reports ambiguity, narrow the `old_string` further or edit each callsite individually.

Verify by re-reading the test file and confirming all `buildWidgetPayload` calls now include `airDatesByShow` in some form.

- [ ] **Step 6: Run tests — verify new tests pass, old tests still pass**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npx jest __tests__/lib/widget-cache.test.ts 2>&1 | tail -10
```

Expected: all tests pass (count should be baseline + 2). No TS errors.

- [ ] **Step 7: Run full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -10
```

Expected: 0 lint errors, 0 tsc errors, all tests passing (baseline was 762 — should now be 764).

- [ ] **Step 8: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
git add lib/widget-bridge.ts lib/widget-cache.ts __tests__/lib/widget-cache.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): Phase 4c.3e — RN payload type extension for air dates

Adds next_episode_air_date + next_season_first_air_date to the
WidgetPayload TypeScript type and BuildInput. buildWidgetPayload
pulls both from a new airDatesByShow map on BuildInput.

Task 2 follows to populate airDatesByShow via a batched
tv_show_episodes query.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: RN-side `fetchEpisodeAirDates` + wire into `syncWidgetCache`

**Context for implementer:** Build the batched Supabase query helper that populates `airDatesByShow` for the top-3 watching shows. Integrates alongside the existing `fetchSeasonEpisodeCounts` and `fetchShowDetails` parallel fetches. Fail-open on query error (empty map, widget falls back to tappable eyeball — zero regression from Task 1 state).

**Files:**
- Modify: `lib/widget-cache.ts`

- [ ] **Step 1: Add `fetchEpisodeAirDates` helper above `syncWidgetCache`**

Use Edit with:

old_string:
```typescript
export function buildWidgetPayload({ rows, stats, episodesBySeason, liveNumberOfSeasons, airDatesByShow, movieRows }: BuildInput): WidgetPayload {
```

new_string:
```typescript
/**
 * Phase 4c.3e: fetch air_date for the "next episode in current season" and
 * "first episode of next season" for each of the top 3 watching shows.
 * Single batched PostgREST query via .or() with and(...) tuples — one
 * round trip for up to 6 episodes.
 *
 * Fails open: any error returns an empty map. The widget then renders
 * tappable eyeballs / Start buttons as if this phase didn't ship,
 * matching pre-3e behavior.
 */
async function fetchEpisodeAirDates(
  rows: WatchingRow[],
  liveNumberOfSeasons: Record<string, number>
): Promise<Record<string, { nextEpisode: string | null; nextSeasonFirst: string | null }>> {
  const map: Record<string, { nextEpisode: string | null; nextSeasonFirst: string | null }> = {};
  const top3 = rows.filter((r) => !r.is_trophy).slice(0, 3);
  if (top3.length === 0) return map;

  // Build the (show, season, episode) tuple list covering both queries per show.
  const tuples: Array<{ userTvShowId: string; tmdbShowId: number; seasonNumber: number; episodeNumber: number; slot: 'nextEpisode' | 'nextSeasonFirst' }> = [];
  for (const row of top3) {
    // nextEpisode = (currentSeason, currentEpisode + 1)
    tuples.push({
      userTvShowId: row.user_tv_show_id,
      tmdbShowId: row.tmdb_id,
      seasonNumber: row.current_season,
      episodeNumber: row.current_episode + 1,
      slot: 'nextEpisode',
    });
    // nextSeasonFirst = (nextSeasonNumber, 1) when hasNextSeason. Uses
    // liveNumberOfSeasons-preferred total as buildWidgetPayload does later,
    // so the hasNextSeason check here matches payload rendering.
    const effectiveTotal = liveNumberOfSeasons[row.user_tv_show_id] ?? row.number_of_seasons;
    if (row.current_season < effectiveTotal) {
      tuples.push({
        userTvShowId: row.user_tv_show_id,
        tmdbShowId: row.tmdb_id,
        seasonNumber: row.current_season + 1,
        episodeNumber: 1,
        slot: 'nextSeasonFirst',
      });
    }
  }

  if (tuples.length === 0) return map;

  // PostgREST .or() with and(...) = composite-key IN semantics.
  // Example: .or('and(tmdb_show_id.eq.76479,season_number.eq.5,episode_number.eq.8),and(...)')
  const orClause = tuples
    .map((t) => `and(tmdb_show_id.eq.${t.tmdbShowId},season_number.eq.${t.seasonNumber},episode_number.eq.${t.episodeNumber})`)
    .join(',');

  try {
    const { data, error } = await supabase
      .from('tv_show_episodes')
      .select('tmdb_show_id, season_number, episode_number, air_date')
      .or(orClause);

    if (error || !data) {
      Sentry.addBreadcrumb({
        category: 'widget-cache',
        level: 'warning',
        message: 'tv_show_episodes air_date fetch failed',
        data: { error: error?.message ?? 'no data' },
      });
      return map;
    }

    // Build lookup: "${tmdb_show_id}:${season}:${episode}" → air_date
    const rowByTuple = new Map<string, string | null>();
    for (const r of data) {
      rowByTuple.set(`${r.tmdb_show_id}:${r.season_number}:${r.episode_number}`, r.air_date ?? null);
    }

    // Populate the per-show map using our original tuple list to know which row belongs where
    for (const t of tuples) {
      const key = `${t.tmdbShowId}:${t.seasonNumber}:${t.episodeNumber}`;
      const airDate = rowByTuple.get(key) ?? null;
      if (!map[t.userTvShowId]) {
        map[t.userTvShowId] = { nextEpisode: null, nextSeasonFirst: null };
      }
      map[t.userTvShowId][t.slot] = airDate;
    }
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'widget-cache',
      level: 'warning',
      message: 'tv_show_episodes air_date fetch threw',
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    if (__DEV__) console.warn('[widget-cache] tv_show_episodes air_date fetch threw', err);
  }

  return map;
}

export function buildWidgetPayload({ rows, stats, episodesBySeason, liveNumberOfSeasons, airDatesByShow, movieRows }: BuildInput): WidgetPayload {
```

- [ ] **Step 2: Wire `fetchEpisodeAirDates` into `syncWidgetCache`**

Use Edit with:

old_string:
```typescript
  // Phase 3: also fetch show-level details for live number_of_seasons
  // (fixes Start S{N+1} on airing shows where DB is stale)
  const [episodesBySeason, liveNumberOfSeasons] = await Promise.all([
    fetchSeasonEpisodeCounts(top3ForFetch),
    fetchShowDetails(top3ForFetch),
  ]);
```

new_string:
```typescript
  // Phase 3: also fetch show-level details for live number_of_seasons
  // (fixes Start S{N+1} on airing shows where DB is stale)
  const [episodesBySeason, liveNumberOfSeasons] = await Promise.all([
    fetchSeasonEpisodeCounts(top3ForFetch),
    fetchShowDetails(top3ForFetch),
  ]);

  // Phase 4c.3e: fetch air_date for next episode + next-season first episode.
  // Runs AFTER fetchShowDetails so the liveNumberOfSeasons override is
  // available to determine hasNextSeason consistency with buildWidgetPayload.
  const airDatesByShow = await fetchEpisodeAirDates(top3ForFetch, liveNumberOfSeasons);
```

- [ ] **Step 3: Pass `airDatesByShow` into `buildWidgetPayload` call**

Use Edit with:

old_string:
```typescript
  const payload = buildWidgetPayload({
    rows,
    stats: {
      films_watched: filmsRes.count ?? 0,
      shows_watched: showsRes.count ?? 0,
    },
    episodesBySeason: mergedCounts,   // Phase 4b.2: merged (cache + fresh) so failed fetches fall back to cached values
    liveNumberOfSeasons,
    movieRows: movieRows ?? [],
  });
```

new_string:
```typescript
  const payload = buildWidgetPayload({
    rows,
    stats: {
      films_watched: filmsRes.count ?? 0,
      shows_watched: showsRes.count ?? 0,
    },
    episodesBySeason: mergedCounts,   // Phase 4b.2: merged (cache + fresh) so failed fetches fall back to cached values
    liveNumberOfSeasons,
    airDatesByShow,                   // Phase 4c.3e: air dates for unaired-episode and next-season badges
    movieRows: movieRows ?? [],
  });
```

- [ ] **Step 4: Run pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -10
```

Expected: clean. No new tests added in this task (fetch function would require mocking at the supabase chain level — existing test suite doesn't have integration coverage for this, and the new behavior is covered via the Task 1 tests on buildWidgetPayload + device validation). The fetch is a read-through helper; its correctness is observable through the payload's new fields being populated on real data.

- [ ] **Step 5: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
git add lib/widget-cache.ts
git commit -m "$(cat <<'EOF'
feat(widget): Phase 4c.3e — fetch next-episode and next-season air dates

Adds fetchEpisodeAirDates helper: one batched PostgREST .or(and(...))
query covering up to 6 episodes across the top 3 watching shows. Uses
live number_of_seasons (post-Phase 3) to decide hasNextSeason for
consistency with buildWidgetPayload.

Fails open on error — empty map yields null air-date fields, widget
falls back to tappable eyeball (pre-3e behavior).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Swift payload + helpers + widget view integration

**Context for implementer:** Three Swift-side changes in one commit. They're tightly coupled — the payload fields must exist before the helpers can consume them; the helpers must exist before the views can render; shipping any piece independently produces a half-state that can't be observed.

Widget extension has no Swift test target. Do not attempt to add one. Validation is `npm run lint && npx tsc --noEmit && npm test` (catches TS-side regressions) + device build at Task 4.

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift`
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Networking/WidgetDataWriter.swift`
- Create: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/AirDateBadge.swift`
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift`
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift`

### Step block A: Payload fields (`WidgetData.swift`)

- [ ] **Step 1: Add properties to `Show` struct**

Use Edit with:

old_string:
```swift
    let isTrophy: Bool
    let isLastUpdated: Bool

    // Explicit memberwise init — required because the custom init(from:) below
    // suppresses Swift's synthesized memberwise initializer.
    // isTrophy and isLastUpdated default to false so pre-Phase-4a callers compile.
    init(
        userTvShowId: String,
        tmdbId: Int,
        name: String,
        posterFilename: String?,
        currentSeason: Int,
        currentEpisode: Int,
        totalSeasons: Int,
        totalEpisodesInCurrentSeason: Int?,
        episodesBySeason: [String: Int],
        isSeasonComplete: Bool,
        hasNextSeason: Bool,
        nextSeasonNumber: Int?,
        isShowComplete: Bool,
        isTrophy: Bool = false,
        isLastUpdated: Bool = false
    ) {
```

new_string:
```swift
    let isTrophy: Bool
    let isLastUpdated: Bool
    // Phase 4c.3e: ISO-8601 date (yyyy-MM-dd) for the next episode in
    // currentSeason (episode = currentEpisode+1). Null when the catalog
    // has no row or date is unknown.
    let nextEpisodeAirDate: String?
    // Phase 4c.3e: ISO-8601 date for the first episode of nextSeasonNumber.
    // Null when !hasNextSeason or catalog has no row.
    let nextSeasonFirstAirDate: String?

    // Explicit memberwise init — required because the custom init(from:) below
    // suppresses Swift's synthesized memberwise initializer.
    // isTrophy and isLastUpdated default to false so pre-Phase-4a callers compile.
    // nextEpisodeAirDate / nextSeasonFirstAirDate default to nil so pre-Phase-4c.3e
    // callers compile.
    init(
        userTvShowId: String,
        tmdbId: Int,
        name: String,
        posterFilename: String?,
        currentSeason: Int,
        currentEpisode: Int,
        totalSeasons: Int,
        totalEpisodesInCurrentSeason: Int?,
        episodesBySeason: [String: Int],
        isSeasonComplete: Bool,
        hasNextSeason: Bool,
        nextSeasonNumber: Int?,
        isShowComplete: Bool,
        isTrophy: Bool = false,
        isLastUpdated: Bool = false,
        nextEpisodeAirDate: String? = nil,
        nextSeasonFirstAirDate: String? = nil
    ) {
```

- [ ] **Step 2: Assign new properties in memberwise init body**

Use Edit with:

old_string:
```swift
        self.isTrophy = isTrophy
        self.isLastUpdated = isLastUpdated
    }

    enum CodingKeys: String, CodingKey {
```

new_string:
```swift
        self.isTrophy = isTrophy
        self.isLastUpdated = isLastUpdated
        self.nextEpisodeAirDate = nextEpisodeAirDate
        self.nextSeasonFirstAirDate = nextSeasonFirstAirDate
    }

    enum CodingKeys: String, CodingKey {
```

- [ ] **Step 3: Add coding keys**

Use Edit with:

old_string:
```swift
        case isTrophy = "is_trophy"
        case isLastUpdated = "is_last_updated"
    }
```

new_string:
```swift
        case isTrophy = "is_trophy"
        case isLastUpdated = "is_last_updated"
        case nextEpisodeAirDate = "next_episode_air_date"
        case nextSeasonFirstAirDate = "next_season_first_air_date"
    }
```

- [ ] **Step 4: Decode with `decodeIfPresent` for backwards compat**

Use Edit with:

old_string:
```swift
        // v2 fields default to false when decoding v1 cache
        isTrophy = try c.decodeIfPresent(Bool.self, forKey: .isTrophy) ?? false
        isLastUpdated = try c.decodeIfPresent(Bool.self, forKey: .isLastUpdated) ?? false
    }
}
```

new_string:
```swift
        // v2 fields default to false when decoding v1 cache
        isTrophy = try c.decodeIfPresent(Bool.self, forKey: .isTrophy) ?? false
        isLastUpdated = try c.decodeIfPresent(Bool.self, forKey: .isLastUpdated) ?? false
        // Phase 4c.3e: v3 air-date fields default to nil when decoding v2 cache
        nextEpisodeAirDate = try c.decodeIfPresent(String.self, forKey: .nextEpisodeAirDate)
        nextSeasonFirstAirDate = try c.decodeIfPresent(String.self, forKey: .nextSeasonFirstAirDate)
    }
}
```

### Step block B: Propagate fields in `WidgetDataWriter.swift`

- [ ] **Step 5: Update `markEpisodeWatched` mutation to carry the new fields**

Use Edit with:

old_string:
```swift
            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: old.currentSeason,
                currentEpisode: newEpisode,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: old.totalEpisodesInCurrentSeason,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: old.hasNextSeason,
                nextSeasonNumber: old.nextSeasonNumber,
                isShowComplete: isSeasonComplete && !old.hasNextSeason,
                isTrophy: old.isTrophy,
                isLastUpdated: old.isLastUpdated
            )

            return WidgetData(version: data.version, cachedAt: data.cachedAt, stats: data.stats, shows: shows, movies: data.movies)
        }
    }

    /// Advances current_season by 1 and sets current_episode to 1 (per design Q1).
```

new_string:
```swift
            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: old.currentSeason,
                currentEpisode: newEpisode,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: old.totalEpisodesInCurrentSeason,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: old.hasNextSeason,
                nextSeasonNumber: old.nextSeasonNumber,
                isShowComplete: isSeasonComplete && !old.hasNextSeason,
                isTrophy: old.isTrophy,
                isLastUpdated: old.isLastUpdated,
                // Phase 4c.3e: preserve air-date fields through the patch.
                // They're read-through from the cached row — the next widget
                // sync refreshes them based on the new currentEpisode.
                nextEpisodeAirDate: old.nextEpisodeAirDate,
                nextSeasonFirstAirDate: old.nextSeasonFirstAirDate
            )

            return WidgetData(version: data.version, cachedAt: data.cachedAt, stats: data.stats, shows: shows, movies: data.movies)
        }
    }

    /// Advances current_season by 1 and sets current_episode to 1 (per design Q1).
```

- [ ] **Step 6: Update `advanceSeason` mutation to carry the new fields**

Use Edit with:

old_string:
```swift
            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: newSeason,
                currentEpisode: 1,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: newTotalInSeason > 0 ? newTotalInSeason : nil,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: hasNext,
                nextSeasonNumber: hasNext ? newSeason + 1 : nil,
                isShowComplete: isSeasonComplete && !hasNext,
                isTrophy: old.isTrophy,
                isLastUpdated: old.isLastUpdated
            )
```

new_string:
```swift
            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: newSeason,
                currentEpisode: 1,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: newTotalInSeason > 0 ? newTotalInSeason : nil,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: hasNext,
                nextSeasonNumber: hasNext ? newSeason + 1 : nil,
                isShowComplete: isSeasonComplete && !hasNext,
                isTrophy: old.isTrophy,
                isLastUpdated: old.isLastUpdated,
                // Phase 4c.3e: stale dates after season advance — next sync
                // refreshes them for the new season's (episode 1) lookup.
                // Leaving them from the old value is fine for one timeline cycle.
                nextEpisodeAirDate: old.nextEpisodeAirDate,
                nextSeasonFirstAirDate: old.nextSeasonFirstAirDate
            )
```

### Step block C: Create `AirDateBadge.swift`

- [ ] **Step 7: Create the new file with helpers + badge view**

Use Write on `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks/expo-plugins/widget-extension/src/PocketStubsWidget/Views/AirDateBadge.swift`:

```swift
import SwiftUI

/// Returns true when the given ISO-8601 calendar date (yyyy-MM-dd) is
/// strictly after today in the current (local) calendar. nil or malformed
/// inputs return false — callers should fall back to the tappable/default UI.
func isAirDateFuture(_ iso: String?, now: Date = Date(), calendar: Calendar = .current) -> Bool {
    guard let iso = iso else { return false }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    // Parse as local calendar date — TMDB air_date is a calendar day
    // (yyyy-MM-dd), not an instant. Using local tz means "Airs Thursday"
    // means "aim to watch on your Thursday."
    guard let airDate = formatter.date(from: iso) else { return false }
    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    return air > today
}

/// Formats an ISO-8601 calendar date string into widget-friendly "airs X" text:
///   - 1–6 days away  → weekday name (e.g., "Friday", including days=1 which is tomorrow's weekday)
///   - 7d–1y away     → short month-day (e.g., "Apr 29")
///   - >1y away       → year only ("2027")
///   - parse failure  → "soon"
///   - <=0 days       → "soon" (guard; callers should gate with isAirDateFuture)
func formatAirDate(_ iso: String, now: Date = Date(), calendar: Calendar = .current) -> String {
    let parser = DateFormatter()
    parser.dateFormat = "yyyy-MM-dd"
    guard let airDate = parser.date(from: iso) else { return "soon" }

    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    let days = calendar.dateComponents([.day], from: today, to: air).day ?? 0

    if days <= 0 {
        return "soon"
    } else if days <= 6 {
        let weekday = DateFormatter()
        weekday.dateFormat = "EEEE"
        return weekday.string(from: airDate)
    } else if days <= 365 {
        let shortDate = DateFormatter()
        shortDate.dateFormat = "MMM d"
        return shortDate.string(from: airDate)
    } else {
        let yearOnly = DateFormatter()
        yearOnly.dateFormat = "yyyy"
        return yearOnly.string(from: airDate)
    }
}

/// Orange capsule pill for "Airs X" text. Non-interactive.
/// Used in two places:
///   1. Replacing the EyeballButton when the next episode is unaired
///   2. Replacing the "Start S0N" button when the next season's E01 is unaired
struct AirDateBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(.orange)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.orange.opacity(0.18))
            .clipShape(Capsule())
            .overlay(
                Capsule().strokeBorder(Color.orange.opacity(0.35), lineWidth: 0.5)
            )
    }
}
```

### Step block D: Widget view integration

- [ ] **Step 8: Update `WidgetView.swift` `ShowCard` to branch on air date**

Use Edit with:

old_string:
```swift
            Group {
                if show.isTrophy {
                    EmptyView()
                } else if show.isSeasonComplete {
                    SeasonCompleteBadge(show: show)
                } else {
                    VStack(spacing: 2) {
                        Text(episodeLabel)
                            .font(.caption2)
                            .foregroundColor(.primary)
                        EyeballButton(show: show)
                    }
                }
            }
```

new_string:
```swift
            Group {
                if show.isTrophy {
                    EmptyView()
                } else if show.isSeasonComplete {
                    SeasonCompleteBadge(show: show)
                } else {
                    VStack(spacing: 2) {
                        Text(episodeLabel)
                            .font(.caption2)
                            .foregroundColor(.primary)
                        // Phase 4c.3e: orange "Airs X" pill replaces eyeball
                        // when the next episode is unaired. Nil / past air
                        // dates fall through to the tappable eyeball.
                        if isAirDateFuture(show.nextEpisodeAirDate),
                           let airDate = show.nextEpisodeAirDate {
                            AirDateBadge(text: "Airs \(formatAirDate(airDate))")
                        } else {
                            EyeballButton(show: show)
                        }
                    }
                }
            }
```

- [ ] **Step 9: Update `SeasonCompleteBadge.swift` to branch on next-season air date**

Use Edit with:

old_string:
```swift
            if show.hasNextSeason, let next = show.nextSeasonNumber {
                Button(intent: StartNextSeasonIntent(
                    userTvShowId: show.userTvShowId,
                    tmdbShowId: show.tmdbId,
                    newSeasonNumber: next
                )) {
                    Text("Start S\(String(format: "%02d", next))")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.primary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Color(.tertiarySystemFill))
                        .clipShape(Capsule())
                        // Phase 3: bounce when season advances (post-success reload)
                        .symbolEffect(.bounce, value: show.currentSeason)
                        // Phase 3: expand hit target ~8pt on each side toward 44pt HIG
                        .contentShape(Rectangle().inset(by: -8))
                }
                .buttonStyle(.plain)
            }
```

new_string:
```swift
            if show.hasNextSeason, let next = show.nextSeasonNumber {
                // Phase 4c.3e: orange "S0N airs X" pill replaces the Start button
                // when the next season's first episode is unaired. Nil / past air
                // dates fall through to the existing tappable Start button.
                if isAirDateFuture(show.nextSeasonFirstAirDate),
                   let airDate = show.nextSeasonFirstAirDate {
                    AirDateBadge(text: "S\(String(format: "%02d", next)) airs \(formatAirDate(airDate))")
                } else {
                    Button(intent: StartNextSeasonIntent(
                        userTvShowId: show.userTvShowId,
                        tmdbShowId: show.tmdbId,
                        newSeasonNumber: next
                    )) {
                        Text("Start S\(String(format: "%02d", next))")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.primary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(Capsule())
                            // Phase 3: bounce when season advances (post-success reload)
                            .symbolEffect(.bounce, value: show.currentSeason)
                            // Phase 3: expand hit target ~8pt on each side toward 44pt HIG
                            .contentShape(Rectangle().inset(by: -8))
                    }
                    .buttonStyle(.plain)
                }
            }
```

### Step block E: Verify + commit

- [ ] **Step 10: Run pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -10
```

Expected: clean. TS/test count unchanged from Task 2. Swift files aren't checked here — validated at device-build time in Task 4.

- [ ] **Step 11: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
git add expo-plugins/widget-extension/src/PocketStubsWidget/Models/WidgetData.swift expo-plugins/widget-extension/src/PocketStubsWidget/Networking/WidgetDataWriter.swift expo-plugins/widget-extension/src/PocketStubsWidget/Views/AirDateBadge.swift expo-plugins/widget-extension/src/PocketStubsWidget/WidgetView.swift expo-plugins/widget-extension/src/PocketStubsWidget/Views/SeasonCompleteBadge.swift
git commit -m "$(cat <<'EOF'
feat(widget): Phase 4c.3e — Swift payload + AirDateBadge + view integration

Adds next_episode_air_date and next_season_first_air_date to the Show
Codable struct (v2→v3 decodeIfPresent for backwards compat). New
AirDateBadge view with formatAirDate + isAirDateFuture pure helpers.

WidgetView branches on isAirDateFuture(nextEpisodeAirDate) in the
non-complete bottom block: future air date → orange "Airs Friday"
pill; nil or past → tappable eyeball (unchanged).

SeasonCompleteBadge branches on isAirDateFuture(nextSeasonFirstAirDate):
future → orange "S0N airs Friday" pill; nil or past → tappable Start
S0N button (unchanged).

Date format: 1–6 days = weekday name, 7d–1y = "MMM d", >1y = "yyyy".
Local-calendar comparison so rollover happens at local midnight even
if the payload hasn't resynced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Device validation

**Context for implementer:** Manual verification that the Swift changes render correctly on device. Takes ~10 minutes including build time.

**Files:** None if tests pass. If a test fails, fix in Task 3 with a follow-up commit.

- [ ] **Step 1: Build + install on device**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
npx expo prebuild --clean
npx expo run:ios --device
```

Alternative: EAS build if that's the preferred distribution mechanism — ask the driver.

- [ ] **Step 2: Trigger a fresh widget sync**

On device: open the app, let it sit for ~5 seconds so `useWidgetSync` runs on foreground, then send to background so the widget picks up the new payload. Verify widget has loaded the new data by observing any UI change (e.g., a newly-aired episode count) vs the pre-update state.

- [ ] **Step 3: Verify sub-feature A — unaired next episode shows badge**

Pick a Returning Series mid-season where user has watched all aired episodes and the next one is unaired. From earlier sessions, Daredevil S2 (if still mid-season) or The Boys S5 are known candidates.

Expected:
- Episode label shows `S0N · E0M+1` (the unaired episode)
- Below the label: **orange pill** text "Airs \<weekday-or-date\>" (e.g., "Airs Friday"), NO eyeball button visible
- Tapping the pill does nothing (non-interactive)
- Tapping the poster still deep-links to the show detail screen (existing `widgetURL`)

- [ ] **Step 4: Verify sub-feature B — next-season waiting shows badge**

Pick a show where the user is caught up (`isSeasonComplete=true`) and has a next season whose E01 hasn't aired. If no such show exists in the test device's watchlist, either:
- Add a currently-airing-soon show and catch up to the current finale
- Manually SQL-update a test `user_tv_shows` row's `current_episode` to match the season's total episode count so `isSeasonComplete` flips to true

Expected:
- "Completed!" label (green) stays at the top
- Below: **orange pill** "S\<N+1\> airs \<weekday-or-date\>" (e.g., "S06 airs May 3"), NO "Start S0N" button visible
- Tapping the pill does nothing

- [ ] **Step 5: Verify the baseline non-3e states still work**

Pick a show where the next episode HAS aired (air_date ≤ today):
- Episode label renders
- Tappable eyeball below, tap → bounces + increments (4c.3c behavior intact)

Pick a caught-up show where the next season's E01 has already aired:
- "Completed!" + tappable "Start S0N" button renders
- Tap → advances to next season

- [ ] **Step 6: Verify backwards compat (v2→v3 payload decode)**

If you have a pre-update build of the widget still running on the device, OR if the new payload reached the widget before the widget extension was updated, decoding the new payload with v2 code should not crash (the new fields are ignored by older code). Similarly, the new Swift code decoding a v2 payload should render tappable eyeballs everywhere (new fields default to nil → badges not shown).

If the above isn't easily testable without a second device, skip — the `decodeIfPresent` pattern is trusted based on prior additions (isLastUpdated, isTrophy, movies).

- [ ] **Step 7: Note any issues and commit follow-up fixes if needed**

If any test fails, amend Task 3 with a fix commit. Do not proceed to Task 5 until device validation passes for both sub-features.

---

## Task 5: PR + code review + squash-merge + vault update

**Context for implementer:** Final push. Follows the 4c.3c pattern: push branch, open PR, dispatch final code review, wait for CI, squash-merge, update vault.

- [ ] **Step 1: Push feature branch**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
git push -u origin feat/widget-4c3e-widget-ux-unlocks 2>&1 | tail -3
```

- [ ] **Step 2: Open PR**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
gh pr create --title "feat(widget): Phase 4c.3e — proactive unaired-episode + next-season badges" --body "$(cat <<'EOF'
## Summary

- Replaces the widget eyeball button with an orange "Airs Friday" pill when the next episode's `air_date > today`
- Replaces the "Start S0N" button with an orange "S0N airs Friday" pill when the next season's E01 is unaired
- Closes out Phase 4c by making the 4c.3c server-side rejection path unreachable in the common case (user sees the badge and knows not to tap)

## Design decisions

| Decision | Value |
|--|--|
| Payload shape | Two flat nullable ISO-date fields: `next_episode_air_date`, `next_season_first_air_date` |
| Badge text | 1–6 days → weekday name, 7d–1y → "MMM d", >1y → year |
| Unaired eyeball replacement | Entire slot replaced by the pill (no greyed-out eyeball, no hybrid) |
| Next-season waiting | Same orange pill style for consistency with sub-feature A |
| Nil air_date fallback | Render tappable eyeball / Start button (pre-3e behavior) |
| Date comparison | Widget-side at render time, local calendar, so transitions happen at local midnight even if payload is stale |

Full spec: `docs/superpowers/specs/2026-04-22-widget-phase-4c3e-widget-ux-unlocks-design.md`.

## Test plan

- [x] RN unit tests — 2 new cases for `buildWidgetPayload` populating / defaulting the air-date fields
- [x] Pre-PR check clean (`npm run lint && npx tsc --noEmit && npm test` → baseline +2)
- [x] Device validation: sub-feature A (unaired next episode → orange pill, no eyeball), sub-feature B (next-season waiting → orange pill, no Start button), existing states intact (tappable eyeball + bounce, tappable Start button)

## Changed

- `lib/widget-bridge.ts` — extend WidgetPayload TypeScript type with `next_episode_air_date`, `next_season_first_air_date`
- `lib/widget-cache.ts` — new `fetchEpisodeAirDates` helper (batched PostgREST `.or()` query); wired into `syncWidgetCache`; `buildWidgetPayload` reads from new `airDatesByShow` BuildInput map
- `__tests__/lib/widget-cache.test.ts` — 2 new tests; existing `buildWidgetPayload` calls updated to pass `airDatesByShow: {}`
- `expo-plugins/widget-extension/.../Models/WidgetData.swift` — Show struct fields + v2→v3 decodeIfPresent
- `expo-plugins/widget-extension/.../Networking/WidgetDataWriter.swift` — propagate new fields through `markEpisodeWatched` / `advanceSeason` patches
- `expo-plugins/widget-extension/.../Views/AirDateBadge.swift` (new) — `formatAirDate`, `isAirDateFuture`, `AirDateBadge` view
- `expo-plugins/widget-extension/.../WidgetView.swift` — branch on `isAirDateFuture(nextEpisodeAirDate)` in non-complete bottom block
- `expo-plugins/widget-extension/.../Views/SeasonCompleteBadge.swift` — branch on `isAirDateFuture(nextSeasonFirstAirDate)` for Start S0N button replacement

## Not changed

- No backend work (no migrations, no edge functions)
- No payload version bump (v2 stays; `decodeIfPresent` handles v2→v3 compat same as prior additions)
- `EyeballButton.swift` (4c.3c pulse logic stays — unreachable in practice once A lands, but kept as defense-in-depth fallback)
- Bulk-path RPCs and TS filters (out of scope per 4c.3c discussion)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

- [ ] **Step 3: Dispatch final code review via the code-reviewer agent**

Use the Agent tool with `subagent_type: "superpowers:code-reviewer"`. Provide: the PR URL, branch name, commit range, and the spec file path for reference. Focus areas to call out: PostgREST `.or(and(...))` correctness; iOS 17 compat of all SwiftUI APIs used (no accidental iOS 18 APIs like `.wiggle` repeat); modifier order in view hierarchy; backwards-compat of the decodeIfPresent pattern.

Address any Critical / Important issues with follow-up commits on the branch. Minor nits → defer or ignore.

- [ ] **Step 4: Wait for CI**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
gh pr checks 2>&1 | tail -8
```

Expected: `Lint, Types & Tests` pass. `Cloudflare Pages` + `Vercel` pass. `Security Audit` is known-pre-existing noise (transitive Expo deps) — not a blocker.

- [ ] **Step 5: Squash-merge**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3e-widget-ux-unlocks
gh pr merge --squash --auto 2>&1 | tail -3
```

- [ ] **Step 6: Update vault**

Use `mcp__obsidian__patch_note` to update `Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards.md`:
- Change section 3e heading from "3e. Widget UX unlocks (built on 3b)" to "3e. Widget UX unlocks — SHIPPED \<YYYY-MM-DD\> (PR #\<NUM\>)"
- Note Phase 4c is now complete; remaining work is the "Widget Phase 4d — ???" or new phase to be brainstormed

Use `mcp__obsidian__patch_note` to append to today's daily note under `## Shipped` — add PR #\<NUM\> with the one-sentence summary.

Expected: vault reflects 3e shipped. Phase 4c queue is closed out.

---

## Self-Review

**Spec coverage check:**
- Payload shape (two flat fields) → Task 1 (RN) + Task 3 step block A (Swift) ✓
- RN-side fetchEpisodeAirDates batched query → Task 2 ✓
- `formatAirDate` + `isAirDateFuture` pure functions → Task 3 step 7 ✓
- `AirDateBadge` view → Task 3 step 7 ✓
- `WidgetView.swift` branch for sub-feature A → Task 3 step 8 ✓
- `SeasonCompleteBadge.swift` branch for sub-feature B → Task 3 step 9 ✓
- WidgetDataWriter propagates new fields → Task 3 step 5-6 ✓
- Backwards-compat via decodeIfPresent → Task 3 step 4 ✓
- Nil fallback renders tappable controls → Task 3 step 8-9 (if/else branch) ✓
- Date comparison local-calendar → Task 3 step 7 (AirDateBadge.swift body) ✓
- RN unit tests for 2 buildWidgetPayload cases → Task 1 step 1 ✓
- Device validation of sub-features A + B + fallback paths → Task 4 ✓
- Out-of-scope items (sub-feature C, test target) → not implemented ✓

**Placeholder scan:** No "TBD", no "add validation here," no bare "Similar to Task N." All Swift and TypeScript code blocks are reproduced in full. Exact commit messages spelled out. Commands include expected output where relevant.

**Type consistency:**
- TS field name: `next_episode_air_date` / `next_season_first_air_date` used in both `lib/widget-bridge.ts`, `lib/widget-cache.ts`, test files, and widget code keys — identical everywhere.
- Swift field name: `nextEpisodeAirDate` / `nextSeasonFirstAirDate` (camelCase) paired with `next_episode_air_date` / `next_season_first_air_date` (snake_case) CodingKeys — matches other fields' pattern.
- Helper function names: `isAirDateFuture`, `formatAirDate`, `AirDateBadge` — used consistently in WidgetView, SeasonCompleteBadge, and AirDateBadge.swift itself.
- `airDatesByShow` in BuildInput matches both the `fetchEpisodeAirDates` return type AND the consumer access pattern in `buildWidgetPayload`.

No issues identified.
