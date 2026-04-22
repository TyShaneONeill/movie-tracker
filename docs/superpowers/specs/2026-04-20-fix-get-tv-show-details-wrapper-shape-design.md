# Fix — `get-tv-show-details` edge function returns wrapper shape

**Date:** 2026-04-20
**Status:** Ready for plan
**Type:** Bug fix (pre-existing, not a regression)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

## Context

The `get-tv-show-details` edge function (v17, deployed 2026-03-17) returns the raw TMDB `/tv/:id` response, which is a flat object: `{id, name, overview, seasons, genres, ...}`.

The client-side `TvShowDetailResponse` type (`lib/tmdb.types.ts:316`) and the `useTvShowDetail` hook (`hooks/use-tv-show-detail.ts:51-58`) expect a wrapper shape:

```ts
{
  show: TMDBTvShowDetail,
  cast: TMDBCastMember[],
  crew: TMDBCrewMember[],
  trailer: TMDBVideo | null,
  watchProviders: Record<string, TMDBWatchProviders>,
  seasons: TMDBSeason[],
  recommendations: TMDBTvRecommendation[],
}
```

Because the edge function returns flat TMDB data:
- `data.show` is `undefined` → the hook returns `null` for every show field except `seasons` (which works by accident since raw TMDB has top-level `seasons`)
- `data.cast`, `data.crew`, `data.trailer`, `data.watchProviders`, `data.recommendations` are all `undefined` → all hook callers receive empty defaults

**Observable impact:**
- Show-detail screen has silently-empty cast, crew, trailer, watch providers, and recommendations sections
- `cacheTvShowData(tmdbData.show, ...)` at `lib/tv-show-cache-service.ts:186` throws `TypeError: Cannot read property 'id' of undefined` — caught by the `.catch()` and logged as "Background cache failed"
- The `tv_shows` cache table is never populated — every show-detail view hits TMDB directly
- Caught during 2026-04-20 device testing of PR #392 (unrelated catalog PR); root cause is pre-existing

## Design decisions (resolved)

| Decision | Value |
|--|--|
| TMDB fetch strategy | Single call with `?append_to_response=credits,videos,watch/providers,recommendations` (one round-trip instead of five) |
| Response transform location | Inside the edge function — construct the full wrapper before returning |
| Trailer selection | Prefer `Official Trailer` on YouTube → any YouTube trailer → any video → null |
| Partial failures | Fail-open to empty structures (empty cast/crew arrays, null trailer, empty watchProviders, empty recommendations). Main `/tv/:id` fail is still a 500 to caller (same as today). |
| Watch provider country scope | Return all countries TMDB provides (matches existing `Record<string, TMDBWatchProviders>` type) |
| Recommendations pagination | First page only (~20 items, sufficient for UI) |
| Client changes | None — `useTvShowDetail` hook already expects the wrapper shape |
| Cache table impact | `tv_shows_cache` starts populating correctly — no schema changes, no migration |
| Backward compat | None needed — current callers receive undefined for all wrapper fields (broken behavior); they'll now receive populated values (correct behavior) |

## Scope

### 1. Edge function rewrite: `get-tv-show-details` v18

Replace the body to:
1. Fetch `/tv/:showId?append_to_response=credits,videos,watch/providers,recommendations&language=en-US`
2. Transform the flat response into the wrapper shape
3. Return the wrapper JSON

Key transforms:
- `show`: the main fields from the TMDB response (everything except `credits`, `videos`, `watch/providers`, `recommendations`) — mapped to `TMDBTvShowDetail`. Include `genre_ids` derived from `genres.map(g => g.id)` since the TS type has `genre_ids: number[]` but TMDB returns `genres: [{id, name}]`.
- `cast`: `credits.cast` (array). TMDB returns up to ~50 by default; no filtering.
- `crew`: `credits.crew` (array). No filtering.
- `trailer`: pick from `videos.results` using the priority order described in Design Decisions. Null if no videos.
- `watchProviders`: `watch/providers.results` (keyed by country code).
- `seasons`: `seasons` (already top-level on TMDB response).
- `recommendations`: `recommendations.results` (array).

### 2. Fail-open guards

Every optional sub-resource is wrapped defensively:
- `credits` could be `undefined` (TMDB 404 on some edge cases) → cast/crew empty arrays
- `videos` could be `undefined` → trailer null
- `watch/providers` could be `undefined` → watchProviders empty object
- `recommendations` could be `undefined` → empty array

Main show fields (`id`, `name`, `overview`, etc.) must not be optional — if they're missing, the edge function returns 500 (same as today).

