# Release Calendar User-Driven Enrichment — Design Spec

**Date:** 2026-04-27
**Status:** Ready for plan
**Feature:** Every movie added to a user's library gets accurate `release_calendar` rows automatically. Closes the gap where TMDB's discover-API misses indie/niche titles and they never appear on the calendar.
**Parent initiative:** Release Calendar Foundation (SP1) data completeness — addresses [[SP1 Warming Worker — Niche Watchlist Titles Missing]] bug class
**Builds on:** [SP1 — Release Calendar Foundation](./2026-04-23-release-calendar-foundation-design.md), [Watchlist Invalidation Across Screens](./2026-04-27-watchlist-invalidation-design.md)

## Context

The SP1 warming worker fetches TMDB's `/discover/movie` endpoint daily for the next 4 months. TMDB's discover API ranks results by popularity and paginates — niche releases (small horror, indie drama, festival films) get excluded.

Today: Hokum (indie horror, R-rated wide theatrical 2026-05-01) was added to a watchlist but had **zero rows in `release_calendar`**. The calendar's watchlist filter showed nothing for it. Same shape as yesterday's "Sheep Detectives" bug — patched manually each time. **27 watchlisted tmdb_ids are currently missing from `release_calendar`** entirely.

Yesterday's reconciliation pass (PR #404/405) fixed null-title rows. Today's PR #406 fixes cache freshness. Neither addresses missing rows. This PR closes the gap.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| Trigger point | **`addMovieToLibrary` insert path only.** Status-agnostic — fires whether status is watchlist/watching/watched. Skips `updateMovieStatus` (status changes don't change release dates). |
| Fire mode | **Fire-and-forget** from client. Mutation resolves immediately. Calendar accuracy improves a few seconds later when edge function finishes. Failures logged, not surfaced. |
| Edge function input | `{ tmdb_id: number, region?: string }`. Region defaults to `'US'`. |
| Auth | JWT-required (Supabase default for edge functions). User session validates the call; service-role client used internally for upsert. |
| Idempotency | `INSERT ... ON CONFLICT (tmdb_id, region, release_type, release_date) DO NOTHING`. Repeated calls are safe; existing rows preserved. |
| TMDB env var | `TMDB_API_KEY` (v3 query-param style) — matches existing `warm-release-calendar` for consistency. |
| Backfill of 25 historical missing tmdb_ids | **Out of this PR.** Post-merge: I run a one-shot via Supabase MCP `pg_net.http_post` invoking the function URL for each, OR via shell `supabase functions invoke ... --body '{...}'`. Operational, not part of the diff. |
| Letterboxd import handling | **Add `skipEnrich?: boolean` parameter to `addMovieToLibrary` (default `false`).** Letterboxd-service passes `true`. Letterboxd imports old/historical watched titles that don't need calendar enrichment, AND a 1000-row import would trigger 1000 fire-and-forget calls (TMDB rate-limit pressure). Skip the enrichment for those. |
| Multi-region preferences | Out of scope. Function accepts region param for future-proofing; client always passes `'US'` until profile preference column lands (separate SP4 feature). |
| Replacing the warming worker | Out of scope (Option B from convo). This PR adds a complementary layer. Warming worker stays as the broad-strokes daily prime; this PR fills the niche gap. |

## Architecture

```
[Client: addMovieToLibrary]
        |
        | (1) supabase.from('user_movies').upsert(...)
        | (2) await success → supabase.functions.invoke('enrich-release-calendar', { body: { tmdb_id }})
        |     fire-and-forget (.catch logs, doesn't reject)
        v
[Edge Function: enrich-release-calendar]
        |
        | (a) validate input
        | (b) GET TMDB /movie/{id}/release_dates?api_key=...
        | (c) filter to requested region
        | (d) build ReleaseCalendarRow[] (one per release_dates entry)
        | (e) supabase service-role .upsert(...rows, { onConflict: '...', ignoreDuplicates: true })
        | (f) return { inserted, skipped, region }
```

Three independently-testable units: (1) parser pure function, (2) Deno HTTP handler, (3) client-side wiring.

## Scope

### 1. New edge function — `supabase/functions/enrich-release-calendar/index.ts`

Approximate size: ~120 LOC including imports + types + parser + handler.

**Pseudo-structure:**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface RequestBody {
  tmdb_id: number;
  region?: string;
}

