# Release Calendar Foundation (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the release calendar off the edge-function critical path. Client reads via single-query PostgREST; a daily pg_cron warms a denormalized `release_calendar` table with TMDB data; RLS lands on the read table.

**Architecture:** Reader/writer split. Denormalized single table with movie fields inlined. Background-only edge function (`verify_jwt: true`) invoked by pg_cron via `pg_net.http_post` using existing `project_url` / `service_role_key` vault secrets. Client PostgREST query returns the month in one round-trip; day-grouping moves client-side.

**Tech Stack:** Supabase Postgres (pg_cron, pg_net, Vault), Deno edge runtime (existing `get-release-calendar`), TypeScript/React Native client, Jest (for unit tests).

**Spec:** `docs/superpowers/specs/2026-04-23-release-calendar-foundation-design.md`

**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File Map

| File / Resource | Action | Purpose |
|--|--|--|
| `public.release_date_cache` (Postgres) | Rename → `release_calendar`, add 5 columns, enable RLS, add SELECT policy, backfill from `movies` | Denormalized read model |
| `supabase/functions/get-release-calendar/index.ts` | Rename dir to `warm-release-calendar` + refactor to warming-only | Background worker |
| Edge function deployment `get-release-calendar` → `warm-release-calendar` | Redeploy under new slug via MCP `deploy_edge_function`; set `verify_jwt: true`; orphan old deployment (deleted via Supabase dashboard post-merge) | Atomic cutover |
| `public.cron.job` | Add `warm-release-calendar-daily` schedule | Automation |
| `lib/release-calendar-service.ts` | Rewrite `getReleaseCalendar` to use `supabase.from('release_calendar')` | Client read path |
| `__tests__/lib/release-calendar-service.test.ts` | Create new test file | Unit coverage |

No deletion of `supabase/functions/get-release-calendar/` subdirectory in this plan — directory stays (renamed on disk to `warm-release-calendar/`). Old edge function deployment in Supabase is orphaned until post-merge manual dashboard cleanup (documented in the PR body).

---

## Task 1: Schema migration + RLS

**Context for implementer:** Rename the existing `release_date_cache` table to `release_calendar`, add 5 denormalized movie-metadata columns (all nullable), backfill what we can from the existing `movies` cache table, then enable RLS with a public-read policy. Service role writes bypass RLS by default.

Per project convention, apply via `mcp__plugin_supabase_supabase__apply_migration` — the SQL is NOT committed to `supabase/migrations/`. Commit is an empty marker.

**Files:**
- Apply via: `mcp__plugin_supabase_supabase__apply_migration`
- Verify via: `mcp__plugin_supabase_supabase__execute_sql`

- [ ] **Step 1: Pre-flight state check**

Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `wliblwulvsrfgqcnbzeh`:

```sql
-- Confirm source table exists with expected shape + row count
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'release_date_cache'
ORDER BY ordinal_position;

SELECT COUNT(*) AS total_rows FROM public.release_date_cache;
```

Expected: 8 columns (id, tmdb_id, region, release_type, release_date, certification, note, fetched_at) and ~408 rows. If the table is named differently or has a different shape, STOP and report.

- [ ] **Step 2: Apply the migration**

Use `mcp__plugin_supabase_supabase__apply_migration`:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `rename_release_date_cache_to_release_calendar`
- query:

```sql
-- Rename the table
ALTER TABLE public.release_date_cache RENAME TO release_calendar;

-- Add denormalized movie fields (nullable — populated by warming worker)
ALTER TABLE public.release_calendar
  ADD COLUMN title text,
  ADD COLUMN poster_path text,
  ADD COLUMN backdrop_path text,
  ADD COLUMN genre_ids integer[],
  ADD COLUMN vote_average numeric;

COMMENT ON TABLE public.release_calendar IS
  'TMDB-sourced release calendar. Denormalized for single-query client reads via PostgREST. Populated daily by warm-release-calendar edge function via pg_cron. Unique on (tmdb_id, region, release_type).';

-- Rename indexes for semantic clarity
ALTER INDEX public.release_date_cache_pkey RENAME TO release_calendar_pkey;
ALTER INDEX public.release_date_cache_tmdb_id_region_release_type_key
  RENAME TO release_calendar_tmdb_id_region_release_type_key;
ALTER INDEX public.idx_release_date_cache_date_region
  RENAME TO idx_release_calendar_date_region;
ALTER INDEX public.idx_release_date_cache_tmdb_fetched
  RENAME TO idx_release_calendar_tmdb_fetched;

-- Backfill denormalized columns from the movies cache where available
UPDATE public.release_calendar rc
SET title = m.title,
    poster_path = m.poster_path,
    backdrop_path = m.backdrop_path,
    genre_ids = m.genre_ids,
    vote_average = m.vote_average
FROM public.movies m
WHERE rc.tmdb_id = m.tmdb_id
  AND rc.title IS NULL;

-- Enable RLS
ALTER TABLE public.release_calendar ENABLE ROW LEVEL SECURITY;

-- Public read policy (release data is TMDB-sourced public information)
CREATE POLICY "release_calendar_read_all"
  ON public.release_calendar
  FOR SELECT
  TO anon, authenticated
  USING (true);
```