### 3. Trailer selection

```ts
function selectTrailer(videos: TMDBVideo[]): TMDBVideo | null {
  const youtubeVideos = videos.filter(v => v.site === 'YouTube');
  const officialTrailer = youtubeVideos.find(v => v.type === 'Trailer' && v.name?.toLowerCase().includes('official'));
  if (officialTrailer) return officialTrailer;
  const anyYouTubeTrailer = youtubeVideos.find(v => v.type === 'Trailer');
  if (anyYouTubeTrailer) return anyYouTubeTrailer;
  return videos[0] ?? null;
}
```

### 4. CORS shared module

Current edge function imports `../_shared/cors.ts`. Preserve this — reuse `getCorsHeaders(req)` for all responses.

### 5. `verify_jwt` setting

Current: `false`. Preserve (app invokes with anon key).

## Out of scope (explicit non-goals)

- **Client-side hook changes** — `useTvShowDetail` already destructures the wrapper; no edits needed.
- **`tv_shows` cache table schema** — columns already exist to hold cast/crew/trailer/seasons; no migration required.
- **Backfill existing cache rows** — they're already incomplete or missing; the next fetch will populate them correctly.
- **Runtime cache layer changes** — `getTvShowDetailsWithCache` logic is unchanged. The cache-hit path already builds the wrapper shape from cached data.
- **Handling other TMDB endpoints** (movies, search, etc.) — only `get-tv-show-details` is broken; other edge functions return wrapper shapes that already match their client types (or were never broken).
- **Retries on partial TMDB failures** — `Promise.allSettled` style handling is overkill; `append_to_response` is a single request that either returns or fails. Sub-resources being missing is handled by defensive `?? []` / `?? null` in the transform.
- **Tests for the edge function** — the edge function source lives only on Supabase (not in the repo). No new unit tests. Existing client-side tests don't need updates (the type and hook behavior are unchanged).

## Testing strategy

### Post-deploy smoke test (via MCP)

Query the `tv_shows_cache` table before and after deploying. After a show-detail view fires from the app, the cache row should have populated `cached_cast`, `cached_crew`, `trailer_youtube_key`, `cached_seasons`.

### Device validation

1. Open show-detail for a show with rich TMDB data (e.g., Breaking Bad, tmdb_id 1396):
   - Cast section populates
   - Crew section populates (directors, creators visible)
   - Trailer embed/link appears
   - Watch providers section populates
   - Recommendations carousel populates
2. Background cache: no `[TypeError: Cannot read property 'id' of undefined]` errors in dev console
3. Re-open the same show: faster (cache hit); same data visible
4. Open show-detail for an obscure show (possible empty credits / no trailer): no crashes; sections empty

## Risks & rollback

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| `append_to_response` response larger than TMDB's limit | Low | Low | TMDB supports up to 20 appended resources; we use 4. Safe. |
| Transform skips a field the UI reads directly | Medium | Medium | `genre_ids` derivation is the one derived field. Audit before deploy. |
| Cached rows from the v17 era have incomplete data | High (all existing rows) | Low | Next fetch overwrites. Optional: one-time `TRUNCATE public.tv_shows;` but unnecessary — stale rows are returned from `cachedTvShowToDetail` which maps to the wrapper shape regardless. |
| Trailer selection picks a non-English video | Low | Low | TMDB fetch uses `language=en-US`; videos endpoint respects it. |

### Rollback

- Redeploy v17 source (preserved in the plan doc) via MCP
- No client changes to revert

## Success criteria

- `get-tv-show-details` v18 deployed; `version: 18, status: ACTIVE`
- A real app-side show-detail view populates cast / crew / trailer / watch providers / recommendations
- `tv_shows_cache` rows appear and contain populated `cached_cast`, `cached_crew`, `trailer_youtube_key` etc.
- No "Background cache failed" errors in dev console
- `npm run lint && npx tsc --noEmit && npm test` — all green (zero code changes in the repo — only the edge function deploy + plan/spec docs)

## References

- `lib/tv-show-cache-service.ts:186` — the line that throws today
- `lib/tv-show-service.ts:70-90` — `fetchTvShowDetailsFromTMDB` caller (unchanged)
- `hooks/use-tv-show-detail.ts:51-58` — the destructuring that already expects the wrapper shape
- `lib/tmdb.types.ts:255-279` — `TMDBTvShowDetail`
- `lib/tmdb.types.ts:316-324` — `TvShowDetailResponse` (the wrapper)
- Supabase edge function: `get-tv-show-details` v17 (source preserved in the plan doc for rollback)
