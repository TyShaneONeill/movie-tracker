# SP1 Warming Worker Null-Title Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reconciliation pass to the `warm-release-calendar` edge function that queries `release_calendar` for null-title rows in the warm window and fills them by fetching `/movie/{id}` directly from TMDB.

**Architecture:** Single-file change in `supabase/functions/warm-release-calendar/index.ts`. After the existing discover-driven warming loop completes (and after dedup/upsert), insert a new pass that reads null-title rows in the warm window, batched-fetches movie details from TMDB, and bulk-upserts the metadata. Idempotent self-heal — fixes both pre-SP1 legacy rows and future drift as movies fall out of TMDB's monthly top-100 popularity ceiling.

**Tech Stack:** Deno (Supabase Edge Function), TypeScript, Supabase JS client, TMDB v3 API.

**Spec:** [`docs/superpowers/specs/2026-04-27-sp1-warming-reconcile-null-titles-design.md`](../specs/2026-04-27-sp1-warming-reconcile-null-titles-design.md)

**Branch:** `fix/sp1-warming-reconcile-null-titles`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp1-warming-reconciliation`

**Note on testing posture:** The existing warming worker has no Jest unit tests — it's a Deno edge function, awkward to test in the project's Jest/jest-expo setup. This plan inherits that posture: no new unit tests, validation via lint + tsc (where applicable) + live integration smoke post-deploy. Matches Tyshane's prior pattern for SP1 itself.

---

## Task 1: Add reconciliation pass to `warm-release-calendar/index.ts`

**Files:**
- Modify: `supabase/functions/warm-release-calendar/index.ts`

- [ ] **Step 1: Read the current worker file to orient yourself**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp1-warming-reconciliation
cat supabase/functions/warm-release-calendar/index.ts
```

Note line numbers for:
- The `interface ResponseBody { ... }` declaration (~line 47)
- The `byKey` Map dedup block (`const byKey = new Map<...>...`)
- The `if (deduped.length > 0) { await supabase.from('release_calendar').upsert(...) }` block
- The final `const response: ResponseBody = { ... }` construction

You'll insert the reconciliation pass between the existing upsert block and the response construction.

- [ ] **Step 2: Extend the `ResponseBody` interface to add `rows_reconciled`**

Find the existing `interface ResponseBody { ... }` block and add a new field:

```ts
interface ResponseBody {
  rows_upserted: number;
  rows_reconciled: number;  // NEW: count of null-title rows fixed via /movie/{id}
  months_warmed: string[];
  duration_ms: number;
}
```

- [ ] **Step 3: Insert the reconciliation pass between the dedup-upsert and response-build**

Find this existing block (around lines 158-167 of the original file):

```ts
    if (deduped.length > 0) {
      const { error } = await supabase
        .from('release_calendar')
        .upsert(deduped, { onConflict: 'tmdb_id,region,release_type' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }

    const response: ResponseBody = {
      rows_upserted: deduped.length,
      months_warmed: monthsWarmed,
      duration_ms: Date.now() - started,
    };
```

Replace with this expanded block (note: the existing upsert is unchanged; the reconciliation block is inserted between it and the response construction; the response now includes `rows_reconciled`):

