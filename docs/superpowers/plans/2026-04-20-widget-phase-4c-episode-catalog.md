# Widget Phase 4c — Episode Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the shared TMDB-sourced per-episode catalog table `public.tv_show_episodes` and populate it lazily via the deployed `get-season-episodes` edge function.

**Architecture:** New table with PK `(tmdb_show_id, season_number, episode_number)` and RLS (authenticated read, service-role write). The existing `get-season-episodes` edge function (deployed only, not committed to repo) is retrieved via Supabase MCP, extended to upsert the catalog after its TMDB fetch using the service role client, and redeployed. Fail-open semantics — catalog write failures log but do not block the TMDB payload return. No app-side TS changes.

**Tech Stack:** Supabase Postgres (migration + RLS via MCP), Deno (edge function via MCP `deploy_edge_function`), TypeScript (types file only).

**Spec reference:** `docs/superpowers/specs/2026-04-20-widget-phase-4c-episode-catalog-design.md`
**Branch:** `feature/widget-4c-episode-catalog`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-catalog`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File inventory

**DB (via Supabase MCP):**
- `create_tv_show_episodes_catalog` — CREATE TABLE + RLS + SELECT policy

**Edge function (via Supabase MCP `deploy_edge_function`):**
- `get-season-episodes` — extended with service-role upsert to `tv_show_episodes`

**RN modify:**
- `lib/database.types.ts` — hand-edit to add `tv_show_episodes` Row/Insert/Update types

**No new test files.** The app-side surface (`lib/tv-show-service.ts getSeasonEpisodes`) is unchanged — its existing tests continue to pass without modification.

---

### Task 1: Create `tv_show_episodes` table + RLS

**Files (via MCP, no local migration file):**
- Migration name: `create_tv_show_episodes_catalog`
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Apply migration**

Call Supabase MCP `mcp__plugin_supabase_supabase__apply_migration` with `project_id: wliblwulvsrfgqcnbzeh`, `name: create_tv_show_episodes_catalog`, and:

```sql
CREATE TABLE public.tv_show_episodes (
  tmdb_show_id int NOT NULL,
  season_number int NOT NULL,
  episode_number int NOT NULL,
  name text,
  overview text,
  air_date date,
  runtime int,
  still_path text,
  vote_average numeric,
  vote_count int,
  refreshed_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tmdb_show_id, season_number, episode_number)
);

COMMENT ON TABLE public.tv_show_episodes IS
  'Shared TMDB-sourced per-episode catalog. Populated lazily by the get-season-episodes edge function on every fetch. Keyed by (tmdb_show_id, season_number, episode_number) — no user_id because data is shared across the user base. Drives Phase 4c.3c server-side air_date validation and 4c.3e widget UX (airing countdowns, unaired button disable).';

ALTER TABLE public.tv_show_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_tv_show_episodes"
  ON public.tv_show_episodes
  FOR SELECT
  TO authenticated
  USING (true);
```

No INSERT/UPDATE/DELETE policies for authenticated role — those operations are denied by default. Service role bypasses RLS, so the edge function can still write.

- [ ] **Step 2: Verify table schema**

Call Supabase MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tv_show_episodes'
ORDER BY ordinal_position;
```

Expected rows (in order):
- `tmdb_show_id | integer | NO | `
- `season_number | integer | NO | `
- `episode_number | integer | NO | `
- `name | text | YES | `
- `overview | text | YES | `
- `air_date | date | YES | `
- `runtime | integer | YES | `
- `still_path | text | YES | `
- `vote_average | numeric | YES | `
- `vote_count | integer | YES | `
- `refreshed_at | timestamp with time zone | NO | now()`