Expected: migration returns success. If it fails on a rename (e.g., `release_date_cache` doesn't exist because the table was already renamed), STOP and report.

- [ ] **Step 3: Verify post-migration state**

```sql
-- Table exists under new name
SELECT COUNT(*) FROM public.release_calendar;

-- New columns present
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'release_calendar'
  AND column_name IN ('title', 'poster_path', 'backdrop_path', 'genre_ids', 'vote_average')
ORDER BY column_name;

-- Backfill populated at least some rows
SELECT
  COUNT(*) AS total,
  COUNT(title) AS with_title,
  COUNT(poster_path) AS with_poster
FROM public.release_calendar;

-- RLS enabled
SELECT rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'release_calendar';

-- Policy exists
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'release_calendar';

-- Old table name does NOT exist
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'release_date_cache'
) AS old_name_still_exists;
```

Expected:
- `total` row count matches Step 1's pre-flight total (~408)
- 5 new columns all present, all nullable
- `with_title` / `with_poster` are non-zero (backfill worked for rows whose `tmdb_id` is in `movies` cache). Remaining `title IS NULL` rows will fill on first warming run.
- `rowsecurity` is `true`
- One policy `release_calendar_read_all` with cmd `SELECT`, roles `{anon,authenticated}`
- `old_name_still_exists` is `false`

If any expectation fails, STOP and report.

- [ ] **Step 4: Commit empty marker**

From worktree root:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git commit --allow-empty -m "$(cat <<'EOF'
feat(calendar): rename release_date_cache → release_calendar + denormalize

Migration rename_release_date_cache_to_release_calendar applied via
MCP. Adds 5 nullable denormalized columns (title, poster_path,
backdrop_path, genre_ids, vote_average), renames indexes, enables
RLS with a public-read policy (data is TMDB-sourced public info),
backfills denormalized fields from the existing movies cache where
tmdb_ids overlap. Remaining NULL metadata will fill on first
warming run (Task 2).

Closes rls_disabled_in_public ERROR advisor on this table.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: new empty marker commit on branch `feat/release-calendar-foundation`.

---

## Task 2: Refactor + rename edge function to `warm-release-calendar`

**Context for implementer:** The old `get-release-calendar` edge function runs TMDB-heavy READ logic on the client's critical path. Refactor to warming-only — it now only writes to `release_calendar`, doesn't do day-grouping, doesn't do movie-info fallback (all metadata comes from TMDB during warming and lands in the denormalized columns).

Deploy under NEW slug `warm-release-calendar` with `verify_jwt: true`. Old slug `get-release-calendar` is left deployed but orphaned — cleanup via Supabase dashboard post-merge.

**Files:**
- Rename on disk: `supabase/functions/get-release-calendar/` → `supabase/functions/warm-release-calendar/`
- Rewrite: `supabase/functions/warm-release-calendar/index.ts`
- Deploy via: `mcp__plugin_supabase_supabase__deploy_edge_function`

- [ ] **Step 1: Rename the directory on disk**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git mv supabase/functions/get-release-calendar supabase/functions/warm-release-calendar
ls supabase/functions/warm-release-calendar/
```

Expected: `index.ts` exists under the new path.

- [ ] **Step 2: Rewrite `index.ts`**

Use Write on `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation/supabase/functions/warm-release-calendar/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_DISCOVER_PAGES = 5;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 250;

interface RequestBody {
  months_ahead?: number;
  region?: string;
}

interface DiscoverMovie {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
}

interface ReleaseDateEntry {
  release_date: string;
  type: number;
  certification: string;
  note: string;
}

interface ReleaseCalendarRow {
  tmdb_id: number;
  region: string;
  release_type: number;
  release_date: string;
  certification: string | null;
  note: string | null;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  vote_average: number;
  fetched_at: string;
}

interface ResponseBody {
  rows_upserted: number;
  months_warmed: string[];
  duration_ms: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const started = Date.now();

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const monthsAhead = Math.max(0, Math.min(6, body.months_ahead ?? 3));
    const region = (body.region ?? 'US').toUpperCase();

    // Compute the window: current month + N months ahead
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthsWarmed: string[] = [];
    const allRows: ReleaseCalendarRow[] = [];

    for (let i = 0; i <= monthsAhead; i++) {
      const target = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
      const year = target.getFullYear();
      const month = target.getMonth() + 1;
      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
      monthsWarmed.push(monthLabel);

      const startDate = `${monthLabel}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${monthLabel}-${String(lastDay).padStart(2, '0')}`;

      console.log(`[warm-release-calendar] Warming ${monthLabel} region=${region}`);

      // Step A: Discover all movies releasing in this month
      const allMovies: DiscoverMovie[] = [];
      for (let page = 1; page <= MAX_DISCOVER_PAGES; page++) {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&primary_release_date.gte=${startDate}&primary_release_date.lte=${endDate}&region=${region}&sort_by=primary_release_date.asc&page=${page}`;
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`[warm-release-calendar] discover page ${page} failed: ${res.status}`);
          break;
        }
        const data = await res.json();
        allMovies.push(...data.results);
        if (page >= data.total_pages) break;
      }

      // Step B: For each movie, fetch release_dates details in batches
      for (let i2 = 0; i2 < allMovies.length; i2 += BATCH_SIZE) {
        const batch = allMovies.slice(i2, i2 + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (movie) => {
          try {
            const url = `${TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${TMDB_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            const country = data.results.find((r: { iso_3166_1: string }) => r.iso_3166_1 === region);
            if (!country) return null;
            return { movie, entries: country.release_dates as ReleaseDateEntry[] };
          } catch (e) {
            console.error(`[warm-release-calendar] release_dates fetch failed for ${movie.id}:`, e);
            return null;
          }
        }));

        for (const result of results) {
          if (!result) continue;
          for (const entry of result.entries) {
            const releaseDate = entry.release_date.split('T')[0];
            // Skip releases outside the current month's window — discover can
            // return movies whose primary release_date is in-window but whose
            // per-country entries span a wider timeline.
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
              genre_ids: result.movie.genre_ids ?? [],
              vote_average: result.movie.vote_average ?? 0,
              fetched_at: new Date().toISOString(),
            });
          }
        }

        if (i2 + BATCH_SIZE < allMovies.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    }

    // Step C: Single batched upsert to release_calendar
    if (allRows.length > 0) {
      const { error } = await supabase
        .from('release_calendar')
        .upsert(allRows, { onConflict: 'tmdb_id,region,release_type' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }

    const response: ResponseBody = {
      rows_upserted: allRows.length,
      months_warmed: monthsWarmed,
      duration_ms: Date.now() - started,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[warm-release-calendar]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
```

Note: `../_shared/cors.ts` remains unchanged; the old relative import still resolves after the rename.

- [ ] **Step 3: Deploy the new function via MCP**

Use `mcp__plugin_supabase_supabase__deploy_edge_function`:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `warm-release-calendar`
- entrypoint_path: `supabase/functions/warm-release-calendar/index.ts`
- verify_jwt: `true`
- Provide the full file content from Step 2

Expected: function deploys successfully. Verify via `mcp__plugin_supabase_supabase__list_edge_functions` that `warm-release-calendar` appears with `verify_jwt: true`.

Note: the old `get-release-calendar` function remains deployed. That's intentional — Task 5 decouples the client from it. Task 6 (post-merge manual cleanup via Supabase dashboard) removes the orphaned deployment.

- [ ] **Step 4: Manual seed invocation**

Invoke the new function once manually to populate the current window. Use `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
       || '/functions/v1/warm-release-calendar',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
  ),
  body := '{"months_ahead": 3, "region": "US"}'::jsonb,
  timeout_milliseconds := 600000
) AS request_id;
```

Expected: returns a single request_id integer. Wait ~60 seconds for the function to complete (typical runtime 2–5 min for 4 months).

- [ ] **Step 5: Verify seed populated rows**

Wait 5 min after Step 4 (typical warming window), then:

```sql
-- Verify the HTTP call completed successfully
SELECT status_code, content::text AS body_preview
FROM net._http_response
ORDER BY created DESC
LIMIT 3;

-- Rows with title populated (post-warming baseline)
SELECT COUNT(*) AS with_title FROM public.release_calendar WHERE title IS NOT NULL;

-- Rows fresh-fetched within last 10 minutes (proves the warming worker wrote them)
SELECT COUNT(*) AS fresh_rows
FROM public.release_calendar
WHERE fetched_at > NOW() - INTERVAL '10 minutes';
```

Expected:
- Most recent `status_code` is 200 and body includes `rows_upserted: <positive number>`, `months_warmed: ["2026-04", "2026-05", ...]`, `duration_ms: <ms>`
- `with_title` meaningfully larger than it was post-migration (Task 1 Step 3 baseline)
- `fresh_rows` > 0

If `status_code` is 401 or 403 → `verify_jwt: true` is likely rejecting the pg_net call. Re-check deploy step's verify_jwt flag. If `status_code` is 404 → function not deployed or wrong slug. Re-check step 3.

If warming takes longer than 10 min and no rows arrive, STOP and report (may indicate TMDB rate limit or another systemic issue).

- [ ] **Step 6: Commit the edge function refactor**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git add supabase/functions/warm-release-calendar/
git add -A supabase/functions/  # captures git mv of the old directory
git commit -m "$(cat <<'EOF'
feat(calendar): refactor edge function to warming-only

Renames supabase/functions/get-release-calendar → warm-release-calendar
and rewrites index.ts as a pure background warming worker:
- No read-path logic (day grouping, movie-info fallback removed)
- Writes ALL denormalized columns (title, poster_path, backdrop_path,
  genre_ids, vote_average) into release_calendar in one batched upsert
- Request body: { months_ahead?: number, region?: string }
- Response: { rows_upserted, months_warmed, duration_ms }

Deployed with verify_jwt=true via MCP deploy_edge_function. Only
service-role callers (i.e., the pg_cron job in Task 3) can invoke.

Old get-release-calendar edge function deployment is orphaned —
will be removed via Supabase dashboard post-merge after confirming
no regressions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit includes the renamed directory + new index.ts.

---

## Task 3: Schedule pg_cron daily warming

**Context for implementer:** Apply a second MCP migration that schedules the daily warming run. Pattern mirrors existing `check-push-receipts` and `post-daily-metrics` cron jobs (inline `net.http_post` reading vault secrets `project_url` and `service_role_key`). The manual invocation in Task 2 Step 4 already seeded data; this task just automates ongoing refreshes.

**Files:**
- Apply via: `mcp__plugin_supabase_supabase__apply_migration`

- [ ] **Step 1: Verify vault secrets exist (sanity check)**

```sql
SELECT name FROM vault.decrypted_secrets WHERE name IN ('project_url', 'service_role_key');
```

Expected: two rows. If fewer than two, STOP — new secrets need to be configured via the Supabase dashboard before scheduling the cron (it would fail silently on first run otherwise).

- [ ] **Step 2: Apply the cron migration**

Use `mcp__plugin_supabase_supabase__apply_migration`:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `setup_release_calendar_warming_cron`
- query:

```sql
SELECT cron.schedule(
  'warm-release-calendar-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/warm-release-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{"months_ahead": 3, "region": "US"}'::jsonb,
    timeout_milliseconds := 600000
  ) AS request_id;
  $$
);
```

Expected: returns a single integer (the jobid).

- [ ] **Step 3: Verify the cron job registered**

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'warm-release-calendar-daily';
```

