# SP4-C Trailer Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a "Play Trailer ▶" button on each calendar release card; tap opens the YouTube trailer externally.

**Architecture:** Prefetch the trailer's YouTube key into a new `release_calendar.trailer_youtube_key` column via the existing warming worker AND user-driven enrichment paths. Client reads the key from the calendar query payload — zero per-card TMDB calls. New pure helper `selectBestTrailer` picks the best video from TMDB's `/movie/{id}/videos` response. Client wiring adds a conditional button to `release-card.tsx` that calls `Linking.openURL`.

**Tech Stack:** Deno (Supabase Edge Functions), Postgres migrations, TypeScript, Jest, React Native (`Linking` from `react-native` core, `Ionicons`), Supabase JS v2.

**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-trailer-thumbnails` on branch `feat/sp4-c-trailer-thumbnails` (already created off `origin/main` at `c44cb57`, `.env.local` copied, `npm install` complete).

**Spec:** `docs/superpowers/specs/2026-04-27-sp4-c-trailer-thumbnails-design.md`

---

## File Structure

**Create:**
- `supabase/functions/_shared/select-best-trailer.ts` — pure helper, ~40 LOC
- `supabase/migrations/<timestamp>_add_release_calendar_trailer_youtube_key.sql` — single ALTER TABLE
- `lib/trailer-utils.ts` — client-side `openTrailer(key)` helper, ~10 LOC
- `__tests__/edge-functions/select-best-trailer.test.ts` — Jest unit tests for helper, 8 cases
- `__tests__/lib/trailer-utils.test.ts` — Jest test for openTrailer

**Modify:**
- `supabase/functions/enrich-release-calendar/index.ts` — add parallel videos fetch + selectBestTrailer + new `trailer_youtube_key` field on row
- `supabase/functions/warm-release-calendar/index.ts` — same pattern in the per-movie loop
- `lib/tmdb.types.ts:396` — add `trailer_youtube_key: string | null` to `CalendarRelease` interface
- `lib/release-calendar-service.ts:37,50` — add `trailer_youtube_key` to the explicit `select()` string AND the row-to-CalendarRelease mapping
- `components/calendar/release-card.tsx` — conditional Play Trailer button + new style entries

**Spec correction noted:** the spec says `getReleaseCalendar()` does `select('*')` so the new column flows through automatically. **It does not** — line 37 uses an explicit column list. The plan adds it to both the SELECT and the row mapping.

---

## Task 1: Migration — add `trailer_youtube_key` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_release_calendar_trailer_youtube_key.sql`

- [ ] **Step 1.1: Generate the migration filename**

Use UTC timestamp in the format the codebase uses (`YYYYMMDDHHMMSS_*.sql`). Example: `20260428000000_add_release_calendar_trailer_youtube_key.sql`. Use any specific UTC timestamp for the calendar day; the suffix is convention.

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-trailer-thumbnails
TS=$(date -u +%Y%m%d%H%M%S)
echo "supabase/migrations/${TS}_add_release_calendar_trailer_youtube_key.sql"
```

- [ ] **Step 1.2: Create the migration file**

```sql
-- supabase/migrations/<timestamp>_add_release_calendar_trailer_youtube_key.sql
ALTER TABLE public.release_calendar
ADD COLUMN trailer_youtube_key TEXT;

-- No backfill needed; warming worker + per-movie enrichment populate over time.
-- Existing rows have trailer_youtube_key = NULL → client renders without "Play Trailer" button.
```

- [ ] **Step 1.3: Apply the migration via Supabase MCP**

The controller (you, if doing this inline) applies the migration via:

```
mcp__plugin_supabase_supabase__apply_migration
  project_id: wliblwulvsrfgqcnbzeh
  name: add_release_calendar_trailer_youtube_key
  query: <the SQL from Step 1.2>
```

Verification SQL (also via MCP):

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'release_calendar'
  AND column_name = 'trailer_youtube_key';
```

Expected: 1 row, `data_type=text`, `is_nullable=YES`.

- [ ] **Step 1.4: Commit the migration file**