```ts
    if (deduped.length > 0) {
      const { error } = await supabase
        .from('release_calendar')
        .upsert(deduped, { onConflict: 'tmdb_id,region,release_type' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }

    // === Reconciliation pass ===
    // Fix null-title rows in the warm window by fetching /movie/{id} directly.
    // Bypasses the discover-API popularity ceiling: rows for movies that have
    // fallen out of TMDB's monthly top-100 (or pre-SP1 legacy rows that were
    // never in `movies` table) get their metadata populated here.
    // Idempotent — re-runs converge any remaining null-title rows over time.
    const warmStart = `${monthsWarmed[0]}-01`;
    const lastMonthLabel = monthsWarmed[monthsWarmed.length - 1];
    const [lastYear, lastMonthNum] = lastMonthLabel.split('-').map(Number);
    const lastDayOfWindow = new Date(lastYear, lastMonthNum, 0).getDate();
    const warmEnd = `${lastMonthLabel}-${String(lastDayOfWindow).padStart(2, '0')}`;

    const { data: nullTitleRows, error: queryErr } = await supabase
      .from('release_calendar')
      .select('tmdb_id, region, release_type')
      .is('title', null)
      .eq('region', region)
      .gte('release_date', warmStart)
      .lte('release_date', warmEnd);

    let rowsReconciled = 0;
    if (queryErr) {
      console.error('[warm-release-calendar] reconciliation query failed:', queryErr);
    } else if (nullTitleRows && nullTitleRows.length > 0) {
      console.log(
        `[warm-release-calendar] Reconciling ${nullTitleRows.length} null-title rows for region=${region}`
      );

      const reconciliationRows: Array<Pick<
        ReleaseCalendarRow,
        | 'tmdb_id'
        | 'region'
        | 'release_type'
        | 'title'
        | 'poster_path'
        | 'backdrop_path'
        | 'genre_ids'
        | 'vote_average'
      >> = [];

      for (let r = 0; r < nullTitleRows.length; r += BATCH_SIZE) {
        const batch = nullTitleRows.slice(r, r + BATCH_SIZE);
        const fetchResults = await Promise.all(
          batch.map(async (stuck) => {
            try {
              const url = `${TMDB_BASE_URL}/movie/${stuck.tmdb_id}?api_key=${TMDB_API_KEY}`;
              const detailRes = await fetch(url);
              if (!detailRes.ok) {
                // 404 = unknown id; 429 = rate-limit; 5xx = TMDB hiccup. Retry next run.
                console.warn(
                  `[warm-release-calendar] reconcile fetch failed for ${stuck.tmdb_id}: ${detailRes.status}`
                );
                return null;
              }
              const detail = (await detailRes.json()) as {
                title: string;
                poster_path: string | null;
                backdrop_path: string | null;
                genres: { id: number }[];
                vote_average: number | null;
              };
              if (!detail.title) return null; // empty title → still un-fixable

              return {
                tmdb_id: stuck.tmdb_id,
                region: stuck.region,
                release_type: stuck.release_type,
                title: detail.title,
                poster_path: detail.poster_path,
                backdrop_path: detail.backdrop_path,
                genre_ids: detail.genres?.map((g) => g.id) ?? null,
                vote_average: detail.vote_average ?? null,
              };
            } catch (e) {
              console.error(
                `[warm-release-calendar] reconcile fetch threw for ${stuck.tmdb_id}:`,
                e
              );
              return null;
            }
          })
        );

        for (const result of fetchResults) {
          if (result) reconciliationRows.push(result);
        }

        if (r + BATCH_SIZE < nullTitleRows.length) {
          await new Promise((res) => setTimeout(res, BATCH_DELAY_MS));
        }
      }

      if (reconciliationRows.length > 0) {
        // Upsert with onConflict triggers UPDATE for existing rows; the SET
        // clause only includes columns in the payload, so release_date,
        // certification, note, and fetched_at are preserved (not overwritten
        // with NULL or now()).
        const { error: reconcileErr } = await supabase
          .from('release_calendar')
          .upsert(reconciliationRows, {
            onConflict: 'tmdb_id,region,release_type',
            ignoreDuplicates: false,
          });
        if (reconcileErr) {
          console.error(
            '[warm-release-calendar] reconcile upsert failed:',
            reconcileErr
          );
        } else {
          rowsReconciled = reconciliationRows.length;
          console.log(
            `[warm-release-calendar] Reconciled ${rowsReconciled} rows from ${nullTitleRows.length} attempted`
          );
        }
      }
    }
    // === end reconciliation pass ===

    const response: ResponseBody = {
      rows_upserted: deduped.length,
      rows_reconciled: rowsReconciled,
      months_warmed: monthsWarmed,
      duration_ms: Date.now() - started,
    };
```

**Important notes for the implementer:**

1. The reconciliation rows payload uses a TypeScript `Pick<ReleaseCalendarRow, ...>` type — only the columns we want to UPDATE are included. Other columns (`release_date`, `certification`, `note`, `fetched_at`) are intentionally omitted; Supabase's `.upsert()` builds an `INSERT ... ON CONFLICT DO UPDATE SET col = excluded.col` for each column in the payload only, preserving the omitted columns.

