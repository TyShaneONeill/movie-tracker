# SP1 Fix: Warming Worker Null-Title Reconciliation — Design Spec

**Date:** 2026-04-27
**Status:** Ready for plan
**Feature:** Add a reconciliation pass to the `warm-release-calendar` edge function that fills null-title `release_calendar` rows by directly fetching TMDB movie details
**Parent:** [Release Calendar Foundation (SP1)](./2026-04-23-release-calendar-foundation-design.md) bug fix (data quality)
**Surfaced via:** [SP4-A my-releases filter](./2026-04-26-sp4-my-releases-filter-design.md) device validation
**Bug doc:** `vault://Projects/CineTrak/Bugs & Fixes/SP1 Warming Worker — Null Title Backfill Gap.md`

## Context

48% of `release_calendar` rows in the upcoming-month window (114/237 in US, 2026-04 to 2026-07) had `title: null` until a one-time SQL backfill on 2026-04-27 (mitigation only — fixed 1 row, leaving 113). The client read service (`lib/release-calendar-service.ts`) filters out null-title rows defensively, so 113 movies with valid release dates are **invisible** on the calendar regardless of any user filter.

### Root cause

The current `warm-release-calendar` worker uses TMDB's `/discover/movie` endpoint, which returns the **top 100 most-popular movies per month per region** (5 pages × 20 results × `MAX_DISCOVER_PAGES = 5`). For each movie returned by discover, the worker fetches `/movie/{id}/release_dates` and upserts a row with all denormalized fields (`title`, `poster_path`, etc.) populated.

The bug surfaces in two scenarios:
1. **Pre-SP1 legacy rows** — the SP1 migration added the denormalized columns and backfilled what it could from the `movies` table. For tmdb_ids NOT in `movies`, title stayed null.
2. **Drift over time** — when a movie falls out of TMDB's monthly top-100 (popularity changes after release), the worker stops re-fetching it. The row's title never refreshes; new fields (added in future SP1 follow-ups) stay null.

The discover-only re-fetch design is the structural cause: discover is popularity-bounded, so a row whose tmdb_id is no longer in the top-100 for any month becomes orphaned in `release_calendar`.

### Why this matters now

[SP4-A my-releases filter](./2026-04-26-sp4-my-releases-filter-design.md) shipped a feature that lets users filter the calendar to only their watchlisted movies. Niche/indie/foreign movies that users add to watchlists are exactly the ones MOST likely to NOT be in TMDB's monthly top-100, and therefore most likely to have null titles in our cache. SP4-A device validation surfaced this for "The Sheep Detectives" (tmdb_id 1301421, US theatrical 2026-05-08) — the row was in `release_calendar` but invisible because `title: null`.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| Fix approach | Reconciliation pass appended to the existing warming worker (Q1 Option A) |
| Scope | Same warm window as discover-driven warming (current month + `monthsAhead`, default 4 months) (Q2 Option A) |
| TMDB endpoint | `/movie/{id}` (movie details) — direct lookup by id, bypasses discover popularity ceiling |
| Batching | 20-wide concurrent fetches with 250ms inter-batch delay (mirrors existing worker pattern) |
| Failure mode (404) | Skip row this run; log via `console.warn`; next cron retries |
| Failure mode (empty title from TMDB) | Skip — treat as still-null; some indie/foreign films have empty `title` early-on |
| Failure mode (network/rate-limit) | Per-row try/catch swallows; row stays null; next cron retries |
| Response body | Extend with `rows_reconciled: number` |
| Observability | `console.log` lines for "reconciling N null-title rows" and "reconciled M rows from N attempts"; per-row failures via `console.warn` |
| Idempotency | Re-running is safe (upsert with same conflict key); no duplicate rows or corruption |
| Out of scope | Multi-region (only US warmed today), historical-month reconciliation, alerting on persistent nulls, replacing the client `.not('title', 'is', null)` filter |

## Scope

### 1. Modify `supabase/functions/warm-release-calendar/index.ts`

Add a reconciliation pass between the existing dedup/upsert step and the response-build step. New code lives in the same `Deno.serve` handler, after the existing per-month loop completes.

**Pseudo-flow inserted after the existing `byKey` dedup but before the response:**