```bash
git add supabase/migrations/*_add_release_calendar_trailer_youtube_key.sql
git commit -m "feat(calendar): migration — add release_calendar.trailer_youtube_key

Nullable TEXT column for the YouTube video key of a movie's primary
trailer. Populated by warming worker + per-movie enrichment over time.
NULL is treated as 'no trailer' on the client (graceful — button hidden).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Helper — `selectBestTrailer` (TDD)

**Files:**
- Create: `supabase/functions/_shared/select-best-trailer.ts`
- Create: `__tests__/edge-functions/select-best-trailer.test.ts`

The helper lives in the supabase functions `_shared/` dir but is imported by Jest tests via relative path. If Jest can't resolve, the fallback is to mirror the helper to `lib/trailer/select-best-trailer.ts` and have both Deno + Jest import it. Try the direct path first.

- [ ] **Step 2.1: Write the failing tests**

Create `__tests__/edge-functions/select-best-trailer.test.ts`:

```ts
import { selectBestTrailer, type TMDBVideosResponse } from '../../supabase/functions/_shared/select-best-trailer';

function makeVideo(overrides: Partial<{
  site: string;
  type: string;
  key: string;
  official: boolean;
  published_at: string;
}> = {}) {
  return {
    iso_639_1: 'en',
    iso_3166_1: 'US',
    name: 'Trailer',
    key: overrides.key ?? 'KEY1',
    site: overrides.site ?? 'YouTube',
    size: 1080,
    type: overrides.type ?? 'Trailer',
    official: overrides.official ?? true,
    published_at: overrides.published_at ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('selectBestTrailer', () => {
  it('returns null for empty results', () => {
    const response: TMDBVideosResponse = { results: [] };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns null when only Vimeo videos exist', () => {
    const response: TMDBVideosResponse = {
      results: [makeVideo({ site: 'Vimeo' })],
    };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns null when only Featurette/BTS types exist', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Featurette' }),
        makeVideo({ type: 'Behind the Scenes' }),
      ],
    };
    expect(selectBestTrailer(response)).toBeNull();
  });

  it('returns the key of a single official YouTube Trailer', () => {
    const response: TMDBVideosResponse = {
      results: [makeVideo({ key: 'TRAILER_KEY' })],
    };
    expect(selectBestTrailer(response)).toBe('TRAILER_KEY');
  });

  it('prefers Trailer over Teaser', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Teaser', key: 'TEASER' }),
        makeVideo({ type: 'Trailer', key: 'TRAILER' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('TRAILER');
  });

  it('prefers official over unofficial when types match', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ official: false, key: 'UNOFFICIAL' }),
        makeVideo({ official: true, key: 'OFFICIAL' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('OFFICIAL');
  });

  it('prefers most-recent published_at when type and official match', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ published_at: '2026-01-01T00:00:00.000Z', key: 'OLD' }),
        makeVideo({ published_at: '2026-06-01T00:00:00.000Z', key: 'NEW' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('NEW');
  });

  it('type rank beats official status (official Teaser loses to unofficial Trailer)', () => {
    const response: TMDBVideosResponse = {
      results: [
        makeVideo({ type: 'Teaser', official: true, key: 'OFFICIAL_TEASER' }),
        makeVideo({ type: 'Trailer', official: false, key: 'UNOFFICIAL_TRAILER' }),
      ],
    };
    expect(selectBestTrailer(response)).toBe('UNOFFICIAL_TRAILER');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
npx jest __tests__/edge-functions/select-best-trailer.test.ts
```

Expected: FAIL — `Cannot find module '.../select-best-trailer'` (file doesn't exist yet).

If Jest reports a path resolution error specifically about the `supabase/functions/_shared/` location not being importable, fall back: create the helper at `lib/trailer/select-best-trailer.ts` instead, update both the test import path and the edge functions' import paths in Tasks 3-4 to use that location. Stop and report this finding before proceeding.

- [ ] **Step 2.3: Create the helper**

Create `supabase/functions/_shared/select-best-trailer.ts`:

```ts
interface TMDBVideo {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TMDBVideosResponse {
  results: TMDBVideo[];
}

const TYPE_RANK: Record<string, number> = {
  Trailer: 0,
  Teaser: 1,
  Clip: 2,
};

/**
 * Picks a single best YouTube trailer key from a TMDB videos response,
 * or null if nothing qualifies.
 *
 * Heuristic (ranked):
 *   1. Filter to site === 'YouTube' (Vimeo / TMDB-hosted skipped)
 *   2. Filter to type ∈ {'Trailer', 'Teaser', 'Clip'} (skip Featurette, BTS, etc.)
 *   3. Sort by:
 *      - type rank (Trailer < Teaser < Clip)
 *      - official: true before false
 *      - published_at descending (most recent)
 *   4. Take the first
 */
export function selectBestTrailer(response: TMDBVideosResponse): string | null {
  const candidates = response.results.filter(
    (v) => v.site === 'YouTube' && v.type in TYPE_RANK
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ra = TYPE_RANK[a.type] ?? 999;
    const rb = TYPE_RANK[b.type] ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return b.published_at.localeCompare(a.published_at);
  });
  return candidates[0].key;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npx jest __tests__/edge-functions/select-best-trailer.test.ts
```

Expected: 8/8 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add supabase/functions/_shared/select-best-trailer.ts __tests__/edge-functions/select-best-trailer.test.ts
git commit -m "feat(calendar): add selectBestTrailer helper for TMDB video selection

Pure function that picks one YouTube trailer key from TMDB's videos
response. Heuristic: Trailer > Teaser > Clip; official > unofficial;
most-recent published_at. Filters to YouTube only.

Used by warm-release-calendar (daily batch) and enrich-release-calendar
(per-watchlist-add) to populate release_calendar.trailer_youtube_key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire helper into `enrich-release-calendar`

**Files:**
- Modify: `supabase/functions/enrich-release-calendar/index.ts`

The function currently fetches `/movie/{id}/release_dates` and looks up movie metadata in `movies` table. Add a parallel `/movie/{id}/videos` fetch, pass the result through `selectBestTrailer`, and include `trailer_youtube_key` on every row in the upsert payload.

- [ ] **Step 3.1: Add the import + interface field**

In `supabase/functions/enrich-release-calendar/index.ts`, find the existing import block at the top:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';
```

Add:

```ts
import { selectBestTrailer, type TMDBVideosResponse } from '../_shared/select-best-trailer.ts';
```

Find the `ReleaseCalendarUpsertRow` interface (around line 34). Add at the end of the interface:

```ts
trailer_youtube_key: string | null;
```

(Position after `fetched_at: string;`.)

- [ ] **Step 3.2: Update `buildRowsFromTMDB` signature + row construction**

`buildRowsFromTMDB` (around line 55) currently takes `(response, tmdbId, region, meta)`. Add a 5th parameter `trailerKey: string | null`:

```ts
function buildRowsFromTMDB(
  response: TMDBReleaseDatesResponse,
  tmdbId: number,
  region: string,
  meta: MovieMeta,
  trailerKey: string | null,
): ReleaseCalendarUpsertRow[] {
```

Inside the loop (around line 67), include `trailer_youtube_key: trailerKey` in the row object after `fetched_at: fetchedAt`:

```ts
    const row: ReleaseCalendarUpsertRow = {
      tmdb_id: tmdbId,
      region,
      release_type: entry.type,
      release_date: entry.release_date.slice(0, 10),
      certification: entry.certification || null,
      note: entry.note || null,
      title: meta.title,
      poster_path: meta.poster_path,
      backdrop_path: meta.backdrop_path,
      genre_ids: meta.genre_ids,
      vote_average: meta.vote_average,
      fetched_at: fetchedAt,
      trailer_youtube_key: trailerKey,
    };
```

- [ ] **Step 3.3: Add parallel videos fetch + selectBestTrailer call**

Find the existing single TMDB fetch in the handler (around line 127):

```ts
const tmdbUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
const tmdbRes = await fetch(tmdbUrl);
```

Replace with parallel fetch:

```ts
const releaseDatesUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
const videosUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
const [tmdbRes, tmdbVideosRes] = await Promise.all([
  fetch(releaseDatesUrl),
  fetch(videosUrl),
]);
```

Then AFTER the existing `tmdbResponse = await tmdbRes.json()` line (around line 143), but BEFORE the `movies` table lookup, add the trailer key extraction:

```ts
let trailerKey: string | null = null;
if (tmdbVideosRes.ok) {
  try {
    const videosResponse = (await tmdbVideosRes.json()) as TMDBVideosResponse;
    trailerKey = selectBestTrailer(videosResponse);
  } catch (e) {
    console.warn(
      `[enrich-release-calendar] videos parse failed for ${tmdbId}:`,
      e
    );
  }
} else {
  console.warn(
    `[enrich-release-calendar] videos fetch failed for ${tmdbId}: ${tmdbVideosRes.status}`
  );
}
```

- [ ] **Step 3.4: Pass `trailerKey` to `buildRowsFromTMDB`**

Find the call to `buildRowsFromTMDB` (around line 167):

```ts
const rows = buildRowsFromTMDB(tmdbResponse, tmdbId as number, region, meta);
```

Change to:

```ts
const rows = buildRowsFromTMDB(tmdbResponse, tmdbId as number, region, meta, trailerKey);
```

- [ ] **Step 3.5: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "expo-sensors\|@tanstack" | head -10
```

Expected: clean (no errors outside the pre-existing ones).

- [ ] **Step 3.6: Deploy via Supabase MCP**

Use `mcp__plugin_supabase_supabase__deploy_edge_function`:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `enrich-release-calendar`
- entrypoint_path: `functions/enrich-release-calendar/index.ts`
- verify_jwt: `true`
- files: read the current `index.ts` content + read `supabase/functions/_shared/cors.ts` content + read `supabase/functions/_shared/select-best-trailer.ts` content. Submit all three with `name` paths `functions/enrich-release-calendar/index.ts`, `functions/_shared/cors.ts`, `functions/_shared/select-best-trailer.ts`.

Smoke test post-deploy:

```bash
set -a && source .env.local && set +a
curl -s -X POST "https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/enrich-release-calendar" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tmdb_id": 1656061, "region": "US"}'
```

(tmdb_id 1656061 = Immortal Combat — known to have a trailer, already in release_calendar.)

Expected: HTTP 200 with `inserted: N`. Verify via SQL:

```sql
SELECT tmdb_id, release_type, release_date, trailer_youtube_key
FROM release_calendar
WHERE tmdb_id = 1656061;
```

Expected: rows now have `trailer_youtube_key` populated (non-null).

- [ ] **Step 3.7: Commit**

```bash
git add supabase/functions/enrich-release-calendar/index.ts
git commit -m "feat(calendar): enrich-release-calendar fetches TMDB videos + persists trailer key

Adds a parallel /movie/{id}/videos fetch alongside the existing
/release_dates call. Picks the best YouTube trailer via the new
selectBestTrailer helper. Persists the YouTube key on every row in
release_calendar so the client can render a Play Trailer button.

Function deployed to Supabase prod via MCP. Smoke-tested with Immortal
Combat (tmdb_id=1656061) — trailer key populated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire helper into `warm-release-calendar`

**Files:**
- Modify: `supabase/functions/warm-release-calendar/index.ts`

The daily worker iterates over discover-API movies in batches of 20. Currently fetches `/movie/{id}/release_dates` per movie. Add a parallel `/movie/{id}/videos` fetch in the same batch.

- [ ] **Step 4.1: Add the import + interface field**

In `supabase/functions/warm-release-calendar/index.ts`, find the existing import block at the top. Add:

```ts
import { selectBestTrailer, type TMDBVideosResponse } from '../_shared/select-best-trailer.ts';
```

Find the `ReleaseCalendarRow` interface (around line 26-43 area). Add at the end:

```ts
trailer_youtube_key: string | null;
```

- [ ] **Step 4.2: Update the per-movie batch fetch**

Inside the per-movie batch loop (`for (let i2 = 0; i2 < allMovies.length; i2 += BATCH_SIZE)`), the existing `Promise.all` fetches release_dates per movie. Change it to also fetch `/videos`:

```ts
const results = await Promise.all(batch.map(async (movie) => {
  try {
    const [releaseDatesRes, videosRes] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${TMDB_API_KEY}`),
      fetch(`${TMDB_BASE_URL}/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`),
    ]);

    if (!releaseDatesRes.ok) return null;
    const releaseDatesData = await releaseDatesRes.json();
    const country = releaseDatesData.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === region);
    if (!country) return null;

    let trailerKey: string | null = null;
    if (videosRes.ok) {
      try {
        const videosData = (await videosRes.json()) as TMDBVideosResponse;
        trailerKey = selectBestTrailer(videosData);
      } catch (e) {
        console.warn(`[warm-release-calendar] videos parse failed for ${movie.id}:`, e);
      }
    } else {
      console.warn(`[warm-release-calendar] videos fetch failed for ${movie.id}: ${videosRes.status}`);
    }

    return { movie, entries: country.release_dates as ReleaseDateEntry[], trailerKey };
  } catch (e) {
    console.error(`[warm-release-calendar] release_dates fetch failed for ${movie.id}:`, e);
    return null;
  }
}));
```

(Replaces the existing `try { const url = ... }` block. The original returns `{ movie, entries }`; the new version returns `{ movie, entries, trailerKey }`.)

- [ ] **Step 4.3: Include `trailer_youtube_key` in `allRows.push(...)`**

Find the inner loop that pushes rows into `allRows` (after the `Promise.all` call). The existing code:

```ts
for (const result of results) {
  if (!result) continue;
  for (const entry of result.entries) {
    const releaseDate = entry.release_date.split('T')[0];
    if (releaseDate < startDate || releaseDate > endDate) continue;
    allRows.push({
      tmdb_id: result.movie.id,
      region,
      release_type: entry.type,
      release_date: releaseDate,
      certification: entry.certification || null,
      note: entry.note || null,
      title: result.movie.title,
      poster_path: result.movie.poster_path,
      backdrop_path: result.movie.backdrop_path,
      genre_ids: result.movie.genre_ids ?? null,
      vote_average: result.movie.vote_average ?? null,
      fetched_at: new Date().toISOString(),
    });
  }
}
```

Add `trailer_youtube_key: result.trailerKey,` after `fetched_at`:

```ts
    allRows.push({
      tmdb_id: result.movie.id,
      region,
      release_type: entry.type,
      release_date: releaseDate,
      certification: entry.certification || null,
      note: entry.note || null,
      title: result.movie.title,
      poster_path: result.movie.poster_path,
      backdrop_path: result.movie.backdrop_path,
      genre_ids: result.movie.genre_ids ?? null,
      vote_average: result.movie.vote_average ?? null,
      fetched_at: new Date().toISOString(),
      trailer_youtube_key: result.trailerKey,
    });