2. The reuse of constants (`BATCH_SIZE`, `BATCH_DELAY_MS`, `TMDB_BASE_URL`, `TMDB_API_KEY`) means no new constants are introduced — the reconciliation pass mirrors the existing worker's batching pattern.

3. The variable name `r` is used as the outer loop index to avoid shadowing the existing `i` and `i2` variables in the discover-driven loops above.

4. The `fetchResults` array typing is implicit (TypeScript infers from the `Promise.all` of mapped async functions returning `T | null`). No explicit type needed.

- [ ] **Step 4: Verify the file still parses**

Run:
```bash
npx tsc --noEmit
```

The Deno edge function may not be in the project's tsc include path (it has Deno-specific imports like `jsr:@supabase/functions-js`). If tsc skips it, that's expected — Deno's runtime checks the file at deploy time.

If tsc errors do show up specifically about `supabase/functions/warm-release-calendar/index.ts`, address them. Otherwise, expect 0 errors (matches baseline).

- [ ] **Step 5: Run lint to ensure no project-level rule is broken**

Run:
```bash
npm run lint
```

Expected: 0 errors, 8 pre-existing warnings (unchanged from baseline).

- [ ] **Step 6: Run the test suite to confirm nothing broke**

Run:
```bash
npm test -- --silent 2>&1 | grep "Tests:"
```

Expected: 867 passing (unchanged from post-SP4-A baseline). The edge function isn't covered by Jest, but the count should stay stable.

- [ ] **Step 7: Commit the change**

```bash
git add supabase/functions/warm-release-calendar/index.ts
git commit -m "$(cat <<'EOF'
fix(calendar): reconcile null-title release_calendar rows via direct TMDB fetch

Adds a reconciliation pass to warm-release-calendar that runs after the
existing discover-driven warming loop. Queries release_calendar for
null-title rows in the warm window, fetches /movie/{id} directly
(bypassing the discover-API popularity ceiling), and upserts metadata.
Idempotent self-heal — converges null titles over 1-2 cron runs.

Root cause: discover endpoint returns top 100 movies/month sorted by
popularity. Movies that fall out of this top-100 (or pre-SP1 legacy
rows that were never in `movies` table for the SP1 backfill) are never
re-fetched. The /movie/{id} endpoint accepts any tmdb_id directly,
unblocking these rows.

Surfaced via SP4-A device validation: "The Sheep Detectives" had a
release_calendar row but title=null, invisible to the
.not('title', 'is', null) defensive filter in the client read service.

Adds rows_reconciled to the worker's ResponseBody. Visible in
net._http_response logs after each cron run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pre-PR verification gate

**Files:** None (verification only)

- [ ] **Step 1: Run lint, typecheck, and full test suite together**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp1-warming-reconciliation
npm run lint && npx tsc --noEmit && npm test -- --silent
```

Expected:
- Lint: 0 errors. Pre-existing warnings unchanged (8 in unrelated files).
- TSC: 0 errors. The edge function's Deno imports may be skipped by project tsc — that's normal.
- Tests: 867 passing (unchanged from post-SP4-A baseline). No new tests added by this PR.

- [ ] **Step 2: Confirm git status is clean and commit list is correct**

```bash
git status && git log --oneline origin/main..HEAD
```

Expected commit list (in order):
1. `docs: SP1 warming worker null-title reconciliation design spec`
2. `fix(calendar): reconcile null-title release_calendar rows via direct TMDB fetch`

Plus the plan-doc commit added before Task 1.

---

## Task 3: Edge function deploy + live smoke test (manual — Tyshane runs)

**Files:** None (deployment + verification only)

This task requires the Supabase CLI to be authenticated and pointed at the `wliblwulvsrfgqcnbzeh` project. Tyshane has this set up locally; the agent should not attempt the deploy.

- [ ] **Step 1: Pre-deploy null-title baseline (via Supabase MCP)**

Query the current null-title count to establish the pre-deploy baseline:

```sql
SELECT COUNT(*) FILTER (WHERE title IS NULL) AS null_titles_before
FROM release_calendar
WHERE region = 'US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months';
```