```ts
// === SP1 reconciliation: fill null-title rows ===
const warmStart = `${monthsWarmed[0]}-01`;
const lastMonth = monthsWarmed[monthsWarmed.length - 1];
const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);
const lastDay = new Date(lastYear, lastMonthNum, 0).getDate();
const warmEnd = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;

const { data: nullTitleRows, error: queryErr } = await supabase
  .from('release_calendar')
  .select('tmdb_id, region, release_type')
  .is('title', null)
  .eq('region', region)
  .gte('release_date', warmStart)
  .lte('release_date', warmEnd);

if (queryErr) {
  console.error('[warm-release-calendar] reconciliation query failed:', queryErr);
}

let rowsReconciled = 0;
if (nullTitleRows && nullTitleRows.length > 0) {
  console.log(
    `[warm-release-calendar] Reconciling ${nullTitleRows.length} null-title rows for region=${region}`
  );

  const reconciliationRows: Partial<ReleaseCalendarRow>[] = [];

  for (let i = 0; i < nullTitleRows.length; i += BATCH_SIZE) {
    const batch = nullTitleRows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const url = `${TMDB_BASE_URL}/movie/${row.tmdb_id}?api_key=${TMDB_API_KEY}`;
          const res = await fetch(url);
          if (!res.ok) {
            // 404 = unknown id; 429 = rate-limit; 5xx = TMDB hiccup. All retry-on-next-run.
            console.warn(
              `[warm-release-calendar] reconcile fetch failed for ${row.tmdb_id}: ${res.status}`
            );
            return null;
          }
          const data = (await res.json()) as {
            title: string;
            poster_path: string | null;
            backdrop_path: string | null;
            genres: { id: number }[];
            vote_average: number | null;
          };
          if (!data.title) return null; // empty title → still un-fixable

          return {
            tmdb_id: row.tmdb_id,
            region: row.region,
            release_type: row.release_type,
            title: data.title,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            genre_ids: data.genres?.map((g) => g.id) ?? null,
            vote_average: data.vote_average ?? null,
          };
        } catch (e) {
          console.error(
            `[warm-release-calendar] reconcile fetch threw for ${row.tmdb_id}:`,
            e
          );
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) reconciliationRows.push(r);
    }

    if (i + BATCH_SIZE < nullTitleRows.length) {
      await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
    }
  }

  if (reconciliationRows.length > 0) {
    // Upsert preserves existing release_date, certification, note, fetched_at —
    // only the denormalized metadata fields update.
    const { error: updateErr } = await supabase
      .from('release_calendar')
      .upsert(reconciliationRows, {
        onConflict: 'tmdb_id,region,release_type',
        // Important: don't reset fetched_at; pure-metadata reconciliation
        ignoreDuplicates: false,
      });
    if (updateErr) {
      console.error('[warm-release-calendar] reconcile upsert failed:', updateErr);
    } else {
      rowsReconciled = reconciliationRows.length;
      console.log(
        `[warm-release-calendar] Reconciled ${rowsReconciled} rows from ${nullTitleRows.length} attempted`
      );
    }
  }
}
// === end reconciliation ===

const response: ResponseBody = {
  rows_upserted: deduped.length,
  rows_reconciled: rowsReconciled,
  months_warmed: monthsWarmed,
  duration_ms: Date.now() - started,
};
```

**Important detail: `fetched_at` semantics for reconciliation upserts.** The existing worker sets `fetched_at = new Date().toISOString()` for every discover-driven row. The reconciliation upsert does NOT include `fetched_at` in the row payload — the upsert operation will preserve the existing value (Postgres `INSERT ... ON CONFLICT DO UPDATE` only updates columns explicitly listed). This is intentional: reconciliation is fixing metadata that was missing, not refreshing the row's "last warm cycle" stamp. The next discover-driven warming will set it normally.

Wait — Supabase's `.upsert()` builds an `INSERT ... ON CONFLICT DO UPDATE SET col = excluded.col` for **every column in the payload**. Columns NOT in the payload are excluded from the SET clause and preserved. So omitting `fetched_at` from `reconciliationRows` correctly preserves it. ✓

### 2. Update `ResponseBody` type

```ts
interface ResponseBody {
  rows_upserted: number;
  rows_reconciled: number;  // NEW
  months_warmed: string[];
  duration_ms: number;
}
```