Expected: one row with `schedule = '0 4 * * *'` and `active = true`.

- [ ] **Step 4: Commit empty marker**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git commit --allow-empty -m "$(cat <<'EOF'
feat(calendar): schedule daily pg_cron release calendar warming

Migration setup_release_calendar_warming_cron applied via MCP.
Schedules warm-release-calendar-daily at 04:00 UTC daily. Matches
the inline net.http_post pattern already used by check-push-receipts
(Phase 4a) and post-daily-metrics (Phase 4b) — reads project_url
and service_role_key from vault.decrypted_secrets.

Body: {"months_ahead": 3, "region": "US"} — 4 months total (current +
next 3), US only. Typical run: 2–5 min, ~400–800 TMDB calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: new empty marker commit on branch.

---

## Task 4: Client service refactor + RN unit tests

**Context for implementer:** Replace the `supabase.functions.invoke('get-release-calendar', ...)` call with a direct PostgREST query against the `release_calendar` table. Keep the `ReleaseCalendarResponse` shape identical so callers (`app/release-calendar.tsx`, `hooks/use-release-calendar.ts`) need no changes. Group rows by date on the client.

**Files:**
- Modify: `lib/release-calendar-service.ts`
- Create: `__tests__/lib/release-calendar-service.test.ts`