- [ ] **Step 3: Verify PK and RLS**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'tv_show_episodes';
```

Expected: 1 row, PK index on `(tmdb_show_id, season_number, episode_number)`.

```sql
SELECT polname, polcmd, polroles::regrole[]
FROM pg_policy
WHERE polrelid = 'public.tv_show_episodes'::regclass;
```

Expected: 1 row, `authenticated_read_tv_show_episodes | r (SELECT) | {authenticated}`.

```sql
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tv_show_episodes'::regclass;
```

Expected: `t` (RLS enabled).

- [ ] **Step 4: Verify RLS denies unauthorized writes**

```sql
-- Should fail with 42501 (permission denied) because no INSERT policy for authenticated role
-- Note: running this via MCP uses the service role, which BYPASSES RLS. This test is
-- meaningful only from an authenticated session. Skip actual execution here and verify
-- in Step 3 that only the SELECT policy exists.
SELECT 'RLS state verified via Step 3 policy check' AS note;
```

The absence of INSERT/UPDATE/DELETE policies for the `authenticated` role is the enforcement mechanism. If Step 3 showed only the SELECT policy, unauthorized writes are correctly denied.

- [ ] **Step 5: Hand-edit `lib/database.types.ts`**

**DO NOT** run `npx supabase gen types` — it strips custom aliases (known project issue). Hand-edit only.

Open `lib/database.types.ts`. Find the `Tables` section inside `Database['public']['Tables']`. Find `user_tv_shows` as the closest analog (or any alphabetically-nearby entry). Add a new `tv_show_episodes` entry. Tables are alphabetically ordered in Supabase-generated types — place it between `tv_show_cache` (or whatever precedes it alphabetically) and `user_ai_usage_costs` (or whatever follows).

The entry must follow the Row/Insert/Update pattern. Use this template:

```ts
      tv_show_episodes: {
        Row: {
          air_date: string | null
          episode_number: number
          name: string | null
          overview: string | null
          refreshed_at: string
          runtime: number | null
          season_number: number
          still_path: string | null
          tmdb_show_id: number
          vote_average: number | null
          vote_count: number | null
        }
        Insert: {
          air_date?: string | null
          episode_number: number
          name?: string | null
          overview?: string | null
          refreshed_at?: string
          runtime?: number | null
          season_number: number
          still_path?: string | null
          tmdb_show_id: number
          vote_average?: number | null
          vote_count?: number | null
        }
        Update: {
          air_date?: string | null
          episode_number?: number
          name?: string | null
          overview?: string | null
          refreshed_at?: string
          runtime?: number | null
          season_number?: number
          still_path?: string | null
          tmdb_show_id?: number
          vote_average?: number | null
          vote_count?: number | null
        }
        Relationships: []
      }
```

Key points:
- `refreshed_at` is required on Row (NOT NULL in schema) but optional on Insert/Update (has DEFAULT NOW())
- PK columns (`tmdb_show_id`, `season_number`, `episode_number`) are required on Row AND Insert; optional on Update
- All other fields are nullable
- `numeric` → TypeScript `number | null` (Supabase convention)

- [ ] **Step 6: Verify tsc stays green**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-catalog
npx tsc --noEmit
```

Expected: 0 errors. Nothing in the codebase consumes the new types yet, so this should be purely additive.

- [ ] **Step 7: Commit**