No client consumes this response yet (pg_cron invokes the worker; the response goes to `net._http_response` log table). Adding a field is non-breaking.

### 3. No schema migration

`release_calendar` table is unchanged. The fix operates on existing columns.

### 4. No client changes

`lib/release-calendar-service.ts`'s `.not('title', 'is', null)` filter stays. It's defense-in-depth; the reconciliation pass should converge null titles to 0, but the filter prevents broken rows from rendering during the convergence window.

### 5. Manual one-time invocation post-deploy

After PR merges and the edge function redeploys, manually invoke the worker via Supabase MCP to immediately fix the 113 known stuck rows:

```
mcp__plugin_supabase_supabase__execute_sql with:
  SELECT net.http_post(
    url := <warm-release-calendar URL>,
    headers := <auth headers>,
    body := '{"months_ahead": 3, "region": "US"}'::jsonb,
    timeout_milliseconds := 600000
  );
```

This kicks the reconciliation pass before the next 04:00 UTC scheduled cron. Verify post-run via:

```
SELECT COUNT(*) FILTER (WHERE title IS NULL) AS null_titles_after
FROM release_calendar
WHERE region = 'US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months';
```

Expected: < 113 (some tmdb_ids may have been deleted from TMDB and return 404; those stay null, recoverable only if TMDB reinstates them).

## Data flow

### Daily cron run (04:00 UTC)

```
1. pg_cron fires net.http_post → warm-release-calendar edge function
2. Worker iterates 4 months × 5 discover pages × 20 movies = up to 400 candidates
3. Per movie: fetch /release_dates, build rows for matching region
4. Dedup, upsert (existing logic) — populates ~100-300 rows with title etc.
5. NEW: query release_calendar for null-title rows in warm window
6. NEW: per stuck row, fetch /movie/{id} (batched 20-wide × 250ms)
7. NEW: upsert reconciliation rows (title, poster, etc.) — preserves fetched_at
8. Return response with rows_upserted + rows_reconciled
```

### One-off manual invocation post-deploy

Same flow; just kicked off immediately rather than waiting for 04:00 UTC.

### Convergence over time

- Day 1 (post-deploy manual run): 113 nulls → ~10 nulls (TMDB-deleted ids stay null; everything else fixes)
- Day 2 (next cron): ~10 nulls → ~10 nulls (no change; same ids still 404)
- Day N: stable at "TMDB-deleted ids only"
- New nulls arrive as movies fall out of discover top-100; reconciliation catches them on next run

## Error handling

| Failure | Behavior |
|---|---|
| Reconciliation query fails (Postgres) | `console.error`, set `rowsReconciled = 0`, continue. Worker still returns 200 with `rows_reconciled: 0`. |
| TMDB returns 404 (unknown tmdb_id) | `console.warn`, skip row. Next run retries. |
| TMDB returns 429 (rate limit) | Same — skip silently, next run retries. |
| TMDB returns 5xx | Same. |
| Network error | Per-row try/catch swallows. |
| TMDB returns 200 with empty `title` | Treated as null in `if (!data.title) return null`; row stays null. |
| Reconciliation upsert fails | `console.error`, set `rowsReconciled = 0`. Existing nulls stay; next run retries. |
| Worker timeout (10min ceiling) | Discover-driven warming runs first; reconciliation is appended. If reconciliation pushes total past 10min, it's truncated mid-batch. Next cron run picks up where this left off. **Estimated reconciliation time:** 113 rows × ~50ms / 20-wide batches ≈ 6s. Well under timeout. |

## Testing

### Unit — reconciliation logic

This pass is mostly orchestration in the edge function (Deno runtime). Pure-function extraction for unit testing is awkward because Deno tests run differently from Jest. The plan punts unit tests for the reconciliation pass and relies on:

1. **Type checks** — TypeScript will catch shape mismatches in the row payload at deploy time
2. **Live integration smoke** — manual invocation post-deploy, verify counts via Supabase MCP queries
3. **Idempotency check** — invoke twice in a row, second invocation should report `rows_reconciled: 0` (everything fixed) or a small stable number (TMDB-deleted ids)

This matches the existing warming worker's testing posture (no Jest tests for the worker itself; covered by integration smoke).

### Smoke test plan (post-deploy)