- [ ] **Step 1: Write failing unit tests**

Use Write on `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation/__tests__/lib/release-calendar-service.test.ts`:

```typescript
// Mock supabase before importing the service
jest.mock('@/lib/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn(),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn() },
    },
    __chain: chain,
  };
});

import { supabase } from '@/lib/supabase';
import { getReleaseCalendar } from '@/lib/release-calendar-service';

// Access the shared chain mock from the jest.mock factory
const chain = (jest.requireMock('@/lib/supabase') as { __chain: {
  select: jest.Mock; eq: jest.Mock; gte: jest.Mock; lte: jest.Mock; not: jest.Mock; order: jest.Mock;
} }).__chain;

describe('getReleaseCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries release_calendar with correct month range + region + null filter', async () => {
    chain.order.mockResolvedValueOnce({ data: [], error: null });

    await getReleaseCalendar(4, 2026, 'US');

    expect(supabase.from).toHaveBeenCalledWith('release_calendar');
    expect(chain.eq).toHaveBeenCalledWith('region', 'US');
    expect(chain.gte).toHaveBeenCalledWith('release_date', '2026-04-01');
    expect(chain.lte).toHaveBeenCalledWith('release_date', '2026-04-30');
    expect(chain.not).toHaveBeenCalledWith('title', 'is', null);
    expect(chain.order).toHaveBeenCalledWith('release_date', { ascending: true });
  });

  it('groups rows by date into days', async () => {
    chain.order.mockResolvedValueOnce({
      data: [
        { tmdb_id: 1, title: 'Movie A', poster_path: '/a.jpg', backdrop_path: null, genre_ids: [28], vote_average: 7.5, release_type: 3, release_date: '2026-04-29', certification: 'PG-13' },
        { tmdb_id: 2, title: 'Movie B', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 3, release_date: '2026-04-29', certification: null },
        { tmdb_id: 3, title: 'Movie C', poster_path: '/c.jpg', backdrop_path: null, genre_ids: [18], vote_average: 8.1, release_type: 6, release_date: '2026-04-30', certification: null },
      ],
      error: null,
    });

    const result = await getReleaseCalendar(4, 2026);

    expect(result.days).toHaveLength(2);
    expect(result.days[0].date).toBe('2026-04-29');
    expect(result.days[0].releases).toHaveLength(2);
    expect(result.days[0].releases.map((r) => r.tmdb_id)).toEqual([1, 2]);
    expect(result.days[1].date).toBe('2026-04-30');
    expect(result.days[1].releases[0].tmdb_id).toBe(3);
    expect(result.dates_with_releases).toEqual(['2026-04-29', '2026-04-30']);
    expect(result.total_results).toBe(3);
  });

  it('maps release_type integer to human label', async () => {
    chain.order.mockResolvedValueOnce({
      data: [
        { tmdb_id: 1, title: 'Theatrical', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 3, release_date: '2026-04-29', certification: null },
        { tmdb_id: 2, title: 'Digital', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 4, release_date: '2026-04-29', certification: null },
        { tmdb_id: 3, title: 'TV', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 6, release_date: '2026-04-29', certification: null },
      ],
      error: null,
    });

    const result = await getReleaseCalendar(4, 2026);
    const labels = result.days[0].releases.map((r) => r.release_type_label);
    expect(labels).toEqual(['Theatrical', 'Digital', 'TV']);
  });

  it('throws when supabase returns an error', async () => {
    chain.order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(getReleaseCalendar(4, 2026)).rejects.toThrow('boom');
  });

  it('returns empty days when no rows returned', async () => {
    chain.order.mockResolvedValueOnce({ data: [], error: null });
    const result = await getReleaseCalendar(4, 2026);
    expect(result.days).toEqual([]);
    expect(result.dates_with_releases).toEqual([]);
    expect(result.total_results).toBe(0);
  });
});
```

