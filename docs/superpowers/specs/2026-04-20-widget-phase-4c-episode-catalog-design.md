# Widget Phase 4c — TMDB Episode Catalog Design Spec

**Date:** 2026-04-20
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4c sub-project 3b (TMDB episode catalog foundation)
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Parent note:** `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` (section 3b)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

## Context

Phase 4c tactical (#390) added client-side `air_date` filtering to prevent bulk-marking unaired episodes. Phase 4c stale-cache fix (#391) added authoritative completion signalling via the RPC's `flipped` return. Neither has access to shared per-episode TMDB metadata in the database — the app re-fetches episodes from TMDB on every season-detail view, and the widget's `MarkEpisodeWatchedIntent` has no episode metadata in its payload at all.

This PR adds the foundational shared catalog — `public.tv_show_episodes` — that stores TMDB-sourced episode metadata. The catalog unblocks:
- **3c** — server-side RPC validation that rejects marking unaired episodes even when the TS client is bypassed (e.g., widget or Shortcuts)
- **3e** — widget UX enhancements: disable next-episode button when unaired, "Airs Friday" badges, "S3 coming soon" caught-up Returning Series treatment

## Design decisions (resolved)

| Decision | Value |
|--|--|
| Storage | New table `public.tv_show_episodes` (shared, not per-user) |
| Primary key | `(tmdb_show_id, season_number, episode_number)` |
| RLS | Read = any authenticated; Write = service role only |
| Population trigger | Lazy via existing `get-season-episodes` edge function (upsert on every fetch) |
| Failure mode | Fail-open — catalog write failures log to Sentry + continue; TMDB payload still returned to caller |
| `refreshed_at` column | Yes — nullable, set to `NOW()` on every upsert. Supports future refresh-driven warming (not in this PR). |
| `vote_average` / `vote_count` columns | Yes — included up front for future "top-rated episode" UX |
| Backfill | None — catalog populates lazily as users view season-detail screens |
| App-side reads from catalog | Out of scope — no consumer yet; all reads still go through `get-season-episodes` |

## Scope

### 1. Migration: `create_tv_show_episodes_catalog`

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

-- Read: any authenticated user. Anon intentionally excluded even though data
-- is technically public (TMDB-sourced) — keeps access surface aligned with
-- the rest of the schema.
CREATE POLICY "authenticated_read_tv_show_episodes"
  ON public.tv_show_episodes
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: service role only. The get-season-episodes edge function writes
-- via its service-role JWT. No authenticated user should write directly —
-- a malicious client could corrupt shared data for every other user.
-- (Service role bypasses RLS by default, so no explicit INSERT/UPDATE/DELETE
-- policy is needed. The absence of such a policy for authenticated roles
-- means those operations are denied by default.)
```

Indexes beyond the PK: none in this PR. PK covers (show, season, episode) lookups and (show, season) range scans. A partial `air_date` index can follow when 3e needs "airs in the next N days" queries.

### 2. Edge function extension: `get-season-episodes`

The edge function is currently deployed but not committed to the repo. Approach: use Supabase MCP `get_edge_function` to retrieve its current source, extend it to upsert the catalog, and redeploy via `deploy_edge_function`.

**Extension logic (pseudocode):**

```ts
// ... after fetching TMDB season payload, before returning to caller:

const episodeRows = tmdbResponse.episodes.map(ep => ({
  tmdb_show_id: showId,
  season_number: seasonNumber,
  episode_number: ep.episode_number,
  name: ep.name ?? null,
  overview: ep.overview ?? null,
  air_date: ep.air_date || null,  // empty string → null
  runtime: ep.runtime ?? null,
  still_path: ep.still_path ?? null,
  vote_average: ep.vote_average ?? null,
  vote_count: ep.vote_count ?? null,
  refreshed_at: new Date().toISOString(),
}));

const { error: upsertError } = await supabase
  .from('tv_show_episodes')
  .upsert(episodeRows, { onConflict: 'tmdb_show_id,season_number,episode_number' });

if (upsertError) {
  // Fail-open: log but don't fail the request
  console.warn('[get-season-episodes] catalog upsert failed', upsertError.message);
}

return new Response(JSON.stringify(tmdbResponse), { /* existing */ });
```

**Principles:**
- Upsert is batched (one DB round-trip per season fetch)
- `onConflict` on the PK — re-fetching a season overwrites stale rows with fresh TMDB data
- Fail-open — TMDB payload is the contract; catalog is enrichment
- No per-row validation beyond type coercion (null for missing fields)

### 3. TS types regen

After the migration lands, hand-edit `lib/database.types.ts` (no `npx supabase gen types` — strips custom aliases per CineTrak convention). Add the `tv_show_episodes` entry to the `Tables` section with Row/Insert/Update types. Template pattern: same shape as `user_tv_shows` but with no user_id, and PK columns marked non-nullable.

### 4. Tests

**Postgres RLS tests (manual SQL via MCP):**
- Anon cannot SELECT (should return `42501` or empty — depends on auth setup)
- Authenticated user CAN SELECT (returns rows)
- Authenticated user CANNOT INSERT / UPDATE / DELETE (missing policy → denied)
- Service role CAN upsert (bypasses RLS)

**Edge function integration test:**
- Invoke `get-season-episodes` with a known show+season via Supabase MCP
- Query `tv_show_episodes` after — confirm rows exist for the fetched season
- Fetch again — confirm rows are updated (refreshed_at bumps)
- Intentionally induce an upsert failure (e.g., malformed row) — confirm the edge function still returns the TMDB payload to the caller (fail-open)

**TS unit tests:** none required. The app-side surface (`lib/tv-show-service.ts getSeasonEpisodes`) is unchanged — same signature, same response shape. Existing tests continue to pass without modification.

### 5. Verification checklist

- `npm run lint && npx tsc --noEmit && npm test` — all green (762 tests expected, no new)
- MCP smoke: table exists with correct columns + PK + RLS
- MCP smoke: edge function upsert populates rows on fetch
- Device: open a season-detail screen in the app → catalog rows appear via MCP SELECT

## Out of scope (explicit non-goals)

- **Refresh-driven warming** — extending `lib/metadata-refresh.ts` to pre-populate episodes for Continue Watching shows. Deferred to a small follow-up PR after device testing reveals whether catalog misses are common.
- **App-side reads from catalog** — `lib/tv-show-service.ts getSeasonEpisodes` still calls the edge function every time. No read-through caching layer.
- **Widget payload extension** — no new fields pushed to the widget. 3e will handle this.
- **RPC validation** — `mark_episode_watched` does not read the catalog yet. 3c adds that.
- **Backfill existing shows** — no migration-time backfill. Catalog populates as users navigate.
- **Per-episode freshness TTL** — `refreshed_at` is stored but nothing consults it yet. Reserved for 4c refresh-driven work.
- **Indexes beyond PK** — no `air_date` index. 3e can add one if needed.
- **Episode ratings or reviews UX** — `vote_average` / `vote_count` columns exist but no UI consumer.

## Data model changes

See Section 1.

## Risks & rollback

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| Edge function upsert fails (e.g., RLS misconfig) | Medium at deploy | Low UX | Fail-open — TMDB payload still returned, breadcrumb to Sentry |
| Catalog grows unbounded | Low | Medium | Per-show-season rows only; 50 shows × 10 seasons × 20 eps ≈ 10k rows/heavy-user. Postgres is comfortable to millions. |
| Missing rows when 3c reads the catalog | Medium until most shows get viewed | Low (3c falls back) | 3c is defence-in-depth; absence of a row means "don't validate" (permissive) |
| TMDB returns unexpected episode shape (e.g., empty string for null field) | Low | Low | Type coercion (`|| null`) in the upsert mapping |
| Stale catalog data (episode details change on TMDB) | Medium | Low | Every fetch upserts — catalog stays as fresh as the most recent view |

### Rollback

- `DROP TABLE public.tv_show_episodes;` — no dependents in this PR
- Revert the edge function to its pre-PR version (via redeploy)
- No code in the app-side imports the new Row type (types file references the table but nothing consumes it)

## Success criteria

- `public.tv_show_episodes` table exists with correct schema + RLS policies
- `get-season-episodes` edge function populates the catalog on every fetch
- Fetching the same season twice updates `refreshed_at`
- App-side UX is unchanged — no regressions in season-detail render or widget behavior
- Test suite remains 762/762

## References

- `docs/superpowers/specs/2026-04-20-widget-phase-4b4-status-transitions-design.md` — Phase 4b.4 (merged) — introduces `tmdb_status` column + RPC auto-flip
- `docs/superpowers/specs/2026-04-20-widget-phase-4c-stale-cache-hook-design.md` — Phase 4c stale-cache fix (#391 merged) — adds `flipped` RPC signal
- [PR #390](https://github.com/TyShaneONeill/movie-tracker/pull/390) — Phase 4c tactical unaired guards (client-side)
- `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` — parent scope note; this PR closes sub-project 3b