interface TMDBReleaseDateEntry {
  release_date: string;  // ISO 8601
  type: number;          // 1-6
  certification: string;
  note: string;
}

interface TMDBReleaseDatesResponse {
  results: Array<{
    iso_3166_1: string;
    release_dates: TMDBReleaseDateEntry[];
  }>;
}

interface ReleaseCalendarUpsertRow {
  tmdb_id: number;
  region: string;
  release_type: number;
  release_date: string;  // YYYY-MM-DD
  certification: string | null;
  note: string | null;
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
}

interface ResponseBody {
  inserted: number;
  region: string;
  tmdb_id: number;
}

// Parser — pure function, no I/O. Easy to unit test.
export function buildRowsFromTMDB(
  tmdbResponse: TMDBReleaseDatesResponse,
  tmdbId: number,
  region: string,
  movieMeta: { title: string | null; poster_path: string | null; backdrop_path: string | null; genre_ids: number[] | null; vote_average: number | null }
): ReleaseCalendarUpsertRow[] {
  const regional = tmdbResponse.results.find(r => r.iso_3166_1 === region);
  if (!regional) return [];
  return regional.release_dates.map(entry => ({
    tmdb_id: tmdbId,
    region,
    release_type: entry.type,
    release_date: entry.release_date.slice(0, 10),  // ISO → YYYY-MM-DD
    certification: entry.certification || null,
    note: entry.note || null,
    title: movieMeta.title,
    poster_path: movieMeta.poster_path,
    backdrop_path: movieMeta.backdrop_path,
    genre_ids: movieMeta.genre_ids,
    vote_average: movieMeta.vote_average,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  // 1. validate body, 2. fetch TMDB, 3. fetch movies row for metadata, 4. build rows, 5. upsert
});
```

**Behavior:**
- Validates `tmdb_id` is a positive integer; rejects with 400 otherwise.
- Validates `region` is a 2-character uppercase string (default `'US'` if omitted).
- Calls `TMDB GET /movie/{tmdb_id}/release_dates?api_key=...` with the `TMDB_API_KEY` env var.
- On TMDB 404 (movie doesn't exist or was deleted): logs to console, returns `{ inserted: 0, region, tmdb_id }` with HTTP 200. No throw.
- On TMDB other errors: logs, returns `{ inserted: 0, error: '...' }` with HTTP 502.
- Looks up the movie's metadata in our `movies` table for title/poster/backdrop/genres. If not present, leaves those null (warming worker will fill them later, or the user already has them in `user_movies`).
- Calls `supabase.from('release_calendar').upsert(rows, { onConflict: 'tmdb_id,region,release_type,release_date', ignoreDuplicates: true })`.
- Returns `{ inserted: rows.length, region, tmdb_id }` (note: `inserted` here is the count of attempted rows — actual inserts may be fewer due to conflict).

### 2. Client wiring — `lib/movie-service.ts:addMovieToLibrary`

Single addition: after the `user_movies` upsert resolves successfully, fire-and-forget call to the edge function.

**Diff sketch (pseudo, exact line numbers in plan):**

```ts
export async function addMovieToLibrary(
  userId: string,
  movie: TMDBMovie,
  status: MovieStatus = 'watchlist'
): Promise<UserMovie> {
  // ... existing upsert logic into user_movies ...
  const { data, error } = ...;
  if (error) throw new Error(error.message || 'Failed to add movie');

  // NEW: fire-and-forget enrichment of release_calendar
  // We don't await — calendar accuracy is eventual, not synchronous with the add UX
  void supabase.functions
    .invoke('enrich-release-calendar', { body: { tmdb_id: movie.id } })
    .catch((err) => {
      console.warn('[enrich-release-calendar] fire-and-forget failed', err);
    });

  return data;
}
```

The `void` operator + `.catch` makes intent explicit (fire-and-forget). Mutation resolves immediately on `user_movies` upsert success, regardless of edge function outcome.

### 3. Tests

**Edge function: no automated tests** — matches existing codebase pattern (none of the 30+ existing supabase functions have Deno tests; setting up Deno test infrastructure for one snowflake function is out of scope). Verified instead via:
- Local: `supabase functions serve enrich-release-calendar` + `curl` with known fixture (Hokum tmdb_id 1430077) → assert 5 rows upserted for region='US'
- Production deploy + manual curl with Hokum (idempotent — already populated, asserts no errors)

**Client-side Jest tests in `__tests__/lib/movie-service.test.ts`** (existing file):
- `addMovieToLibrary` calls `supabase.functions.invoke('enrich-release-calendar', { body: { tmdb_id } })` after successful upsert (default behavior, `skipEnrich` omitted)
- `addMovieToLibrary` does NOT call `supabase.functions.invoke` when `skipEnrich: true` is passed
- Existing test for upsert success/failure path is not affected — fire-and-forget never throws to the caller
- Mock `supabase.functions.invoke` via the existing supabase mock pattern in the test file

**Client-side Jest test in `__tests__/lib/letterboxd-service.test.ts`** (existing file):
- The bulk import path passes `skipEnrich: true` to every `addMovieToLibrary` call. Assert via mock spy on the existing `addMovieToLibrary` mock.

### 4. Post-merge backfill (operational, not in PR)

After PR merges + edge function deploys to production, run via Supabase MCP or local shell:

```bash
# For each of the 25 historical missing tmdb_ids
for id in <25 tmdb_ids from query>; do
  supabase functions invoke enrich-release-calendar \
    --body "{\"tmdb_id\": $id}" \
    --no-verify-jwt
done
```

Or via SQL with `pg_net`:

```sql
SELECT pg_net.http_post(
  url := 'https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/enrich-release-calendar',
  body := jsonb_build_object('tmdb_id', um.tmdb_id),
  headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>', 'Content-Type', 'application/json')
)
FROM user_movies um
WHERE um.status = 'watchlist'
  AND NOT EXISTS (SELECT 1 FROM release_calendar rc WHERE rc.tmdb_id = um.tmdb_id AND rc.region = 'US');
```

Documented in the bug doc; out of this PR's diff.

### 5. Device validation

After PR merge + EAS OTA push:
1. Open app, find a niche/indie movie that's NOT currently in `release_calendar` (search the DB to pick one). Add to watchlist from the detail screen.
2. Wait ~3-5 seconds, navigate to the release calendar (or pull-to-refresh if already on it).
3. With watchlist filter ON, navigate to the movie's release date — confirm the movie appears under the correct release type.
4. Repeat for `status='watching'` add.
5. Verify Hokum (already in DB from today's manual fix) still shows correctly — sanity check.
6. Test failure mode: add a movie with TMDB-deleted id (if findable). Confirm app doesn't crash, no UX regression — just no calendar entry.

## Risks

| Risk | Mitigation |
|---|---|
| TMDB rate limits (50/sec) | One call per add. Even at peak — say 100 adds/min — well within limits. No batching needed. |
| TMDB 404 for stale tmdb_ids | Edge function returns success with `inserted: 0`. Logged to console (visible in Supabase function logs). User sees no error. |
| Edge function failure causes UX delay | Fire-and-forget. Mutation resolves on `user_movies` upsert; edge function failure invisible. Worst case: calendar stays stale (same as current behavior). |
| Service-role key exposed in client | Not exposed. Client uses anon key + JWT; edge function uses service-role internally only. |
| Duplicate rows from concurrent adds | `ON CONFLICT DO NOTHING` handles race. Postgres unique constraint guarantees no dupes. |
| `movies` table missing the metadata at enrichment time | Acceptable — leave nulls. Yesterday's reconciliation pass + future runs will fill them. The `release_calendar` row exists with date/type/region — that's enough to render on the calendar (title can show "Loading..." or fallback to the user's `user_movies` title). |
| Letterboxd import 100x call multiplier | Resolved via `skipEnrich: true` parameter passed from `lib/letterboxd-service.ts:184`. Default behavior (omitted parameter) still enriches; only Letterboxd skips. |

## Out of scope (intentional, do NOT scope-creep)

- Replacing the warming worker (Option B from the brainstorm — separate future PR if Option A's drift is unacceptable)
- Multi-region profile preferences
- Re-enrichment on `updateMovieStatus`
- Letterboxd import enrichment of old watched titles (skipped via `skipEnrich: true` flag — see Design decisions)
- Edge function batch endpoint (`{ tmdb_ids: number[] }`) — defer until measured need
- Notification/observability (Sentry/PostHog events for enrichment success rate) — defer; console logs in Supabase function logs sufficient for v1

## Estimated scope

3-4 hours, single PR, single worktree (`cinetrak-release-enrichment`, branch `feat/release-calendar-user-enrichment`).