Expected: ~113 (or close to it; may have shifted since the 2026-04-27 backfill).

Save the value for comparison after deploy.

- [ ] **Step 2: Deploy the edge function**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp1-warming-reconciliation
supabase functions deploy warm-release-calendar
```

Expected output: `Deployed Function warm-release-calendar`. May take 30-60 seconds for the function to be live in production.

- [ ] **Step 3: Manually invoke the worker via Supabase MCP**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

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

Expected: returns a `request_id`. The worker runs asynchronously (~30s-2min depending on TMDB latency).

- [ ] **Step 4: Wait ~60 seconds, then check `net._http_response` for the worker's response**

```sql
SELECT id, status_code, content
FROM net._http_response
ORDER BY created DESC
LIMIT 3;
```

Expected: a row with `status_code: 200` and `content` containing JSON like:

```json
{
  "rows_upserted": <number>,
  "rows_reconciled": <a number close to the pre-deploy null count, minus TMDB-deleted ids>,
  "months_warmed": ["2026-04", "2026-05", "2026-06", "2026-07"],
  "duration_ms": <some number>
}
```

If `rows_reconciled` is **0** with a non-zero pre-deploy null count: something's wrong. Check the edge function logs in Supabase Studio for `[warm-release-calendar]` log lines.

- [ ] **Step 5: Post-invoke null-title count**

```sql
SELECT COUNT(*) FILTER (WHERE title IS NULL) AS null_titles_after
FROM release_calendar
WHERE region = 'US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months';
```

Expected: significantly less than the baseline. A residual count is expected from TMDB-deleted ids; should stabilize at <20.

- [ ] **Step 6: Spot-check Sheep Detectives still populated (regression check)**

```sql
SELECT tmdb_id, title, poster_path
FROM release_calendar
WHERE tmdb_id = 1301421;
```

Expected: `title: 'The Sheep Detectives'`, `poster_path` populated.

- [ ] **Step 7: Confirm a previously-stuck row is now populated**

Pick a tmdb_id from the post-invoke null-title list. Spot-check whether it had been null pre-deploy and is now populated:

```sql
-- List newly-populated movies (pre vs post)
SELECT tmdb_id, title, release_date
FROM release_calendar
WHERE region = 'US'
  AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months'
  AND title IS NOT NULL
  AND tmdb_id IN (
    -- Sample of previously-null tmdb_ids — query before deploy and save the list
  )
ORDER BY release_date
LIMIT 10;
```

If the list is non-empty, reconciliation worked. Sample 2-3 random newly-populated movies.

- [ ] **Step 8: Hand off result to Tyshane / agent**

Report back: `null_titles_before`, `null_titles_after`, `rows_reconciled` from the response, sample of newly-populated movies. If reconciliation didn't significantly drop the count, dig deeper before merging.

---

## Task 4: Web bundle leak smoke test (skip — no client changes)

This task is intentionally skipped. The PR doesn't touch any client-side code, so a web bundle smoke test would just rebuild the post-SP4-A bundle. No new risk surface.

If you want to be paranoid, run `npx expo export --platform web` and confirm it succeeds. But not strictly needed.

---

## Task 5: PR prep + push

**Files:** None (git operations only)

- [ ] **Step 1: Confirm clean state**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp1-warming-reconciliation
git status && git log --oneline origin/main..HEAD
```

Expected: clean working tree, 3 commits ahead (1 spec + 1 plan + 1 fix).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin fix/sp1-warming-reconcile-null-titles
```

- [ ] **Step 3: Open PR via gh CLI**

```bash
gh pr create --title "fix(calendar): SP1 warming worker — reconcile null-title rows" --body "$(cat <<'EOF'
## Summary

