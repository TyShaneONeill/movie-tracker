# Release Calendar Foundation (SP1) Design Spec

**Date:** 2026-04-23
**Status:** Ready for plan
**Feature:** Release calendar performance foundation — reader/writer split, denormalized read model, background warming, RLS
**Parent initiative:** "Enterprise-grade release calendar" (SP1 of 4)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`
**Companion follow-ups:** SP2 (client cache hierarchy), SP3 (UX polish), SP4 (feature additions — notifications, trailers, widget, multi-region, etc.) — out of scope for this spec

## Context

`app/release-calendar.tsx` is the month-view calendar screen. Today's flow:

1. Client calls `useReleaseCalendar({ month, year })`
2. React Query invokes the `get-release-calendar` Supabase edge function (`verify_jwt: false`)
3. Edge function checks `release_date_cache` freshness by looking for any row in the month with `fetched_at >= now() - 24h`
4. On cold cache: up to **~300 TMDB HTTP calls** (5 discover pages × 20 movies + 100 release_dates detail calls + up to 100 movie info fallbacks), batched 20 wide with 250ms delays. First-load p95 ≈ 10–30 seconds.
5. On warm cache: 3 DB queries + potential TMDB fallback for missing `movies` rows. Typical 500ms–1s.
6. Response built as day-grouped structure

Problems:
- **Cold cache is on the user-visible path** — someone always pays the cost
- **Edge function overhead** (~100–300ms) even on warm cache
- **RLS disabled on `release_date_cache`** — flagged by Supabase security advisor as ERROR (`rls_disabled_in_public`). Surfaced during PR #394 code review; this spec folds the fix in.
- **Edge function is publicly callable** (`verify_jwt: false`) — anyone can spam TMDB quota
- **No prefetch or adjacent-month warming** — navigating months always shows a loader
- **Growth ceiling** — 408 rows today is small; planned features (notifications, trailers, multi-region, widget integration) will multiply reads and need faster foundations

## Design decisions (resolved during brainstorm)

| Decision | Value |
|--|--|
| Architecture | Reader/writer split. Client reads via direct PostgREST query. Edge function becomes background warming worker only. |
| Read-path shape | Single denormalized table (rename `release_date_cache` → `release_calendar`) with movie fields inlined (title, poster_path, backdrop_path, genre_ids, vote_average). Zero-join query. |
| Warming cadence | Daily at 04:00 UTC via pg_cron |
| Warming window | Current + next 3 months (4 months total) |
| Regions | US only for SP1. Multi-region deferred to SP4 (user-configurable). |
| Historical fallback | None. Months outside the warm window return whatever's already cached. UI shows "no releases" state for empty historical months. |
| RLS on `release_calendar` | Enabled. Read: `anon` + `authenticated`. Write: service role only (no explicit policy → default-deny for authenticated/anon writes). |
| Edge function auth | `verify_jwt: true`. pg_cron invokes via `pg_net.http_post` with service role key in Authorization header. |
| Cron pattern | Inline `net.http_post` in `cron.schedule` command (matches existing `check-push-receipts` and `post-daily-metrics` crons — no wrapper SQL function) |
| Client response shape | Unchanged (`ReleaseCalendarResponse`). Client-side groups flat rows into day buckets after PostgREST returns. |

## Scope

### 1. Schema migration — `rename_release_date_cache_to_release_calendar`

MCP-applied (project convention; not committed to `supabase/migrations/`).

```sql
-- Rename the table
ALTER TABLE public.release_date_cache RENAME TO release_calendar;

-- Add denormalized movie fields (all nullable — populated by warming worker)
ALTER TABLE public.release_calendar
  ADD COLUMN title text,
  ADD COLUMN poster_path text,
  ADD COLUMN backdrop_path text,
  ADD COLUMN genre_ids integer[],
  ADD COLUMN vote_average numeric;

-- Update COMMENT
COMMENT ON TABLE public.release_calendar IS
  'TMDB-sourced release calendar. Denormalized for single-query client reads via PostgREST. Populated daily by warm-release-calendar edge function via pg_cron. PK tmdb_id + region + release_type.';

-- Rename existing indexes for clarity
ALTER INDEX public.release_date_cache_pkey RENAME TO release_calendar_pkey;
ALTER INDEX public.release_date_cache_tmdb_id_region_release_type_key
  RENAME TO release_calendar_tmdb_id_region_release_type_key;
ALTER INDEX public.idx_release_date_cache_date_region
  RENAME TO idx_release_calendar_date_region;