```

The dedup logic (`byKey` Map preferring populated certification) is unchanged — `trailer_youtube_key` is per-movie, so all rows with the same `(tmdb_id, region, release_type)` carry the same key.

- [ ] **Step 4.4: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "expo-sensors\|@tanstack" | head -10
```

Expected: clean.

- [ ] **Step 4.5: Deploy via Supabase MCP**

Same flow as Task 3.6 but for `warm-release-calendar`:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `warm-release-calendar`
- entrypoint_path: `functions/warm-release-calendar/index.ts`
- verify_jwt: `true`
- files: current `index.ts` + `_shared/cors.ts` + `_shared/select-best-trailer.ts`. Submit all three.

Smoke test by manually invoking the function with a small months_ahead (1 month):

```bash
set -a && source .env.local && set +a
curl -s -X POST "https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/warm-release-calendar" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"months_ahead": 1, "region": "US"}'
```

Expected: HTTP 200 with `rows_upserted: N`. Wait for completion (may take 30-60s). Then verify trailer keys are populating:

```sql
SELECT
  COUNT(*) AS total_us_upcoming,
  COUNT(trailer_youtube_key) AS with_trailer,
  ROUND(100.0 * COUNT(trailer_youtube_key) / COUNT(*), 1) AS pct_with_trailer
FROM release_calendar
WHERE region = 'US'
  AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 months';
```

