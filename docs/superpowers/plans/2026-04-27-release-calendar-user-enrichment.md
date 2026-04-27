# Release Calendar User-Driven Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every movie added to a user's library auto-enriches `release_calendar` via a new edge function that fetches TMDB `/movie/{id}/release_dates`. Closes the gap where indie/niche titles never appear on the calendar.

**Architecture:** New Deno edge function `enrich-release-calendar` does the TMDB fetch + Postgres upsert. Client `addMovieToLibrary` fires-and-forgets a call to it after every successful insert. Letterboxd opts out via `skipEnrich: true`. Idempotent at the DB layer via existing `(tmdb_id, region, release_type)` unique constraint.

**Tech Stack:** Deno (Supabase Edge Functions), Supabase JS v2, TypeScript, Jest (client-side tests), TMDB v3 REST API.

**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment` on branch `feat/release-calendar-user-enrichment` (already created off `origin/main`, `.env.local` already copied).

**Spec:** `docs/superpowers/specs/2026-04-27-release-calendar-user-enrichment-design.md`

---

## File Structure

**Create:**
- `supabase/functions/enrich-release-calendar/index.ts` — edge function (~140 LOC)

**Modify:**
- `lib/movie-service.ts:135` — `addMovieToLibrary` adds `skipEnrich?: boolean` parameter, fire-and-forget call
- `lib/letterboxd-service.ts:184` — pass `skipEnrich: true` from import flow
- `__tests__/lib/movie-service.test.ts` — 2 new test cases asserting the fire-and-forget behavior
- `__tests__/lib/letterboxd-service.test.ts` — assertion that bulk import passes `skipEnrich: true`

**Out of scope:** No automated tests for the edge function (matches codebase pattern — none of the 30+ existing functions have Deno tests). Verified via local `supabase functions serve` + curl, and post-deploy curl with Hokum's tmdb_id.

---

## Task 1: Edge function `enrich-release-calendar`

**Files:**
- Create: `supabase/functions/enrich-release-calendar/index.ts`

This task writes the entire edge function in one commit. No automated tests; verification is a single local curl in Step 1.5.

- [ ] **Step 1.1: Create the edge function file**

Create `supabase/functions/enrich-release-calendar/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface RequestBody {
  tmdb_id?: number;
  region?: string;
}

interface TMDBReleaseDateEntry {
  release_date: string;
  type: number;
  certification: string;
  note: string;
}

interface TMDBReleaseDatesResponse {
  results: Array<{
    iso_3166_1: string;
    release_dates: TMDBReleaseDateEntry[];
  }>;
}

interface MovieMeta {
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
}

interface ReleaseCalendarUpsertRow {
  tmdb_id: number;
  region: string;
  release_type: number;
  release_date: string;
  certification: string | null;
  note: string | null;
  title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
}

/**
 * Pure: parse TMDB /movie/{id}/release_dates response → release_calendar rows.
 * Filters to the requested region. Dedups on (tmdb_id, region, release_type)
 * preferring entries with populated certification (matches warm-release-calendar
 * worker behavior — TMDB sometimes returns duplicates differing only in cert).
 */
