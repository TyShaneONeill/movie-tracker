# Fix — `get-tv-show-details` wrapper shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy `get-tv-show-details` edge function v18 that returns the `TvShowDetailResponse` wrapper shape expected by the client, using TMDB's `append_to_response` for a single round-trip.

**Architecture:** Edge function fetches `/tv/:showId?append_to_response=credits,videos,watch/providers,recommendations&language=en-US` (one TMDB request). Transforms the flat response into the wrapper `{show, cast, crew, trailer, watchProviders, seasons, recommendations}`. Fail-open on missing sub-resources (empty arrays / null trailer / empty watchProviders). Deployment only — no repo code changes; no client changes; no tests to add.

**Tech Stack:** Deno edge function (deployed via Supabase MCP), TypeScript types (reference only; already match).

**Spec reference:** `docs/superpowers/specs/2026-04-20-fix-get-tv-show-details-wrapper-shape-design.md`
**Branch:** `fix/get-tv-show-details-wrapper`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-fix-tv-details`
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File inventory

**Edge function (via Supabase MCP `deploy_edge_function`):**
- `get-tv-show-details` — next version (current v17) with `append_to_response` + wrapper transform

**No repo-side changes.** No TS edits. No test edits. Client-side `useTvShowDetail` hook already destructures the wrapper.

---

### Task 1: Deploy `get-tv-show-details` v18 with wrapper transform

**Files (via MCP, no local file):**
- Edge function: `get-tv-show-details`

- [ ] **Step 1: Confirm current version is 17**

Call Supabase MCP `mcp__plugin_supabase_supabase__get_edge_function`:

```
project_id: wliblwulvsrfgqcnbzeh
function_slug: get-tv-show-details
```

Expected: `version: 17`, `status: ACTIVE`, `verify_jwt: false`, source matches the spec's pre-fix body. If version is higher, stop — someone changed it externally. Report BLOCKED with the actual source.

- [ ] **Step 2: Deploy v18 with the wrapper transform**

Call Supabase MCP `mcp__plugin_supabase_supabase__deploy_edge_function`:

- `project_id: wliblwulvsrfgqcnbzeh`
- `name: get-tv-show-details`
- `entrypoint_path: index.ts`
- `verify_jwt: false` (preserves current setting — invoked with anon key from the app)
- `files`: two entries — the new `index.ts` and the preserved `../_shared/cors.ts` (unchanged)

**Note on `files[].name`**: the current deployment uses `functions/get-tv-show-details/index.ts` and `functions/_shared/cors.ts`. Match those paths exactly.

**`functions/_shared/cors.ts` (unchanged):**

```ts
/**
 * Shared CORS configuration for Supabase Edge Functions.
 *
 * Restricts Access-Control-Allow-Origin to known origins instead of '*'.
 * React Native/Expo apps don't send Origin headers in the same way browsers do,
 * so this primarily protects against web-based cross-origin abuse.
 */

const ALLOWED_ORIGINS = [
  'https://pocketstubs.com',
  'https://www.pocketstubs.com',
  'http://localhost:8081', // Expo dev server
  'exp://192.168',         // Expo Go (prefix match)
];