- [ ] **Step 2: Run the new tests — expect them to fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
npx jest __tests__/lib/release-calendar-service.test.ts 2>&1 | tail -15
```

Expected: 5 tests fail. The current implementation invokes `supabase.functions.invoke` which the test mock doesn't provide — assertions about `.from().eq().gte()...` won't match.

- [ ] **Step 3: Rewrite `lib/release-calendar-service.ts`**

Read current file first:

```bash
cat /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation/lib/release-calendar-service.ts
```

Replace its content. Use Write on `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation/lib/release-calendar-service.ts`:

```typescript
import { supabase } from './supabase';
import type { ReleaseCalendarResponse, CalendarDay, CalendarRelease } from './tmdb.types';

const RELEASE_TYPE_LABELS: Record<number, string> = {
  1: 'Premiere',
  2: 'Limited Theatrical',
  3: 'Theatrical',
  4: 'Digital',
  5: 'Physical',
  6: 'TV',
};

/**
 * Reads the denormalized release_calendar table via PostgREST directly.
 * Day-grouping happens client-side (previously did in the edge function).
 * Rows with NULL title are filtered out — those are placeholders awaiting
 * their next warming run.
 *
 * Replaces the previous supabase.functions.invoke('get-release-calendar')
 * flow as of Phase SP1. The edge function is now background-only (daily
 * pg_cron at 04:00 UTC via warm-release-calendar).
 */