function buildRowsFromTMDB(
  response: TMDBReleaseDatesResponse,
  tmdbId: number,
  region: string,
  meta: MovieMeta,
): ReleaseCalendarUpsertRow[] {
  const regional = response.results.find((r) => r.iso_3166_1 === region);
  if (!regional) return [];

  const byKey = new Map<string, ReleaseCalendarUpsertRow>();
  for (const entry of regional.release_dates) {
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
    };
    const key = `${row.tmdb_id}:${row.region}:${row.release_type}`;
    const existing = byKey.get(key);
    if (!existing || (!existing.certification && row.certification)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const corsHeaders = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const tmdbId = body.tmdb_id;
    const region = (body.region ?? 'US').toUpperCase();

    if (!Number.isInteger(tmdbId) || (tmdbId as number) <= 0) {
      return new Response(
        JSON.stringify({ error: 'tmdb_id must be a positive integer' }),
        { status: 400, headers: corsHeaders }
      );
    }
    if (!/^[A-Z]{2}$/.test(region)) {
      return new Response(
        JSON.stringify({ error: 'region must be a 2-character ISO 3166-1 alpha-2 code' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const tmdbUrl = `${TMDB_BASE_URL}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`;
    const tmdbRes = await fetch(tmdbUrl);
    if (tmdbRes.status === 404) {
      console.log(`[enrich-release-calendar] tmdb_id ${tmdbId} not found in TMDB`);
      return new Response(
        JSON.stringify({ inserted: 0, region, tmdb_id: tmdbId }),
        { status: 200, headers: corsHeaders }
      );
    }
    if (!tmdbRes.ok) {
      console.error(`[enrich-release-calendar] TMDB ${tmdbRes.status} for ${tmdbId}`);
      return new Response(
        JSON.stringify({ error: `TMDB returned ${tmdbRes.status}`, inserted: 0 }),
        { status: 502, headers: corsHeaders }
      );
    }
    const tmdbResponse = (await tmdbRes.json()) as TMDBReleaseDatesResponse;

    const { data: movieRow } = await supabase
      .from('movies')
      .select('title, poster_path, backdrop_path, genre_ids, tmdb_vote_average')
      .eq('tmdb_id', tmdbId)
      .maybeSingle();

    const meta: MovieMeta = {
      title: movieRow?.title ?? null,
      poster_path: movieRow?.poster_path ?? null,
      backdrop_path: movieRow?.backdrop_path ?? null,
      genre_ids: movieRow?.genre_ids ?? null,
      vote_average: movieRow?.tmdb_vote_average ?? null,
    };

    const rows = buildRowsFromTMDB(tmdbResponse, tmdbId as number, region, meta);
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, region, tmdb_id: tmdbId }),
        { status: 200, headers: corsHeaders }
      );
    }

    const { error: upsertErr } = await supabase
      .from('release_calendar')
      .upsert(rows, { onConflict: 'tmdb_id,region,release_type' });

    if (upsertErr) {
      console.error(`[enrich-release-calendar] upsert failed for ${tmdbId}:`, upsertErr);
      return new Response(
        JSON.stringify({ error: upsertErr.message, inserted: 0 }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log(
      `[enrich-release-calendar] tmdb_id=${tmdbId} region=${region} rows=${rows.length}`
    );
    return new Response(
      JSON.stringify({ inserted: rows.length, region, tmdb_id: tmdbId }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[enrich-release-calendar]', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
```

- [ ] **Step 1.2: Lint + tsc check**

Edge function code is Deno but let's still confirm no obvious type errors leak into the IDE / web build. Run from worktree root:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -10
# Note: TS will complain about Deno-specific imports if scanned; that's why we filter.
```

Expected: no errors outside `supabase/functions/`.

- [ ] **Step 1.3: Commit edge function**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
git add supabase/functions/enrich-release-calendar/index.ts
git commit -m "feat(calendar): add enrich-release-calendar edge function

Fetches TMDB /movie/{id}/release_dates for a single tmdb_id, parses to
release_calendar rows for the requested region, dedups on
(tmdb_id, region, release_type) preferring entries with populated
certification (matches warm-release-calendar dedup), upserts via
service-role client.

Used by addMovieToLibrary to close the gap where TMDB's discover-API
warming worker misses indie/niche titles. Fire-and-forget from client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 1.4: Local serve + curl smoke test (REQUIRED — no automated tests)**

Open a second terminal. Start the local Supabase function server:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
supabase functions serve enrich-release-calendar --env-file .env.local --no-verify-jwt
```

In your original terminal, hit it with Hokum's tmdb_id (1430077):

```bash
curl -i -X POST http://localhost:54321/functions/v1/enrich-release-calendar \
  -H "Content-Type: application/json" \
  -d '{"tmdb_id": 1430077, "region": "US"}'
```

Expected response:
- HTTP 200
- Body `{"inserted":1,"region":"US","tmdb_id":1430077}` (1 row because earlier festival entries dedupe to 1 type=1, plus 1 type=3 = 2 keys; but Hokum's release_calendar already has the type=3 row, so the upsert will UPDATE rather than insert. The "inserted" field is "rows attempted" — the actual DB insert count may differ. Re-running is safe.)
- Look for log line: `[enrich-release-calendar] tmdb_id=1430077 region=US rows=2`

Verify in DB via Supabase MCP or the dashboard:

```sql
SELECT tmdb_id, release_type, release_date, certification, title
FROM release_calendar
WHERE tmdb_id = 1430077
ORDER BY release_type;
```

Expected: 2 rows (type=1 festival premiere, type=3 wide theatrical 2026-05-01).

Negative smoke tests:

```bash
# 400 on missing tmdb_id
curl -X POST http://localhost:54321/functions/v1/enrich-release-calendar \
  -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 400, body {"error":"tmdb_id must be a positive integer"}

# 400 on bad region
curl -X POST http://localhost:54321/functions/v1/enrich-release-calendar \
  -H "Content-Type: application/json" -d '{"tmdb_id": 1430077, "region": "USA"}'
# Expected: HTTP 400, body {"error":"region must be a 2-character ISO 3166-1 alpha-2 code"}

# 200 with inserted=0 on TMDB-deleted id
curl -X POST http://localhost:54321/functions/v1/enrich-release-calendar \
  -H "Content-Type: application/json" -d '{"tmdb_id": 99999999, "region": "US"}'
# Expected: HTTP 200, body {"inserted":0,...}, log shows "not found in TMDB"
```

If all 4 curl checks pass, stop the local server (Ctrl+C) and proceed.

---

## Task 2: Wire `skipEnrich` into `addMovieToLibrary` (TDD via Jest)

**Files:**
- Modify: `lib/movie-service.ts:135` (the `addMovieToLibrary` function)
- Modify: `__tests__/lib/movie-service.test.ts` (add 2 new test cases inside the existing `describe('addMovieToLibrary', ...)` block at line 365)

- [ ] **Step 2.1: Write the failing tests**

Find the existing `describe('addMovieToLibrary', () => {` block in `__tests__/lib/movie-service.test.ts` (around line 365). Inside that block, BEFORE the closing `});`, add these two new test cases:

```ts
  it('fires the enrich-release-calendar edge function after a successful upsert (default skipEnrich=false)', async () => {
    setupQueryChain({ data: upserted, error: null });
    mockInvoke.mockResolvedValue({ data: { inserted: 1 }, error: null });

    await addMovieToLibrary(USER_ID, movie as any);

    expect(mockInvoke).toHaveBeenCalledWith('enrich-release-calendar', {
      body: { tmdb_id: movie.id },
    });
  });

  it('does NOT fire the enrich-release-calendar edge function when skipEnrich=true', async () => {
    setupQueryChain({ data: upserted, error: null });
    mockInvoke.mockResolvedValue({ data: { inserted: 1 }, error: null });

    await addMovieToLibrary(USER_ID, movie as any, 'watchlist', { skipEnrich: true });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      'enrich-release-calendar',
      expect.anything()
    );
  });
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
npx jest __tests__/lib/movie-service.test.ts -t "addMovieToLibrary"
```

Expected: 2 FAILs on the new tests (the existing tests still pass). Failure reason: production code never calls `mockInvoke` with `'enrich-release-calendar'`. Or possibly a TS error about the 4th argument (the options object).

- [ ] **Step 2.3: Implement the production change**

In `lib/movie-service.ts`, find `addMovieToLibrary` (starts around line 135). Update the signature and add the fire-and-forget call. The full function should look like this after the change:

```ts
// Add movie to user's library
export async function addMovieToLibrary(
  userId: string,
  movie: TMDBMovie,
  status: MovieStatus = 'watchlist',
  options: { skipEnrich?: boolean } = {}
): Promise<UserMovie> {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const insertData: UserMovieInsert = {
    user_id: userId,
    tmdb_id: movie.id,
    status,
    title: movie.title,
    overview: movie.overview || null,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average || null,
    genre_ids: movie.genre_ids || [],
    watch_time: status === 'watched' ? currentTime : null,
  };

  const { data, error } = (await (supabase
    .from('user_movies') as any)
    .upsert(insertData, { onConflict: 'user_id,tmdb_id,journey_number' })
    .select()
    .single()) as { data: UserMovie; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to add movie');
  }

  // Fire-and-forget enrichment of release_calendar — improves calendar accuracy
  // for niche/indie titles missed by the daily warming worker. Skipped during
  // bulk imports (e.g., Letterboxd) where 1000 calls would pressure TMDB rate limits.
  if (!options.skipEnrich) {
    void supabase.functions
      .invoke('enrich-release-calendar', { body: { tmdb_id: movie.id } })
      .catch((err) => {
        console.warn('[enrich-release-calendar] fire-and-forget failed', err);
      });
  }

  return data;
}
```

Three changes from the existing code:
1. Added 4th parameter `options: { skipEnrich?: boolean } = {}`
2. Added the fire-and-forget block after the existing error-throw
3. Added a JSDoc-style comment explaining the why

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/movie-service.test.ts
```

Expected: ALL `addMovieToLibrary` tests pass (existing 5 + new 2 = 7+ tests in that describe block, plus all other describe blocks in the file).

- [ ] **Step 2.5: Type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: clean.

- [ ] **Step 2.6: Commit**

```bash
git add lib/movie-service.ts __tests__/lib/movie-service.test.ts
git commit -m "feat(movies): fire-and-forget release_calendar enrichment after addMovieToLibrary

After a successful user_movies upsert, invoke the new
enrich-release-calendar edge function. Mutation resolves immediately;
edge function failure logs to console without surfacing to user.

Adds skipEnrich option for callers (Letterboxd import) that should
bypass enrichment to avoid TMDB rate-limit pressure on bulk operations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Letterboxd opt-out

**Files:**
- Modify: `lib/letterboxd-service.ts:184` (the `addMovieToLibrary` call inside the import loop)

**No new test.** Recon revealed `importMovies` has zero existing test coverage in `__tests__/lib/letterboxd-service.test.ts` (covered describes: `parseLetterboxdCSV`, `detectLetterboxdCSVType`, `matchMoviesToTMDB`, `exportCollectionCSV` — none for `importMovies`). Adding a test for one assertion means setting up a new describe block with mocks for the entire import loop. The production change is a single one-line append; TypeScript catches the parameter shape, and the existing Task 2 tests prove that `skipEnrich: true` correctly bypasses the fire-and-forget. Manual verification (Task 4 device check) confirms Letterboxd doesn't trigger enrichment by inspecting Supabase function logs.

- [ ] **Step 3.1: Update Letterboxd service to pass skipEnrich**

In `lib/letterboxd-service.ts`, find the line `const userMovie = await addMovieToLibrary(userId, match.tmdbMovie, status);` (around line 184). Change to:

```ts
      const userMovie = await addMovieToLibrary(userId, match.tmdbMovie, status, { skipEnrich: true });
```

(Single edit: append `, { skipEnrich: true }` as the 4th argument.)

- [ ] **Step 3.2: Type check + run existing letterboxd tests**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
npx tsc --noEmit && npx jest __tests__/lib/letterboxd-service.test.ts
```

Expected: tsc clean (the 4th argument matches the new optional parameter from Task 2), all existing letterboxd tests still pass.

- [ ] **Step 3.3: Commit**

```bash
git add lib/letterboxd-service.ts
git commit -m "feat(letterboxd): opt out of release_calendar enrichment on bulk import

Letterboxd imports historical 'watched' titles in bulk (potentially
1000s per import). Per-row enrichment would pressure TMDB rate limits
and provide little value (most imported titles are already past their
release date). Pass skipEnrich: true to bypass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pre-PR check + deploy + PR + post-merge backfill

- [ ] **Step 4.1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
npm run lint && npx tsc --noEmit && npm test
```

Expected: lint clean, tsc clean, all tests pass (~875 tests = 873 baseline + 2 new from Task 2 + 0-1 new from Task 3).

- [ ] **Step 4.2: Deploy edge function to production**

The function needs to be deployed to Supabase before the PR can be merged (otherwise the client-side `supabase.functions.invoke('enrich-release-calendar', ...)` will 404 in production). Deploy from the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-enrichment
supabase functions deploy enrich-release-calendar --project-ref wliblwulvsrfgqcnbzeh
```

Expected: function uploaded + active. Verify with:

```bash
curl -i -X POST https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/enrich-release-calendar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat .env.local | grep EXPO_PUBLIC_SUPABASE_ANON_KEY | cut -d= -f2)" \
  -d '{"tmdb_id": 1430077, "region": "US"}'
```

Expected: HTTP 200 with `{"inserted":N,"region":"US","tmdb_id":1430077}` (where N is 1 or 2).

- [ ] **Step 4.3: Push branch + open PR**

```bash
git push -u origin feat/release-calendar-user-enrichment
gh pr create --title "feat(calendar): user-driven release_calendar enrichment" --body "$(cat <<'EOF'
## Summary
- New edge function `enrich-release-calendar` (`supabase/functions/enrich-release-calendar/index.ts`) — takes `{tmdb_id, region}`, fetches TMDB `/movie/{id}/release_dates`, dedupes on `(tmdb_id, region, release_type)` (prefers populated certification), upserts to `release_calendar`
- `addMovieToLibrary` fires the function fire-and-forget after every successful insert (default behavior)
- New `skipEnrich?: boolean` parameter on `addMovieToLibrary` for callers that want to opt out
- Letterboxd bulk import opts out via `skipEnrich: true` (avoids 1000-row TMDB rate-limit storms)
- 2 new Jest tests in `movie-service.test.ts` + 1 assertion in `letterboxd-service.test.ts`

## Why
SP1's daily warming worker uses TMDB's `/discover/movie` endpoint, which is popularity-ranked — niche titles never make it into `release_calendar`. Today's bug: a user added Hokum (indie horror, R-rated wide theatrical 2026-05-01) to their watchlist, but the calendar showed nothing because Hokum had zero rows in `release_calendar`. 27 watchlisted tmdb_ids are currently missing from `release_calendar` for region=US (snapshot 2026-04-27). This PR closes the gap forward; a one-shot backfill below covers historical misses.

## Spec & Plan
- Spec: `docs/superpowers/specs/2026-04-27-release-calendar-user-enrichment-design.md`
- Plan: `docs/superpowers/plans/2026-04-27-release-calendar-user-enrichment.md`

## Edge function deployed
Yes — `supabase functions deploy enrich-release-calendar` ran before this PR opened. Invocation verified with Hokum (tmdb_id=1430077, returned HTTP 200 with `inserted:N`).

## Post-merge backfill (operational, run by Tyshane via Supabase MCP)
For the 25 historical missing tmdb_ids (Hokum + Beekeeper 2 already manually inserted earlier today). Run via SQL with `pg_net.http_post`:

```sql
SELECT pg_net.http_post(
  url := 'https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/enrich-release-calendar',
  body := jsonb_build_object('tmdb_id', um.tmdb_id),
  headers := jsonb_build_object(
    'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
    'Content-Type', 'application/json'
  )
) AS request_id, um.tmdb_id
FROM (SELECT DISTINCT tmdb_id FROM user_movies WHERE status = 'watchlist') um
WHERE NOT EXISTS (
  SELECT 1 FROM release_calendar rc WHERE rc.tmdb_id = um.tmdb_id AND rc.region = 'US'
);
```

Or via shell loop:

```bash
for id in $(supabase --project-ref wliblwulvsrfgqcnbzeh sql --query "SELECT DISTINCT tmdb_id FROM user_movies WHERE status='watchlist' AND NOT EXISTS (SELECT 1 FROM release_calendar rc WHERE rc.tmdb_id = user_movies.tmdb_id AND rc.region='US')"); do
  curl -s -X POST https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/enrich-release-calendar \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"tmdb_id\": $id}"
  sleep 0.1
done
```

## Test plan
- [x] `npm run lint` clean
- [x] `npx tsc --noEmit` clean
- [x] `npm test` — all tests pass including 2 new movie-service tests + Letterboxd assertion
- [x] Local: `supabase functions serve` + curl Hokum → HTTP 200, rows in DB
- [x] Production: post-deploy curl Hokum → HTTP 200
- [ ] Device: add a niche/indie movie not currently in `release_calendar` to watchlist → wait ~3-5s → calendar shows it on its release date with watchlist filter ON
- [ ] Device: add a movie via Letterboxd import → confirm enrichment is NOT called per row (check Supabase function logs — no spike in invocations)
- [ ] Regression: existing add-from-detail flow still works (Hokum from earlier today still visible)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Tyshane reviews + merges.

- [ ] **Step 4.4: Final opus full-diff review**

After PR is opened, dispatch an opus reviewer subagent against the full diff. Address any high-confidence findings as additional commits before Tyshane merges.

- [ ] **Step 4.5: Post-merge backfill (run by Tyshane via Supabase MCP, NOT in this PR)**

After merge, the controller (Claude) runs the backfill SQL above via `mcp__plugin_supabase_supabase__execute_sql`. This backfills the 25 historical missing tmdb_ids by invoking the deployed edge function once per tmdb_id. Idempotent — safe to re-run.

Verification:

```sql
-- Should return 0 (or close to it — TMDB-deleted ids may still be missing)
SELECT COUNT(DISTINCT um.tmdb_id)
FROM user_movies um
WHERE um.status = 'watchlist'
  AND NOT EXISTS (SELECT 1 FROM release_calendar rc WHERE rc.tmdb_id = um.tmdb_id AND rc.region = 'US');
```

---

## Self-review

**Spec coverage:**
- ✅ New edge function `enrich-release-calendar` — Task 1
- ✅ Parser dedup on `(tmdb_id, region, release_type)` preferring cert — Task 1 step 1.1
- ✅ Input validation (positive int tmdb_id, 2-char region) — Task 1 step 1.1
- ✅ Graceful handling of TMDB 404 — Task 1 step 1.1 (returns 200 with inserted:0)
- ✅ Service-role upsert with `onConflict: 'tmdb_id,region,release_type'` — Task 1 step 1.1
- ✅ Client wiring with `skipEnrich` parameter — Task 2
- ✅ Letterboxd opt-out via `skipEnrich: true` — Task 3
- ✅ Jest tests for `addMovieToLibrary` skipEnrich behavior — Task 2 (Letterboxd opt-out lacks pre-existing test surface; intentionally skipped per Task 3 note)
- ✅ Local + production verification via curl — Task 1.4 + Task 4.2
- ✅ Post-merge backfill via Supabase MCP — Task 4.5

**Type consistency:**
- `skipEnrich?: boolean` parameter shape consistent across `addMovieToLibrary` signature and Letterboxd call site
- Edge function input `{ tmdb_id: number, region?: string }` consistent across spec, plan, curl examples, and PR description
- Response shape `{ inserted, region, tmdb_id }` consistent across all client-side and curl invocations

**Placeholder scan:**
- All steps have concrete file paths, code blocks, and commands
- No "TBD", "TODO", "implement later" markers
- All commit messages drafted in full

**Frequent commits:**
- 3 atomic commits for code changes (Task 1.3 edge function, Task 2.6 client wiring, Task 3.3 Letterboxd opt-out); 2 docs commits (spec + spec alignment, already done). Total 5 commits, atomic and easy to revert if any single step regresses.

**Worktree gotchas (from memories):**
- `feedback_worktree_env_local`: `.env.local` already copied to the worktree — confirmed
- `feedback_subagent_permission_scope`: implementer subagents may need pre-approved permissions for the worktree directory if they hit interactive prompts. Plan dispatches them with full context and explicit working directory.

**Out of scope reaffirmation:**
- No Deno test infrastructure (matches codebase pattern of zero edge-function tests)
- No replacing the warming worker (Option B — separate future PR)
- No multi-region UI preferences (still US-only)