- Adds a reconciliation pass to the `warm-release-calendar` edge function that fills null-title rows in `release_calendar` by fetching `/movie/{id}` directly from TMDB.
- Bypasses the discover-API popularity ceiling that was the structural cause of the bug — discover-driven warming only refreshes movies in TMDB's monthly top-100; movies that fall out of that ceiling get stuck with null titles.
- Idempotent self-heal: each cron run converges any remaining nulls. Stable state is "TMDB-deleted ids only."
- Surfaced via [SP4-A](https://github.com/TyShaneONeill/movie-tracker/pull/403) device validation: "The Sheep Detectives" was in `release_calendar` with `title: null`, invisible to the client's `.not('title', 'is', null)` defensive filter. The 113 other null-title rows in the current 4-month US window get fixed by this PR.

Builds on [SP1](https://github.com/TyShaneONeill/movie-tracker/pull/397).

**Spec:** `docs/superpowers/specs/2026-04-27-sp1-warming-reconcile-null-titles-design.md`
**Plan:** `docs/superpowers/plans/2026-04-27-sp1-warming-reconcile-null-titles.md`
**Bug doc:** `vault://Projects/CineTrak/Bugs & Fixes/SP1 Warming Worker — Null Title Backfill Gap.md`

## Files changed
- `supabase/functions/warm-release-calendar/index.ts` — adds reconciliation pass after the existing discover-driven warming loop. Extends `ResponseBody` with `rows_reconciled`. ~70 lines added.

## Test plan
- [x] `npm run lint && npx tsc --noEmit && npm test` — 867/867 pass, 0 lint errors. Edge function isn't covered by Jest (Deno runtime); validation is via live integration smoke.
- [ ] **Live integration smoke (Tyshane runs after merge):**
  - [ ] Pre-deploy: `SELECT COUNT(*) FILTER (WHERE title IS NULL) FROM release_calendar WHERE region='US' AND release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '4 months'` → record baseline
  - [ ] `supabase functions deploy warm-release-calendar`
  - [ ] Manually invoke worker via `net.http_post` (see plan Task 3 Step 3)
  - [ ] Verify `net._http_response` shows `rows_reconciled` close to the pre-deploy baseline
  - [ ] Re-run the null-title count query — expect `<<` baseline, residual = TMDB-deleted ids
  - [ ] Spot-check `tmdb_id = 1301421` (Sheep Detectives) is still populated

## Out of scope
- Multi-region reconciliation (US only today; SP4 multi-region is a separate spec)
- Historical (past-month) reconciliation (warm window only)
- Replacing the client `.not('title', 'is', null)` filter (defense-in-depth stays)
- Alerting on persistent nulls (logs only; alerts are separate observability work)

## Tracked notes
- TMDB 404s for ids that have been deleted from TMDB stay null forever. The client filter hides them. Acceptable.
- The edge function deploys via `supabase functions deploy`; the PR merge alone doesn't auto-deploy. Tyshane runs the deploy command post-merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: returns PR URL.

- [ ] **Step 4: Capture the PR URL for the daily note**

Note the URL. The PR description includes the deploy + smoke test checklist for Tyshane to follow post-merge.

---

## Self-review notes

**Spec coverage:**
- Q1 (reconciliation pass approach): Task 1 Step 3 ✓
- Q2 (warm-window scope): Task 1 Step 3 — `warmStart`/`warmEnd` derived from `monthsWarmed` ✓
- TMDB endpoint `/movie/{id}`: Task 1 Step 3 ✓
- Batching 20-wide × 250ms: Task 1 Step 3 — uses existing `BATCH_SIZE`/`BATCH_DELAY_MS` ✓
- 404/empty title handling: Task 1 Step 3 — per-row try/catch + `if (!detail.title) return null` ✓
- `rows_reconciled` in response: Task 1 Step 2 + Step 3 ✓
- Observability logs: Task 1 Step 3 — `console.log/warn/error` lines included ✓
- Manual one-off invocation: Task 3 Step 3 ✓
- Smoke test SQL: Task 3 Steps 1, 5, 6 ✓

**Type consistency:**
- `ReleaseCalendarRow` type already exists in the worker; reconciliation rows use `Pick<>` to scope down
- `BATCH_SIZE`, `BATCH_DELAY_MS`, `TMDB_BASE_URL`, `TMDB_API_KEY` constants are reused (no duplication)
- `monthsWarmed` array's first/last elements derived correctly (string format `YYYY-MM`)

**No placeholders.** Every step has full code or explicit commands.

**Risks captured in spec.** Re-read Risks section before merging.

**Edge function deploy is manual.** Highlighted in PR description and Task 3.