Expected: `pct_with_trailer` is non-zero (probably 60-80% — major releases typically have trailers; niche releases often don't).

- [ ] **Step 4.6: Commit**

```bash
git add supabase/functions/warm-release-calendar/index.ts
git commit -m "feat(calendar): warm-release-calendar fetches TMDB videos + persists trailer key

Adds a parallel /movie/{id}/videos fetch alongside the existing
/release_dates call inside the per-movie batch loop. Picks the best
YouTube trailer via selectBestTrailer. Persists on every row.

Function deployed to Supabase prod via MCP. Smoke-tested with
months_ahead=1 — trailer keys populated for the next-month window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client types + service mapping

**Files:**
- Modify: `lib/tmdb.types.ts:396-406` (the `CalendarRelease` interface)
- Modify: `lib/release-calendar-service.ts:37,50-60` (the explicit select string + row mapping)

- [ ] **Step 5.1: Add `trailer_youtube_key` to `CalendarRelease`**

In `lib/tmdb.types.ts`, find the `CalendarRelease` interface (around line 396):

```ts
export interface CalendarRelease {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_type: number;
  release_type_label: string;
  genre_ids: number[];
  vote_average: number;
  release_date: string;
}
```

Add `trailer_youtube_key`:

```ts
export interface CalendarRelease {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_type: number;
  release_type_label: string;
  genre_ids: number[];
  vote_average: number;
  release_date: string;
  trailer_youtube_key: string | null;
}
```

- [ ] **Step 5.2: Update the explicit select() in `release-calendar-service.ts`**

In `lib/release-calendar-service.ts`, find the `.select(...)` on line 37:

```ts
.select('tmdb_id, title, poster_path, backdrop_path, genre_ids, vote_average, release_type, release_date')
```

Add `trailer_youtube_key`:

```ts
.select('tmdb_id, title, poster_path, backdrop_path, genre_ids, vote_average, release_type, release_date, trailer_youtube_key')
```

- [ ] **Step 5.3: Update the CalendarRelease construction**

In the same file, find the row-to-CalendarRelease mapping (around line 50):

```ts
const release: CalendarRelease = {
  tmdb_id: r.tmdb_id,
  title: r.title!,
  poster_path: r.poster_path,
  backdrop_path: r.backdrop_path,
  release_type: r.release_type,
  release_type_label: RELEASE_TYPE_LABELS[r.release_type] || 'Unknown',
  genre_ids: r.genre_ids ?? [],
  vote_average: r.vote_average ?? 0,
  release_date: r.release_date,
};
```

Add `trailer_youtube_key`:

```ts
const release: CalendarRelease = {
  tmdb_id: r.tmdb_id,
  title: r.title!,
  poster_path: r.poster_path,
  backdrop_path: r.backdrop_path,
  release_type: r.release_type,
  release_type_label: RELEASE_TYPE_LABELS[r.release_type] || 'Unknown',
  genre_ids: r.genre_ids ?? [],
  vote_average: r.vote_average ?? 0,
  release_date: r.release_date,
  trailer_youtube_key: (r as { trailer_youtube_key?: string | null }).trailer_youtube_key ?? null,
};
```

(The cast preserves type safety — Supabase's generated types may not have caught up to the new column yet, depending on whether `database.types.ts` was regenerated. The cast is forward-compatible.)

- [ ] **Step 5.4: Type check + run existing tests**

```bash
npx tsc --noEmit 2>&1 | grep -v "expo-sensors\|@tanstack" | head -10
npx jest __tests__/lib/release-calendar-service 2>&1 | tail -5
```

Expected: tsc clean, any existing release-calendar-service tests still pass.

- [ ] **Step 5.5: Commit**

```bash
git add lib/tmdb.types.ts lib/release-calendar-service.ts
git commit -m "feat(calendar): plumb trailer_youtube_key from release_calendar to CalendarRelease

CalendarRelease type gains the new field. release-calendar-service
service-layer mapper reads the column from the explicit select() and
forwards it. Cast included for forward-compatibility with not-yet-
regenerated Supabase types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `lib/trailer-utils.ts` helper + Jest test (TDD)

**Files:**
- Create: `lib/trailer-utils.ts`
- Create: `__tests__/lib/trailer-utils.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `__tests__/lib/trailer-utils.test.ts`:

```ts
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
}));