ALTER INDEX public.idx_release_date_cache_tmdb_fetched
  RENAME TO idx_release_calendar_tmdb_fetched;

-- Backfill denormalized columns from the existing movies table
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

-- Read policy: anyone (anon or authenticated) can SELECT
CREATE POLICY "release_calendar_read_all"
  ON public.release_calendar
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No explicit write policy — service role bypasses RLS by default.
-- Authenticated/anon writes are therefore denied.
```

### 2. Warming worker — `warm-release-calendar` edge function

Rename `get-release-calendar` → `warm-release-calendar`. Set `verify_jwt: true`. Refactor to warming-only behavior.

**Request body:**
```ts
{
  months_ahead?: number;  // default: 3
  region?: string;        // default: "US"
}
```

**Response body:**
```ts
{
  rows_upserted: number;
  months_warmed: string[];  // ["2026-04", "2026-05", "2026-06", "2026-07"]
  duration_ms: number;
}
```

**Flow:**
1. Parse + validate body (clamp `months_ahead` to `[0, 6]`, default region to `"US"`)
2. For each month in `[currentMonth, currentMonth + months_ahead]`:
   a. TMDB discover paged (up to 5 pages, stop when `page > total_pages`)
   b. For each movie: fetch release_dates + basic details in batches of 20 with 250ms delay
   c. Build denormalized rows with ALL fields populated (tmdb_id, region, release_type, release_date, certification, note, title, poster_path, backdrop_path, genre_ids, vote_average, fetched_at = NOW)
3. Upsert all rows to `release_calendar` with `onConflict: 'tmdb_id, region, release_type'`
4. Return summary

**Invariants:**
- Never called from the client. pg_cron is the only invoker.
- `verify_jwt: true` — unauthenticated calls rejected at edge runtime.
- No schema changes beyond what migration 1 installs.
- Fails open on individual movie detail fetch errors (per-row logging; other rows still upserted). Full failure (TMDB outage) logs + returns non-2xx without partial write rollback — next cron run recovers.

### 3. pg_cron schedule

Migration name: `setup_release_calendar_warming_cron`.

Follows the **same inline pattern** as existing cron jobs `check-push-receipts` (Phase 4a push) and `post-daily-metrics` (Phase 4b Discord metrics) — reads vault secrets `project_url` and `service_role_key` inside the cron command. No wrapper SQL function needed.

```sql
-- pg_cron + pg_net extensions already enabled on the project.
-- Vault secrets 'project_url' and 'service_role_key' already configured
-- (reused from the existing push + Discord metrics crons).

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
    timeout_milliseconds := 600000  -- 10 min ceiling; typical run <5 min
  ) AS request_id;
  $$
);
```

**Vault secrets:** `project_url` and `service_role_key` already exist on the project (used by `check-push-receipts` and `post-daily-metrics`). No new secret provisioning required.

**First-run behavior:** migration 1's backfill fills most denormalized columns from `movies` table. First cron run (or manual invocation) populates any remaining nulls and updates `fetched_at`.

### 4. Client read-path refactor — `lib/release-calendar-service.ts`

Replace edge function invocation with direct PostgREST query. `ReleaseCalendarResponse` shape stays unchanged so `app/release-calendar.tsx` and `hooks/use-release-calendar.ts` need no changes.

**Before:**
```ts
export async function getReleaseCalendar(month, year, region = 'US') {
  const { data, error } = await supabase.functions.invoke<ReleaseCalendarResponse>(
    'get-release-calendar',
    { body: { month, year, region } }
  );
  if (error) throw new Error(error.message || 'Failed to fetch release calendar');
  if (!data) throw new Error('No data returned from release calendar');
  return data;
}
```

**After:**
```ts
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
    .not('title', 'is', null)  // skip rows not yet warmed (no movie metadata)
    .order('release_date', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch release calendar');

  const rows = data ?? [];

  // Group by date (moved from edge function to client)
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
  const days: CalendarDay[] = sortedDates.map(date => ({ date, releases: dayMap.get(date)! }));

  return {
    days,
    dates_with_releases: sortedDates,
    total_results: rows.length,
  };
}
```

`.not('title', 'is', null)` intentionally filters out rows that haven't been warmed yet (e.g., a partial edge-function failure). Safer than showing a release card with no title.

`getWatchlistTmdbIds` unchanged.

## Testing

### Migration smoke (MCP)

```sql
-- Pre-migration
SELECT COUNT(*) FROM public.release_date_cache;  -- expect 408
-- Apply migration
-- Post-migration
SELECT COUNT(*) FROM public.release_calendar;   -- expect 408
\d public.release_calendar                       -- expect 5 new columns
SELECT COUNT(*) FROM public.release_calendar WHERE title IS NOT NULL;  -- expect substantial coverage from backfill
-- RLS
SELECT rowsecurity FROM pg_tables WHERE tablename = 'release_calendar';  -- expect true
SELECT policyname FROM pg_policies WHERE tablename = 'release_calendar';  -- expect release_calendar_read_all
```

### Warming worker smoke (MCP)

Manually invoke the edge function with `months_ahead: 1, region: "US"`. Verify:
- Returns 2xx within 10 min
- `rows_upserted` > 0
- Subsequent SELECT on `release_calendar` shows non-null title/poster fields for newly-upserted rows
- `fetched_at` updated to NOW

### pg_cron validation

```sql
-- After migration 3
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'warm-release-calendar-daily';
-- Manually run the same command cron will execute — copy-paste from cron.job.command or:
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
       || '/functions/v1/warm-release-calendar',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
  ),
  body := '{"months_ahead": 1, "region": "US"}'::jsonb,
  timeout_milliseconds := 600000
);
-- Check pg_net response log (wait ~30s after invocation)
SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 3;
```

### Client read smoke (RN unit test)

Mock `supabase.from('release_calendar')` chain with `.select().eq().gte().lte().not().order()` returning 3 rows spanning 2 dates. Assert:
- `ReleaseCalendarResponse.days.length === 2`
- `days[0].releases` grouped correctly by date
- `release_type_label` mapped from the type integer
- `total_results === 3`
- Rows with `title: null` filtered out (add a 4th row with null title, assert it's not in output)

### Advisor clearance

```sql
-- Via mcp__plugin_supabase_supabase__get_advisors type='security'
-- Expected: no rls_disabled_in_public entry for release_calendar
-- (No new PL/pgSQL function introduced — cron uses inline net.http_post —
--  so no function_search_path_mutable addition to worry about)
```

### Performance validation (device)

After warming has populated the current month:
- Open calendar screen; time to first render ≤ 300ms (network-dependent; measure p50 from 5 opens)
- Switch months; both warmed and non-warmed should be under 500ms
- Compare to current baseline (expect 10x+ improvement on cold cache)

## Out of scope

- **SP2 (client cache hierarchy)** — AsyncStorage persistence, prefetch adjacent months, skeleton loaders
- **SP3 (UX polish)** — virtualized release-day list, smoother month transitions
- **SP4 (features)** — release notifications, trailer thumbnails, my-releases filter, multi-region user preferences, iCal export, home-screen widget integration, "coming this week" carousel
- **Historical reactive warming** — months outside the 3-month forward window show whatever's cached (may be empty for very old or distant future)
- **Multi-region warming** — US only; warming job structure is extensible (`region` param already threaded through)
- **Batch re-warming on TMDB changes** — no webhook/change-feed; daily cron refreshes everything in window
- **Cache invalidation beyond daily cron** — if a movie's release date shifts between 04:00 UTC runs, the widget/calendar shows stale data for up to 24h
- **Removing old edge function code paths defensively** — full refactor of `get-release-calendar` to `warm-release-calendar` includes dropping the read-path logic (movie-info fallback, day grouping) since the client now handles that

## Dependencies / sequencing

Depends on:
- `pg_cron` extension (already enabled — used in Phase 4a push cron + Phase 4b Discord metrics cron)
- `pg_net` extension (already enabled — used in those same cron jobs)
- Supabase Vault (available in all paid plans; free tier has limitations — verify before rollout)

Unblocks:
- SP2 (prefetch becomes cheap — 3 more PostgREST queries vs 3 edge function invocations)
- SP4 release notifications (can subscribe to `release_calendar` changes or join against it)
- Multi-region expansion (single parameter change on cron invocation)

## References

- `vault://Projects/CineTrak/Features` — existing PRD docs (none specific to release calendar yet; this spec establishes the foundation)
- Phase 4a push notifications cron — reference implementation pattern for pg_cron + pg_net + vault secrets
- PR #394 final review (2026-04-22) — flagged `rls_disabled_in_public` on `release_date_cache` as post-merge follow-up; this spec fulfills that
- Supabase security advisor lint: `rls_disabled_in_public` (ERROR-level), `function_search_path_mutable` (WARN)