```sql
-- 1. Pre-invoke count
SELECT COUNT(*) FILTER (WHERE title IS NULL) AS pre_run
FROM release_calendar
WHERE region = 'US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months';
-- Expect: 113 (or close)

-- 2. Manual invocation via net.http_post (see "Manual one-time invocation" above)

-- 3. Post-invoke count (wait ~30s for response)
SELECT COUNT(*) FILTER (WHERE title IS NULL) AS post_run
FROM release_calendar
WHERE region = 'US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months';
-- Expect: <<113 (probably <20)

-- 4. Spot check Sheep Detectives still populated (regression check)
SELECT title FROM release_calendar WHERE tmdb_id = 1301421;
-- Expect: 'The Sheep Detectives'

-- 5. Check edge function logs for [warm-release-calendar] Reconciliation lines
-- via Supabase Studio → Functions → warm-release-calendar → logs
```

### Pre-PR gate

```bash
npm run lint && npx tsc --noEmit && npm test
```

The Deno edge function is excluded from the project's `tsc` (different runtime), but lint should still cover it. Tests should remain at 867 (no new app tests).

The edge function deploys via `supabase functions deploy warm-release-calendar`. PR merge alone doesn't deploy it — Tyshane (or CI if/when configured) needs to run the deploy command. Document this in the PR description.

## Out of scope

- **Multi-region reconciliation** — only US is warmed today; multi-region is a future SP4 sub-feature
- **Historical (past-month) reconciliation** — warm window only; users mostly care about upcoming releases
- **Alerting** — `console.log/warn/error` lines visible in Supabase Edge Function logs are sufficient observability for now
- **Replacing the `.not('title', 'is', null)` client filter** — defense-in-depth stays
- **Marking persistently-stuck tmdb_ids** (after N failures) — premature; TMDB-deleted ids are a tiny fraction
- **Changing the worker's invocation auth** (`verify_jwt: true`) — unchanged
- **Increasing `MAX_DISCOVER_PAGES`** — would just delay the bug; reconciliation is the real fix
- **Persistence of partial reconciliation progress across cron runs** — each run is stateless; the next run starts fresh and converges

## Risks

- **TMDB API quota**: 113 calls/run on free tier (10k/day) is trivial. Even if reconciliation grows to 500+ rows, well under daily quota.
- **Edge function 10min timeout**: 113 rows × ~50ms / 20-wide ≈ 6s; ample headroom.
- **TMDB 404 on legacy ids**: a small fraction of the 113 may be tmdb_ids that TMDB has since deleted (e.g. movie merged with another tmdb_id). These stay null forever. The client filter hides them.
- **Discover-API drift in same run**: a movie returned by discover on the SAME run as it would also be reconciled — no conflict, the upsert with `onConflict: 'tmdb_id,region,release_type'` handles both writes. Last write wins; both write the same metadata.
- **Reconciliation upsert race**: if discover-driven upsert and reconciliation upsert touch the same row in the same edge function invocation, they're serial (not concurrent). No race.

## Dependencies / sequencing

Depends on:
- SP1 (PR #397) — `release_calendar` table, the existing warming worker, pg_cron schedule
- TMDB API — `/movie/{id}` endpoint (different from `/discover/movie`)
- Supabase Edge Function deploy — `supabase functions deploy warm-release-calendar` post-merge
- Supabase MCP for manual one-off invocation

Unblocks:
- Watchlisted niche movies (like "The Sheep Detectives") become visible on the calendar — completes the SP4-A UX promise
- Future features that depend on `release_calendar` data quality (notifications, widget integration, multi-region) get a more reliable data source

## References

- [Bug doc: SP1 Warming Worker — Null Title Backfill Gap](vault://Projects/CineTrak/Bugs%20%26%20Fixes/SP1%20Warming%20Worker%20%E2%80%94%20Null%20Title%20Backfill%20Gap.md)
- [SP1 Foundation Design](./2026-04-23-release-calendar-foundation-design.md)
- [SP4-A My-Releases Filter Design](./2026-04-26-sp4-my-releases-filter-design.md) — surfaced the bug
- PR #397 (SP1) — original warming worker
- PR #403 (SP4-A) — the feature whose validation found this
- TMDB `/movie/{id}` docs — https://developer.themoviedb.org/reference/movie-details