import { Linking } from 'react-native';
import { openTrailer } from '@/lib/trailer-utils';

const mockOpenURL = Linking.openURL as jest.Mock;

describe('openTrailer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens YouTube with the watch URL for the given key', async () => {
    await openTrailer('dQw4w9WgXcQ');
    expect(mockOpenURL).toHaveBeenCalledWith('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
  });

  it('returns the promise from Linking.openURL', async () => {
    const result = openTrailer('TESTKEY');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
npx jest __tests__/lib/trailer-utils.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/trailer-utils'`.

- [ ] **Step 6.3: Create the helper**

Create `lib/trailer-utils.ts`:

```ts
import { Linking } from 'react-native';

/**
 * Opens a YouTube video by key. iOS opens the YouTube app if installed,
 * falls back to Safari. Web opens a new tab. No-op on unrecognized keys
 * — Linking.openURL just hits an invalid URL which YouTube handles.
 */
export function openTrailer(youtubeKey: string): Promise<void> {
  return Linking.openURL(`https://youtube.com/watch?v=${youtubeKey}`);
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/trailer-utils.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add lib/trailer-utils.ts __tests__/lib/trailer-utils.test.ts
git commit -m "feat(trailer): openTrailer helper for opening YouTube externally

Thin wrapper around Linking.openURL with the YouTube watch URL. iOS
opens the YouTube app if installed; web opens a new tab. Easier to test
than inlining the URL construction at every call site.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update `release-card.tsx` with conditional Play Trailer button

**Files:**
- Modify: `components/calendar/release-card.tsx`

- [ ] **Step 7.1: Add the import**

In `components/calendar/release-card.tsx`, find the existing imports at the top. Add:

```ts
import { openTrailer } from '@/lib/trailer-utils';
```

- [ ] **Step 7.2: Add the Play Trailer button at the end of the content View**

Find the content `<View style={styles.content}>` block (around lines 84-168). The structure currently is: Title → Genre Pills → Rating → Taste Match → Watchlist Button (absolute top-right).

Add the new Play Trailer Pressable AFTER the existing Watchlist Button block (after line 167's `</Pressable>`), still inside the content `<View>`:

```tsx
        {/* Play Trailer Button — bottom-right, separate tap target from card press */}
        {release.trailer_youtube_key && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              openTrailer(release.trailer_youtube_key!);
            }}
            hitSlop={8}
            style={styles.trailerButton}
            accessibilityRole="button"
            accessibilityLabel="Play trailer"
          >
            <Text style={[styles.trailerText, { color: colors.tint }]}>
              Play Trailer
            </Text>
            <Ionicons name="play-circle" size={16} color={colors.tint} />
          </Pressable>
        )}
```

- [ ] **Step 7.3: Add the new styles**

In the `StyleSheet.create({...})` block at the bottom of the file (around line 173-235), find the existing `watchlistButton` style:

```ts
  watchlistButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
```

Add AFTER it:

```ts
  trailerButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trailerText: {
    ...Typography.body.smMedium,
    fontSize: 13,
    fontWeight: '600',
  },
```

- [ ] **Step 7.4: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -v "expo-sensors\|@tanstack" | head -10
```

Expected: clean. The new field on `CalendarRelease` (added in Task 5) is what makes `release.trailer_youtube_key` typecheck here.

- [ ] **Step 7.5: Lint check**

```bash
npm run lint -- components/calendar/release-card.tsx 2>&1 | tail -10
```

Expected: clean for this file (pre-existing repo-wide warnings unrelated).

- [ ] **Step 7.6: Commit**

```bash
git add components/calendar/release-card.tsx
git commit -m "feat(calendar): conditional Play Trailer button on release cards

Bottom-right of content area, parallel to watchlist button (top-right).
Renders only when release.trailer_youtube_key is non-null. Tap opens
the YouTube trailer via Linking.openURL (separate tap target from card
press, so card press still navigates to detail page).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Pre-PR check + push + open PR

- [ ] **Step 8.1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-trailer-thumbnails
npm run lint && npx tsc --noEmit && npm test
```

Expected: lint clean (8 pre-existing warnings unrelated), tsc clean, all tests pass — baseline 884 (post-PR #408) + 8 new (selectBestTrailer) + 2 new (openTrailer) = 894.

- [ ] **Step 8.2: Push branch**

```bash
git push -u origin feat/sp4-c-trailer-thumbnails
```

- [ ] **Step 8.3: Open PR**

```bash
gh pr create --title "feat(calendar): SP4-C trailer thumbnails on release cards" --body "$(cat <<'EOF'
## Summary
- New \`release_calendar.trailer_youtube_key TEXT NULL\` column (migration applied via Supabase MCP)
- New shared helper \`supabase/functions/_shared/select-best-trailer.ts\` — picks the best YouTube trailer key from a TMDB videos response. Heuristic: Trailer > Teaser > Clip; official > unofficial; most-recent published_at. 8 unit tests.
- \`enrich-release-calendar\` (per-watchlist-add path) and \`warm-release-calendar\` (daily batch) both fetch \`/movie/{id}/videos\` in parallel with the existing \`/release_dates\` call. selectBestTrailer extracts the key, persisted on every row.
- New \`lib/trailer-utils.ts\` with \`openTrailer(key)\` helper. 2 Jest tests.
- \`components/calendar/release-card.tsx\` adds conditional "Play Trailer ▶" button at bottom-right of content area. Renders only when key is non-null. Tap opens YouTube externally via \`Linking.openURL\`. Separate tap target from card press.
- \`lib/tmdb.types.ts\` + \`lib/release-calendar-service.ts\` plumb the new field through to the client.
- ~894/894 tests pass, lint+tsc clean.

## Why
SP4-C of the release-calendar feature pack. Brings demo-friendly trailer access onto the calendar's day-list cards. Most major movie apps put trailers on the detail page; CineTrak's calendar-as-discovery angle puts them one tap away on the browse surface.

## Spec & Plan
- Spec: \`docs/superpowers/specs/2026-04-27-sp4-c-trailer-thumbnails-design.md\`
- Plan: \`docs/superpowers/plans/2026-04-28-sp4-c-trailer-thumbnails.md\`

## Edge functions deployed
**Yes** — both \`enrich-release-calendar\` and \`warm-release-calendar\` deployed to Supabase prod via MCP. Smoke tests verified post-deploy.

## Migration applied
**Yes** — \`add_release_calendar_trailer_youtube_key\` applied via Supabase MCP before deploys.

## Test plan
- [x] \`npm run lint\` clean
- [x] \`npx tsc --noEmit\` clean
- [x] \`npm test\` — 894/894 pass (884 baseline + 10 new)
- [x] Edge function smoke tests (Immortal Combat enrichment + warm-release-calendar dry run with months_ahead=1)
- [ ] Device: open calendar, find a movie with a known trailer (Mortal Kombat II / Immortal Combat) → confirm "Play Trailer ▶" button appears bottom-right
- [ ] Device: tap → YouTube opens to the trailer
- [ ] Device: find a movie known to lack a trailer → confirm NO button shows
- [ ] Device: add a brand-new niche movie to watchlist → wait ~5s → confirm button appears (proves enrich-release-calendar populates the key per-add)
- [ ] Web build: tap Play Trailer → opens YouTube in a new tab

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8.4: Final opus full-diff review**

After PR opens, dispatch an opus code-reviewer subagent against the full diff (`git diff c44cb57..HEAD`). Address any high-confidence findings as additional commits before Tyshane merges.

---

## Self-review

**Spec coverage:**
- ✅ Migration → Task 1
- ✅ selectBestTrailer helper + tests → Task 2
- ✅ enrich-release-calendar wiring + deploy → Task 3
- ✅ warm-release-calendar wiring + deploy → Task 4
- ✅ Client types + service mapping → Task 5 (correction over spec — explicit select(), not select('*'))
- ✅ openTrailer helper + test → Task 6
- ✅ release-card.tsx conditional button + styles → Task 7
- ✅ Pre-PR check + deploy + PR + final review → Task 8

**Type consistency:**
- `trailer_youtube_key: string | null` consistent across `ReleaseCalendarUpsertRow` (enrich), `ReleaseCalendarRow` (warm), `CalendarRelease` (client), and the `select()` string
- `selectBestTrailer(response: TMDBVideosResponse): string | null` consistent across helper definition, test imports, and both edge functions
- `openTrailer(youtubeKey: string): Promise<void>` consistent

**Placeholder scan:**
- All steps have concrete file paths + code blocks + commands + expected outputs
- No "TBD", "TODO", "implement later" markers
- Test cases enumerated explicitly in Task 2
- One graceful fallback noted: if Jest can't resolve `supabase/functions/_shared/`, mirror to `lib/trailer/` (Task 2.2). Concrete fallback path specified.

**Frequent commits:**
- 7 atomic commits (one per task component): migration, helper, enrich-wiring, warm-wiring, client-plumbing, openTrailer, release-card UI. Total 7 code commits + 2 docs (spec + plan) = 9. Manageable for review.

**Subagent model selection:**
- Tasks 1, 2, 5, 6, 7: mechanical, well-specced → sonnet
- Tasks 3, 4: medium complexity (TMDB integration + parallel fetch logic + edge function deploy) → sonnet (well-specced)
- Task 8: controller-driven (deploy MCP + gh pr create) → controller does it directly, not a subagent

**Operational notes:**
- Edge functions deployed via Supabase MCP `deploy_edge_function` (yesterday's pattern from PR #407 confirmed working)
- Migration applied via Supabase MCP `apply_migration`
- Backfill of historical rows is OUT OF SCOPE — daily warming converges over time. If instant coverage needed post-merge, run a one-shot via MCP.