export async function getReleaseCalendar(
  month: number,
  year: number,
  region: string = 'US'
): Promise<ReleaseCalendarResponse> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('release_calendar')
    .select('tmdb_id, title, poster_path, backdrop_path, genre_ids, vote_average, release_type, release_date, certification')
    .eq('region', region)
    .gte('release_date', startDate)
    .lte('release_date', endDate)
    .not('title', 'is', null)
    .order('release_date', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch release calendar');

  const rows = data ?? [];

  const dayMap = new Map<string, CalendarRelease[]>();
  for (const r of rows) {
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
    const existing = dayMap.get(r.release_date) || [];
    existing.push(release);
    dayMap.set(r.release_date, existing);
  }

  const sortedDates = [...dayMap.keys()].sort();
  const days: CalendarDay[] = sortedDates.map((date) => ({
    date,
    releases: dayMap.get(date)!,
  }));

  return {
    days,
    dates_with_releases: sortedDates,
    total_results: rows.length,
  };
}

export async function getWatchlistTmdbIds(): Promise<Set<number>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('user_movies')
    .select('tmdb_id')
    .eq('user_id', user.id)
    .eq('status', 'watchlist');

  return new Set((data ?? []).map((row) => row.tmdb_id));
}
```

- [ ] **Step 4: Run the new tests — expect them to pass**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
npx jest __tests__/lib/release-calendar-service.test.ts 2>&1 | tail -15
```

Expected: 5 tests pass.

- [ ] **Step 5: Run the full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -10
```

Expected: 0 lint errors, 0 tsc errors, all tests pass (baseline was 764 before this plan — should now be 769 with the 5 new tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git add lib/release-calendar-service.ts __tests__/lib/release-calendar-service.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): client reads release_calendar via direct PostgREST

Rewrites getReleaseCalendar to query supabase.from('release_calendar')
instead of invoking the get-release-calendar edge function. Single
round-trip, zero TMDB calls on the user path. Day-grouping moves from
server to client.

Rows with NULL title (placeholders awaiting the next warming run) are
filtered out of results, so the UI never shows a release card missing
its movie metadata.

ReleaseCalendarResponse shape unchanged — consuming hooks and screen
code require no modifications.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit with the 2 files.

---

## Task 5: End-to-end validation

**Context for implementer:** Manual verification steps + advisor check. No code changes expected in this task. If any validation fails, fix in the relevant earlier task with a follow-up commit on the same branch.

**Files:** No code files modified in this task.

- [ ] **Step 1: Verify Supabase advisor cleared**

Use `mcp__plugin_supabase_supabase__get_advisors`:
- project_id: `wliblwulvsrfgqcnbzeh`
- type: `security`

Search the output for `rls_disabled_in_public` entries. Expected: no entry for `release_calendar` (or `release_date_cache` — shouldn't exist anymore).

If the advisor still flags `release_calendar`, STOP — Task 1's RLS enable + policy didn't stick. Re-verify Task 1 Step 3.

- [ ] **Step 2: Verify seed + daily cron both produce successful HTTP responses**

```sql
SELECT status_code, url, created
FROM net._http_response
WHERE url LIKE '%warm-release-calendar%'
ORDER BY created DESC
LIMIT 5;
```

Expected: at least one row with `status_code = 200` (from Task 2 Step 4 manual seed). If the cron has already fired once naturally (e.g., plan executed across 04:00 UTC), there may be additional 200s. No 401/403/404/500 in the top result.

- [ ] **Step 3: Spot-check row quality**

Pick a randomly-sampled row from the window and eye-verify the data:

```sql
SELECT tmdb_id, title, poster_path, release_date, release_type, certification, fetched_at
FROM public.release_calendar
WHERE fetched_at > NOW() - INTERVAL '1 day'
  AND title IS NOT NULL
ORDER BY RANDOM()
LIMIT 5;
```

Expected: titles look like real movie titles, poster_path strings look like TMDB poster paths (`/xxxxxx.jpg`), release_dates are in the warmed window, fetched_at is recent.

- [ ] **Step 4: Device / web performance validation**

Build + run the app. Open the release calendar screen. Observe:
- **Initial load:** target < 300ms from screen mount to first render with data (previously 500ms–1s warm / 10–30s cold). Measure manually by navigating to calendar from a cold start.
- **Month switching:** previous month and next month should both load quickly (both warmed in the current window).
- **No "loading forever" state:** if a month outside the warm window is opened (e.g., 6 months ahead), the screen should show "no releases" rather than spin indefinitely.
- **Filter chip interaction:** flipping filter chips should be instant (client-side filtering — already is, verify unchanged).
- **Watchlist toggle:** still works (this path is unrelated to the calendar read refactor).

If performance is not materially better than pre-SP1, STOP and investigate — most likely cause is that the rows have NULL title fields and are being filtered out (check `WHERE title IS NOT NULL` count).

- [ ] **Step 5: Compare pre/post row counts**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(title) AS with_title,
  MIN(release_date) AS earliest,
  MAX(release_date) AS latest
FROM public.release_calendar;
```