/**
 * Build CORS headers based on the request's Origin.
 * If the origin matches an allowed value (exact or prefix), it is reflected back.
 * Otherwise the production domain is returned so the browser blocks the request.
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowed) => origin === allowed || origin.startsWith(allowed),
  );

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  };
}
```

**`functions/get-tv-show-details/index.ts` (new):**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from '../_shared/cors.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface RequestBody {
  showId: number;
}

// TMDB "append_to_response" sub-resource types (narrow subset we actually use)
interface TMDBGenre { id: number; name: string; }
interface TMDBCastRaw {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}
interface TMDBCrewRaw {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}
interface TMDBCreditsRaw { cast?: TMDBCastRaw[]; crew?: TMDBCrewRaw[]; }
interface TMDBVideoRaw {
  id: string;
  key: string;
  site: string;      // "YouTube" | "Vimeo"
  type: string;      // "Trailer" | "Teaser" | "Clip" | ...
  official: boolean;
  name: string;
  published_at: string;
}
interface TMDBVideosRaw { results?: TMDBVideoRaw[]; }
interface TMDBProviderRaw { provider_id: number; provider_name: string; logo_path: string | null; display_priority: number; }
interface TMDBProvidersCountryRaw {
  flatrate?: TMDBProviderRaw[];
  rent?: TMDBProviderRaw[];
  buy?: TMDBProviderRaw[];
  link?: string;
}
interface TMDBProvidersRaw { results?: Record<string, TMDBProvidersCountryRaw>; }
interface TMDBRecommendationRaw {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  overview: string;
  genre_ids: number[];
}
interface TMDBRecommendationsRaw { results?: TMDBRecommendationRaw[]; }
interface TMDBSeasonRaw {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episode_count: number;
  vote_average: number;
}

// Minimal TMDB top-level fields we care about
interface TMDBShowResponse {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  vote_average: number;
  vote_count: number;
  genres?: TMDBGenre[];
  tagline: string | null;
  status: string;
  type: string;
  in_production: boolean;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  networks: { id: number; name: string; logo_path: string | null }[];
  created_by: { id: number; name: string; profile_path: string | null }[];
  seasons?: TMDBSeasonRaw[];
  original_language: string;
  origin_country: string[];
  credits?: TMDBCreditsRaw;
  videos?: TMDBVideosRaw;
  'watch/providers'?: TMDBProvidersRaw;
  recommendations?: TMDBRecommendationsRaw;
}

// Prefer Official Trailer on YouTube, then any YouTube trailer, then any video, else null.
function selectTrailer(videos: TMDBVideoRaw[]): TMDBVideoRaw | null {
  if (videos.length === 0) return null;
  const youtubeVideos = videos.filter(v => v.site === 'YouTube');
  const officialTrailer = youtubeVideos.find(
    v => v.type === 'Trailer' && v.name?.toLowerCase().includes('official')
  );
  if (officialTrailer) return officialTrailer;
  const anyYouTubeTrailer = youtubeVideos.find(v => v.type === 'Trailer');
  if (anyYouTubeTrailer) return anyYouTubeTrailer;
  return videos[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');

    const { showId } = await req.json() as RequestBody;

    if (!showId || typeof showId !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid showId' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const url = `${TMDB_BASE_URL}/tv/${showId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos,watch/providers,recommendations`;
    const res = await fetch(url);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `TMDB responded with ${res.status}` }),
        { status: res.status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const raw = await res.json() as TMDBShowResponse;

    // Transform into the TvShowDetailResponse wrapper shape the client expects.
    // Fail-open on every optional sub-resource — TMDB sometimes omits them.
    const credits = raw.credits ?? {};
    const videos = raw.videos?.results ?? [];
    const providers = raw['watch/providers']?.results ?? {};
    const recommendations = raw.recommendations?.results ?? [];
    const seasons = raw.seasons ?? [];
    const genres = raw.genres ?? [];

    const response = {
      show: {
        id: raw.id,
        name: raw.name,
        overview: raw.overview,
        poster_path: raw.poster_path,
        backdrop_path: raw.backdrop_path,
        first_air_date: raw.first_air_date,
        last_air_date: raw.last_air_date,
        vote_average: raw.vote_average,
        vote_count: raw.vote_count,
        // Client type has genre_ids + genres; TMDB only returns genres, so derive both.
        genre_ids: genres.map(g => g.id),
        genres,
        tagline: raw.tagline,
        status: raw.status,
        type: raw.type,
        in_production: raw.in_production,
        number_of_seasons: raw.number_of_seasons,
        number_of_episodes: raw.number_of_episodes,
        episode_run_time: raw.episode_run_time,
        networks: raw.networks,
        created_by: raw.created_by,
        seasons,
        original_language: raw.original_language,
        origin_country: raw.origin_country,
      },
      cast: credits.cast ?? [],
      crew: credits.crew ?? [],
      trailer: selectTrailer(videos),
      watchProviders: providers,
      seasons,
      recommendations,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[get-tv-show-details]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
```

Files payload for `deploy_edge_function`:

```json
[
  {
    "name": "functions/get-tv-show-details/index.ts",
    "content": "<index.ts source above>"
  },
  {
    "name": "functions/_shared/cors.ts",
    "content": "<cors.ts source above>"
  }
]
```

- [ ] **Step 3: Verify the deployed version incremented**

Call `mcp__plugin_supabase_supabase__get_edge_function` again:

```
project_id: wliblwulvsrfgqcnbzeh
function_slug: get-tv-show-details
```

Expected: `version: 18`, `status: ACTIVE`, `verify_jwt: false`. Confirm the deployed source matches what was sent (spot-check for `append_to_response` and `selectTrailer`).

- [ ] **Step 4: MCP smoke test — inspect current cache state**

Before any new show-detail view fires from the app, query the cache to see baseline state:

```sql
SELECT tmdb_id, name, tmdb_fetched_at,
  cached_cast IS NOT NULL AS has_cast,
  cached_crew IS NOT NULL AS has_crew,
  trailer_youtube_key IS NOT NULL AS has_trailer
FROM public.tv_shows
ORDER BY tmdb_fetched_at DESC NULLS LAST
LIMIT 10;
```

Record the existing rows. They may have `has_cast = false`, `has_crew = false`, `has_trailer = false` (stale from the bug era) or the table may be empty. Either is expected.

- [ ] **Step 5: Empty commit marker**

No repo-side file changes. Commit a marker for the deployment:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-fix-tv-details
git commit --allow-empty -m "$(cat <<'EOF'
fix(edge): deploy get-tv-show-details v18 with wrapper transform

Pre-existing bug: v17 returned raw TMDB (flat {id, name, overview,
seasons, ...}) but client type TvShowDetailResponse expects a
wrapper {show, cast, crew, trailer, watchProviders, seasons,
recommendations}. Consequence: show-detail screen silently rendered
empty cast/crew/trailer/watch-providers/recommendations sections,
and tv_shows cache wrote never populated (cacheTvShowData threw
TypeError: Cannot read property 'id' of undefined on data.show).

v18 uses TMDB's append_to_response to fetch credits, videos,
watch/providers, recommendations in a single request. Transforms
the flat response into the wrapper shape. Fail-open on optional
sub-resources — empty arrays / null trailer / empty watchProviders
when TMDB omits them.

Client-side untouched — useTvShowDetail hook was already
destructuring the wrapper (lib/tv-show-service.ts, hooks/
use-tv-show-detail.ts, lib/tv-show-cache-service.ts). The bug
was always in the edge function.

No repo source file for this edge function (lives only in
Supabase). This empty commit marks the deployment in git history.

Deployed to project wliblwulvsrfgqcnbzeh via MCP deploy_edge_function.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Verification + PR

**Files:** plan doc only.

- [ ] **Step 1: Full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-fix-tv-details
npm run lint && npx tsc --noEmit && npm test
```

Expected: 0 errors, 0 tsc errors, 762/762 tests pass (no repo code changes).

- [ ] **Step 2: Verify commit sequence**

```bash
git log --oneline origin/main..HEAD
```

Expected commits:
1. `d5c3fe7` — design spec
2. Task 1 — empty marker for edge function v18 deploy

- [ ] **Step 3: Commit the plan doc**

```bash
git add docs/superpowers/plans/2026-04-20-fix-get-tv-show-details-wrapper-shape.md
git commit -m "$(cat <<'EOF'
chore(tv): add plan for get-tv-show-details wrapper shape fix

Plan decomposing the spec into 2 tasks: edge function deploy
(v18 with append_to_response + wrapper transform) and
verification + PR.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin fix/get-tv-show-details-wrapper

gh pr create --title "fix(tv): get-tv-show-details returns wrapper shape (append_to_response)" --body "$(cat <<'EOF'
## Summary

- Edge function \`get-tv-show-details\` deployed v18: uses TMDB's \`append_to_response\` to fetch \`credits\`, \`videos\`, \`watch/providers\`, \`recommendations\` in a single round-trip
- Response transformed into the \`TvShowDetailResponse\` wrapper shape that the client already expects
- Fail-open on optional sub-resources — empty cast/crew arrays, null trailer, empty \`watchProviders\`, empty \`recommendations\` when TMDB omits them
- Trailer selection: Official Trailer on YouTube → any YouTube trailer → any video → null
- No repo code changes. No migration. No client edits. No tests added.

## Why

Pre-existing bug (not a regression). v17 of the edge function returned the raw TMDB response (flat), but the client's \`TvShowDetailResponse\` type and \`useTvShowDetail\` hook expected a wrapper \`{show, cast, crew, trailer, watchProviders, seasons, recommendations}\`. Result: every show-detail screen silently rendered empty cast/crew/trailer/watch-providers/recommendations sections, and the \`tv_shows\` cache never populated because \`cacheTvShowData(tmdbData.show, ...)\` threw \`TypeError: Cannot read property 'id' of undefined\` (caught by the background \`.catch()\` and logged).

The only reason \`data.seasons\` worked was accidental — raw TMDB has \`seasons\` at the top level, which happened to collide with the wrapper's \`seasons\` key.

Surfaced during device testing of PR #392 (unrelated catalog work).

Spec: \`docs/superpowers/specs/2026-04-20-fix-get-tv-show-details-wrapper-shape-design.md\`
Plan: \`docs/superpowers/plans/2026-04-20-fix-get-tv-show-details-wrapper-shape.md\`

## Test plan

- [x] \`npm run lint && npx tsc --noEmit && npm test\` — all green (zero repo code changes; 762/762 tests)
- [x] MCP: edge function v18 deployed, ACTIVE, verify_jwt=false
- [ ] Device: open show-detail for a well-populated show (Breaking Bad, tmdb_id 1396)
  - Cast section populates (not empty)
  - Crew section populates
  - Trailer appears (YouTube embed / link)
  - Watch providers section populates
  - Recommendations carousel populates
- [ ] Device: no \"Background cache failed\" errors in the dev console
- [ ] Device: re-open the same show — should be a cache hit (faster, but same data visible)
- [ ] MCP: \`SELECT cached_cast, cached_crew, trailer_youtube_key FROM public.tv_shows WHERE tmdb_id = 1396\` — rows populated
- [ ] Device: open a show with limited TMDB data (e.g., a lesser-known series) — sections empty without crashes

## Non-goals (explicit)

- Client-side hook or type changes (already match wrapper shape)
- \`tv_shows\` cache schema changes (columns already exist)
- Backfill existing cache rows (next fetch overwrites naturally)
- Fixes to other edge functions (only \`get-tv-show-details\` was broken in this way)
- Retries on partial TMDB failures (defensive fallbacks cover the realistic cases)

## Rollback

Redeploy v17 source via MCP (preserved in the spec doc's References section for completeness — the v17 body was captured during investigation). No client edits to revert.

## Commits

- \`d5c3fe7\` — design spec
- Task 1 — empty marker for edge function v18 deploy
- Task 2 — plan doc

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Record the PR URL.

---

## Self-Review Notes

**Spec coverage:**

| Spec section | Plan task |
|--|--|
| Section 1 (edge function rewrite) | Task 1 Step 2 |
| Section 2 (fail-open guards) | Task 1 Step 2 — guards inline in transform |
| Section 3 (trailer selection) | Task 1 Step 2 — `selectTrailer` function |
| Section 4 (CORS shared module) | Task 1 Step 2 — reused as-is |
| Section 5 (`verify_jwt: false`) | Task 1 Step 2 — preserved |
| Out of scope (non-goals) | PR body |
| Testing strategy | Task 2 Step 1 + PR test plan |

**Placeholder scan:** none found. Trailer priority explicit. Transform logic complete. Fail-open fallbacks `?? []` / `?? null` / `?? {}` concrete.

**Type consistency:** 
- `TMDBVideoRaw.name` used (not `title`) — matches spec and `TMDBVideo` type
- `raw['watch/providers']?.results` — the slash in the property name requires bracket access; confirmed via TypeScript
- `genre_ids: genres.map(g => g.id)` — derives from `genres` per spec's "genre_ids derivation" note
- `selectTrailer` returns `TMDBVideoRaw | null` which assigns cleanly to the wrapper's `trailer: TMDBVideo | null`
- `TMDBProviderRaw` shape inferred from TMDB docs; client's `TMDBWatchProvider` is not narrowed to specific fields beyond what's already in `watchProviders` flat/rent/buy structure

**Scope check:** single edge function deploy. No decomposition needed.