```bash
git add lib/database.types.ts
git commit -m "$(cat <<'EOF'
feat(widget): add tv_show_episodes catalog table

Shared TMDB-sourced per-episode catalog keyed by
(tmdb_show_id, season_number, episode_number) — no user_id
because data is shared across the user base. Columns:
name, overview, air_date, runtime, still_path,
vote_average, vote_count, refreshed_at.

RLS: authenticated read, service-role-only writes (no
INSERT/UPDATE/DELETE policies for authenticated = denied
by default). Migration applied via MCP to project
wliblwulvsrfgqcnbzeh.

Foundation for Phase 4c.3c (server-side air_date validation)
and 4c.3e (widget UX unlocks). This commit ships only the
schema — the get-season-episodes edge function is extended
in the next commit.

Part of Phase 4c episode catalog work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend `get-season-episodes` edge function to upsert catalog

**Files (via MCP, no local file):**
- Edge function: `get-season-episodes` — version 15 (current is 14)

- [ ] **Step 1: Confirm current version number**

Call Supabase MCP `mcp__plugin_supabase_supabase__get_edge_function`:

```
project_id: wliblwulvsrfgqcnbzeh
function_slug: get-season-episodes
```

Record the current `version`. Must be `14` at time of writing; if higher, the function was modified externally and this plan may need adjustment.

- [ ] **Step 2: Deploy the extended edge function**

Call Supabase MCP `mcp__plugin_supabase_supabase__deploy_edge_function`:

```
project_id: wliblwulvsrfgqcnbzeh
name: get-season-episodes
entrypoint_path: index.ts
verify_jwt: false  (matches current deployment — this function is invoked with the anon key from the app)
files: [{
  name: "index.ts",
  content: <full source below>
}]
```

Full source (preserves ALL existing logic, adds catalog upsert at the end — before the return):

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
  guest_stars: { id: number; name: string; character: string; profile_path: string | null }[];
}

interface TMDBSeasonResponse {
  _id: string;
  air_date: string | null;
  episodes: TMDBEpisode[];
  name: string;
  overview: string;
  id: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
}

interface GetSeasonEpisodesRequest {
  showId: number;
  seasonNumber: number;
}

interface SeasonDetailResponse {
  episodes: TMDBEpisode[];
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY not configured');
    }

    const { showId, seasonNumber }: GetSeasonEpisodesRequest = await req.json();

    if (!showId || typeof showId !== 'number' || showId <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid showId parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (seasonNumber === undefined || typeof seasonNumber !== 'number' || seasonNumber < 0) {
      return new Response(
        JSON.stringify({ error: 'Valid seasonNumber parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const seasonUrl = new URL(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}`);
    seasonUrl.searchParams.set('api_key', TMDB_API_KEY);

    const seasonResponse = await fetch(seasonUrl.toString());

    if (!seasonResponse.ok) {
      if (seasonResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Season not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`TMDB API error: ${seasonResponse.status}`);
    }

    const seasonData: TMDBSeasonResponse = await seasonResponse.json();

    const episodes: TMDBEpisode[] = (seasonData.episodes || []).map(ep => ({
      id: ep.id,
      episode_number: ep.episode_number,
      season_number: ep.season_number,
      name: ep.name ?? '',
      overview: ep.overview ?? '',
      air_date: ep.air_date ?? null,
      runtime: ep.runtime ?? null,
      still_path: ep.still_path ?? null,
      vote_average: ep.vote_average ?? 0,
      vote_count: ep.vote_count ?? 0,
      guest_stars: (ep.guest_stars || []).map(gs => ({
        id: gs.id,
        name: gs.name,
        character: gs.character ?? '',
        profile_path: gs.profile_path ?? null,
      })),
    }));

    const response: SeasonDetailResponse = {
      episodes,
      seasonNumber: seasonData.season_number,
      name: seasonData.name ?? '',
      overview: seasonData.overview ?? '',
      posterPath: seasonData.poster_path ?? null,
    };

    // Phase 4c catalog: upsert episodes into public.tv_show_episodes.
    // Fail-open — TMDB payload is the contract; catalog is enrichment.
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey && episodes.length > 0) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const catalogRows = episodes.map(ep => ({
          tmdb_show_id: showId,
          season_number: seasonNumber,
          episode_number: ep.episode_number,
          name: ep.name || null,
          overview: ep.overview || null,
          air_date: ep.air_date,
          runtime: ep.runtime,
          still_path: ep.still_path,
          tmdb_vote_average: ep.vote_average,
          tmdb_vote_count: ep.vote_count,
          refreshed_at: new Date().toISOString(),
        }));
        const { error: upsertError } = await supabase
          .from('tv_show_episodes')
          .upsert(catalogRows, { onConflict: 'tmdb_show_id,season_number,episode_number' });
        if (upsertError) {
          console.warn('[get-season-episodes] catalog upsert failed:', upsertError.message);
        }
      }
    } catch (catalogErr) {
      console.warn('[get-season-episodes] catalog population error:', catalogErr);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

Changes from current version:
1. Added `import { createClient } from "jsr:@supabase/supabase-js@2";` at the top
2. After building `response` and before returning, wrapped a `try/catch` around the catalog upsert using the service-role client
3. Maps episodes to catalog-shaped rows (empty strings → null for `name`/`overview`; `air_date`/`runtime`/`still_path` pass through)
4. Uses `onConflict: 'tmdb_show_id,season_number,episode_number'` to upsert
5. Fail-open: any upsert error is logged via `console.warn` and swallowed — TMDB payload still returned

Keep `verify_jwt: false` — this is the existing deployment setting (confirmed via MCP `get_edge_function` above). The anon-key invocation path from the app continues to work.

- [ ] **Step 3: Verify the deployed version incremented**

Call `mcp__plugin_supabase_supabase__get_edge_function` again. Confirm `version` is now `15` (or whatever the prior version + 1 was) and `status: ACTIVE`.

- [ ] **Step 4: Smoke test — invoke the function and verify catalog populates**

Pick a small, well-known show. Breaking Bad S1 (TMDB show ID 1396, 7 episodes) is a reliable choice. Via MCP `execute_sql`:

First, confirm no catalog rows exist yet for this show/season:

```sql
SELECT COUNT(*) FROM public.tv_show_episodes
WHERE tmdb_show_id = 1396 AND season_number = 1;
```

Expected: `0` (fresh table).

Then invoke the edge function. The simplest way from MCP is to invoke via `curl` through `execute_sql`... actually, MCP doesn't provide a direct edge-function-invoke tool. Alternative: trigger the call from the running app (open a season-detail for any show the user has), OR invoke manually via curl with the project's anon key.

**Recommended**: after deployment, open the app's dev build (if already running) or do a test fetch from the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-catalog
# Get the anon key from the Supabase dashboard or .env — in the codebase,
# check app.config.js or an env file for supabaseAnonKey.
```

If device-testing is deferred to later, the catalog population check can be run AFTER the verification step — as long as the function deploys successfully and the code compiles in Deno, the upsert path is proven by code review. The functional integration test happens naturally when Tyshane device-tests the PR.

Acceptable alternative: manually invoke via MCP `execute_sql` using Postgres's http extension (if enabled — check via `SELECT * FROM pg_extension WHERE extname = 'http';`). If not enabled, defer the live-invocation test to device validation in Task 3.

After invocation, verify:

```sql
SELECT tmdb_show_id, season_number, episode_number, name, air_date, refreshed_at
FROM public.tv_show_episodes
WHERE tmdb_show_id = 1396 AND season_number = 1
ORDER BY episode_number;
```

Expected: 7 rows (Breaking Bad S1 episodes), each with name populated, air_date populated, recent `refreshed_at`.

Invoke the function AGAIN for the same show/season. Verify `refreshed_at` bumped:

```sql
SELECT episode_number, refreshed_at
FROM public.tv_show_episodes
WHERE tmdb_show_id = 1396 AND season_number = 1
ORDER BY episode_number LIMIT 1;
```

Expected: `refreshed_at` is later than the initial value.

- [ ] **Step 5: Commit**

No local file changes in this task (edge function is deployed remotely). Still, create an empty-but-informative commit to mark the deployment in git history.

Actually, create a chore commit that documents the deployment. Use `git commit --allow-empty`:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-catalog
git commit --allow-empty -m "$(cat <<'EOF'
chore(edge): deploy get-season-episodes v15 with catalog upsert

Extends the edge function to upsert fetched TMDB episodes into
the new public.tv_show_episodes catalog table (Task 1). Service-
role client bypasses RLS. Fail-open — if the upsert errors, the
TMDB payload is still returned to the caller.

No repo-side source changes because this edge function is
deployed-only (lives in Supabase, not in supabase/functions/).
Source available via MCP get_edge_function; the new version
differs from v14 by:
- Added createClient import
- Added try/catch upsert block after building response, before return
- Maps episodes to catalog rows (empty strings → null for name/overview)

Deployed to project wliblwulvsrfgqcnbzeh via MCP deploy_edge_function.

Part of Phase 4c episode catalog work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

The empty commit is the sole git-history marker that the deployment happened. Record the version number (15) in the commit if it differs.

---

### Task 3: Verification + PR

**Files:** none modified — running checks, committing the plan + spec references, pushing, opening PR.

- [ ] **Step 1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c-catalog
npm run lint && npx tsc --noEmit && npm test
```

Expected: 0 lint errors, 0 tsc errors, 762/762 tests pass (no new tests added in this PR — all changes are DB + remote edge function).

- [ ] **Step 2: Verify no stray changes**

```bash
git status -s
```

Expected: empty (all changes committed).

```bash
git log --oneline origin/main..HEAD
```

Expected commit order:
1. `d5fef23` (spec) — from earlier brainstorming
2. Task 1 commit (schema + types)
3. Task 2 empty commit (edge function deployment marker)

- [ ] **Step 3: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-04-20-widget-phase-4c-episode-catalog.md
git commit -m "$(cat <<'EOF'
chore(widget): add Phase 4c episode catalog implementation plan

Plan decomposing the episode catalog spec into 3 tasks:
schema+types, edge function extension, verification+PR.

Part of Phase 4c episode catalog work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feature/widget-4c-episode-catalog

gh pr create --title "feat(tv): Phase 4c — tv_show_episodes catalog + get-season-episodes upsert" --body "$(cat <<'EOF'
## Summary

- New table \`public.tv_show_episodes\`: shared TMDB-sourced per-episode catalog keyed by (tmdb_show_id, season_number, episode_number), with columns for name, overview, air_date, runtime, still_path, vote_average, vote_count, refreshed_at
- RLS: authenticated read, service-role writes only (no INSERT/UPDATE/DELETE policies for authenticated = denied by default)
- \`get-season-episodes\` edge function (deployed via MCP, no repo source) extended to upsert fetched TMDB episodes into the catalog using the service role client
- Fail-open semantics: if the catalog upsert errors, the TMDB payload is still returned to the caller
- No app-side TS changes — \`lib/tv-show-service.ts getSeasonEpisodes\` calls the same edge function and gets the same response shape
- Types: hand-edited \`lib/database.types.ts\` to include the new table (no \`npx supabase gen types\` per CineTrak convention)

## Why

Foundation for Phase 4c sub-projects 3c (server-side air_date validation in mark_episode_watched RPC) and 3e (widget UX unlocks: \"Airs Friday\" badges, unaired button disable, \"S3 coming soon\"). Both require a shared server-side source of truth for per-episode TMDB metadata. This PR ships just the foundation; no user-facing changes.

Spec: \`docs/superpowers/specs/2026-04-20-widget-phase-4c-episode-catalog-design.md\`
Plan: \`docs/superpowers/plans/2026-04-20-widget-phase-4c-episode-catalog.md\`

## Non-goals (deferred)

- Refresh-driven warming via \`lib/metadata-refresh.ts\` — deferred to a small follow-up after device testing shows whether catalog misses are common
- App-side reads from the catalog — no consumer yet; \`get-season-episodes\` remains the source
- RPC validation (sub-project 3c) — next PR
- Widget UX changes (sub-project 3e) — later PR
- Backfill for existing shows — catalog populates lazily as users navigate
- Episode ratings/reviews UX — \`vote_average\` and \`vote_count\` are stored for future use

## Test plan

- [x] \`npm run lint && npx tsc --noEmit && npm test\` — all green (762 tests, no new ones)
- [x] MCP smoke: table exists with correct columns, PK, RLS enabled, SELECT policy present
- [ ] Device: open a season-detail view in the app (any show) → via MCP, confirm \`SELECT FROM public.tv_show_episodes\` shows rows for that show/season with populated \`name\`, \`air_date\`, \`refreshed_at\`
- [ ] Device: re-open the same season → \`refreshed_at\` bumps
- [ ] Device: normal UX regressions: season-detail still renders correctly, widget still reloads, nothing visibly broken

## Migration footprint

Applied via Supabase MCP (no local migration file — CineTrak convention):
- \`create_tv_show_episodes_catalog\` — CREATE TABLE + RLS + SELECT policy

Edge function deployed via MCP \`deploy_edge_function\`:
- \`get-season-episodes\` v15 — adds createClient import + catalog upsert with fail-open

Rollback:
1. \`DROP TABLE public.tv_show_episodes;\` via MCP
2. Redeploy \`get-season-episodes\` to v14 (pre-catalog source is in the spec doc for reference)
3. Revert the TS types change via \`git revert\`

## Commits

- \`d5fef23\` — spec
- Task 1 — schema + types
- Task 2 — edge function deploy marker (empty commit)
- Task 3 — plan doc

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Record the PR URL.

- [ ] **Step 5: Wait for CI**

Monitor via `gh pr checks <PR_NUMBER> --watch`. Address any CI failures. Expected: green (no TS changes except types hand-edit).

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Plan task |
|--|--|
| Section 1 (migration) | Task 1 Steps 1-4 |
| Section 2 (edge function extension) | Task 2 Steps 1-3 |
| Section 3 (types regen) | Task 1 Step 5 |
| Section 4 (tests) | Task 1 Steps 3-4 (RLS verification), Task 2 Step 4 (integration smoke) |
| Section 5 (verification checklist) | Task 3 Step 1 |
| Non-goals | PR body Non-goals section |
| Rollback | PR body Rollback section |

**Placeholder scan:**
- No "TBD", "TODO", "implement later" in the plan
- Task 2 Step 4 has conditional language ("if not enabled, defer to device validation") — this is a legitimate fallback path, not a placeholder

**Type consistency:**
- Column names consistent across Task 1 SQL + Task 1 types hand-edit + Task 2 edge function upsert
- `refreshed_at` required on Row but optional on Insert (default NOW()) — matches schema DEFAULT
- `air_date` nullable string on TS side, `date` nullable on SQL side — consistent
- `vote_average numeric` → TS `number | null` — matches existing Supabase convention for numeric columns

**Gaps identified + resolved:**
- Originally I planned a dedicated "RLS tests" task, but the SELECT-policy-only approach doesn't need active write-denial tests — the absence of a write policy IS the enforcement. Folded verification into Task 1 Step 3.
- Live edge function invocation test was ambiguous (MCP doesn't have a direct invoke tool). Task 2 Step 4 documents the fallback to device validation.