Expected: `total` ≥ 408 (migration preserved rows + warming added some), `with_title` substantially higher than Task 1 Step 3's post-backfill number (warming filled remaining nulls + added new rows with full metadata), `earliest`/`latest` span roughly the warmed window plus any pre-existing historical rows.

- [ ] **Step 6: No commit needed**

This task is validation-only. Proceed to Task 6.

---

## Task 6: PR + code review + squash-merge + vault update

**Context for implementer:** Push branch, open PR, dispatch final code review, wait for CI, squash-merge, update vault, then clean up the orphaned `get-release-calendar` edge function via Supabase dashboard.

- [ ] **Step 1: Push the feature branch**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
git push -u origin feat/release-calendar-foundation 2>&1 | tail -5
```

Expected: new remote branch set up.

- [ ] **Step 2: Open the PR**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
gh pr create --title "feat(calendar): release calendar foundation (SP1)" --body "$(cat <<'EOF'
## Summary

- **Reader/writer split** — client reads release calendar via direct PostgREST (`supabase.from('release_calendar')...`) instead of invoking an edge function. Single round-trip, zero TMDB calls on the user-visible path.
- **Denormalized read model** — renames `release_date_cache` → `release_calendar`, adds 5 movie-metadata columns (title, poster_path, backdrop_path, genre_ids, vote_average) so month queries return everything needed in one SELECT.
- **Background warming** — `get-release-calendar` edge function refactored to warming-only (`verify_jwt=true`), renamed to `warm-release-calendar`. Daily `pg_cron` at 04:00 UTC warms current + next 3 months for region=US.
- **RLS on `release_calendar`** — closes the `rls_disabled_in_public` ERROR advisor. Read policy for `anon` + `authenticated` (data is TMDB-sourced public info); writes gated to service role by default.

This is SP1 of 4 for the calendar. SP2 (client cache hierarchy / prefetch), SP3 (UX polish), SP4 (features — notifications, trailers, widget, multi-region) follow separately.

## Design decisions

| Decision | Value |
|--|--|
| Architecture | Reader/writer split — direct PostgREST read + pg_cron warming |
| Shape | Denormalized single table (movie fields inlined) |
| Warming cadence | Daily 04:00 UTC |
| Warming window | Current + next 3 months |
| Regions | US only (multi-region deferred to SP4) |
| Historical fallback | None — cached rows stay in place; out-of-window months may be empty |
| RLS | Read: `anon` + `authenticated`; Write: service role |
| Edge function auth | `verify_jwt: true` |
| Cron pattern | Inline `net.http_post` (matches existing `check-push-receipts`/`post-daily-metrics` crons) |

Full spec: `docs/superpowers/specs/2026-04-23-release-calendar-foundation-design.md`.

## Migrations (MCP-applied, not committed to `supabase/migrations/`)

- `rename_release_date_cache_to_release_calendar` — rename + 5 column adds + movies-table backfill + RLS + policy
- `setup_release_calendar_warming_cron` — `cron.schedule('warm-release-calendar-daily', '0 4 * * *', ...)`

## Edge function

- `warm-release-calendar` deployed via MCP (`verify_jwt: true`). Old `get-release-calendar` deployment is orphaned (no longer called by client or cron). Will be deleted via Supabase dashboard post-merge.

## Test plan

- [x] Schema migration smoke — row count preserved, new columns present, RLS enabled, policy exists
- [x] Manual seed invocation — warming worker populated title/poster on existing rows + added new rows
- [x] pg_cron registration — job visible in `cron.job`, status 200 response after invocation
- [x] RN unit tests — 5 new cases for `getReleaseCalendar` (query shape, grouping, label mapping, error path, empty result)
- [x] Pre-PR check clean — `npm run lint && npx tsc --noEmit && npm test` → 0 errors, 769/769 tests (764 baseline + 5 new)
- [x] Supabase advisor — `rls_disabled_in_public` cleared for `release_calendar`
- [x] Device performance — calendar screen loads < 300ms from cold (previously 500ms–1s warm / 10–30s cold)

## Changed

- Supabase: 2 MCP migrations applied, 1 new edge function deployed, 1 cron job scheduled
- `supabase/functions/get-release-calendar/` → `supabase/functions/warm-release-calendar/` — directory renamed, `index.ts` rewritten as warming-only worker
- `lib/release-calendar-service.ts` — rewrites `getReleaseCalendar` to PostgREST direct query; day-grouping moves to client
- `__tests__/lib/release-calendar-service.test.ts` — new test file

## Not changed

- `app/release-calendar.tsx` — `ReleaseCalendarResponse` shape preserved; screen code untouched
- `hooks/use-release-calendar.ts` — untouched (only dependency is the service shape, which is preserved)
- `movies` cache table — untouched (used only for the initial backfill inside migration 1)
- All user / auth / watchlist logic — untouched

## Post-merge cleanup (tracked)

- Delete the orphaned `get-release-calendar` edge function deployment via Supabase dashboard (Functions → get-release-calendar → Delete). Safe once this PR has been in production long enough to confirm no regressions (~24h).

## Follow-up work (SP2–SP4)

- **SP2:** Client cache hierarchy (AsyncStorage persistence, prefetch adjacent months, skeleton loaders)
- **SP3:** UX polish (virtualized release-day list, smoother month transitions)
- **SP4:** Feature additions (release notifications, trailer thumbnails, my-releases filter, multi-region user preferences, iCal export, home-screen widget, "coming this week" carousel)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

Expected: PR URL returned.

- [ ] **Step 3: Dispatch final code review**

Use the Agent tool with `subagent_type: "superpowers:code-reviewer"`. Provide:
- PR URL and branch name
- The spec file path for context
- Commit SHAs list
- Focus areas: RLS policy correctness; PostgREST query shape and null filtering; edge function security (`verify_jwt`); cron pattern matches existing project conventions; client day-grouping logic matches the removed edge function logic

Address any Critical/Important issues with follow-up commits on the branch. Minor nits can be deferred.

- [ ] **Step 4: Wait for CI**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
gh pr checks 2>&1 | tail -8
```

Expected: `Lint, Types & Tests` passes. `Cloudflare Pages` / `Vercel` pass. `Security Audit` is known-pre-existing transitive-deps noise — not blocking.

- [ ] **Step 5: Squash-merge**

Ask the user first (they've asked for explicit sign-off on merges in prior sessions, and the session context may vary):

> PR ready to merge. CI: [summary]. Code review: [summary]. Want me to `gh pr merge --squash --auto`, or would you rather merge yourself?

If user says go, run:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-foundation
gh pr merge --squash --auto 2>&1 | tail -3
```

- [ ] **Step 6: Update vault**

Use `mcp__obsidian__write_note` to create a new feature note at `Projects/CineTrak/Features/Release Calendar Foundation (SP1).md` with summary of what shipped, decisions table, follow-up queue for SP2/SP3/SP4.

Use `mcp__obsidian__patch_note` to append to today's daily note (`Daily Notes/<today>.md`, creating if missing from template) under `## Shipped` — link the PR, one-sentence summary.

- [ ] **Step 7: Post-merge: delete orphaned edge function**

This is a manual step — the user (Tyshane) opens the Supabase dashboard → Functions → `get-release-calendar` → Delete. Defer until ~24h of production stability has been observed. Mention this in the PR body already (which the prior step included).

If automating from the implementer side: `mcp__plugin_supabase_supabase__delete_edge_function` does not currently exist. Dashboard is the only path.

---

## Self-Review

**Spec coverage check:**
- Section 1 (schema migration with RLS) → Task 1 ✓
- Section 2 (warming worker refactor) → Task 2 Steps 1-6 ✓
- Section 3 (pg_cron schedule) → Task 3 ✓
- Section 4 (client read-path refactor) → Task 4 ✓
- Testing section (all 5 smoke tests listed in spec) → mapped across Tasks 1-5 ✓
- Out-of-scope items — correctly deferred, not implemented ✓

**Placeholder scan:** No "TBD" / "TODO" / "add error handling" red flags. All SQL is full-text, all TypeScript is full-text, all commit messages spelled out. Exact file paths everywhere. Expected-output blocks on every verification step.

**Type consistency:**
- Column names match between migration (`title`, `poster_path`, etc.) and client query select list and test fixtures.
- `release_calendar` table name used consistently in SQL, TypeScript `supabase.from('release_calendar')`, test mocks.
- `ReleaseCalendarResponse` shape preserved end-to-end (consuming code unchanged).
- Edge function new slug `warm-release-calendar` used consistently in MCP deploy, cron command, seed invocation, PR body.
- Vault secret names `project_url` / `service_role_key` used verbatim in cron command (matches existing Phase 4a/4b pattern exactly).
- Release type labels (`Premiere`, `Limited Theatrical`, `Theatrical`, `Digital`, `Physical`, `TV`) match the mapping that was in the old edge function's `RELEASE_TYPE_LABELS` constant and is reproduced in the new client service.

No inconsistencies identified.
