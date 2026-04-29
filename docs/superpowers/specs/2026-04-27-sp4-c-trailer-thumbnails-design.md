# SP4-C: Trailer Thumbnails on Release Cards — Design Spec

**Date:** 2026-04-27
**Status:** Ready for plan
**Feature:** "Play Trailer ▶" button on each release card in the calendar's day list. Tap → opens the movie's YouTube trailer externally.
**Parent initiative:** Release Calendar SP4 feature pack
**Builds on:** Release Calendar Foundation (SP1), SP4-A My-Releases Filter, PR #407 user-driven enrichment

## Context

The calendar's day-list cards currently show poster + title + genres + rating + watchlist toggle. They tell you a movie exists and when, but they don't motivate "I want to see this." Adding a trailer entry-point on the card converts browsing into evaluation in a single tap. Most major movie apps (Letterboxd, Trakt, IMDb) put trailer access on the detail page; surfacing it on the browse card is more aggressive — fits CineTrak's calendar-as-discovery angle.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| UI placement | Bottom-right of the content area in `release-card.tsx`, parallel to the watchlist checkmark in the top-right. Text "Play Trailer" + Ionicons `play-circle` icon, in `colors.tint` red. (Per Tyshane's mockup.) |
| Tap behavior | `Linking.openURL('https://youtube.com/watch?v=' + key)` — opens YouTube app if installed, falls back to Safari/system browser. **Not** an in-app player. |
| Conditional rendering | Button renders ONLY when `trailer_youtube_key` is non-null. Movies without trailers show a card identical to today's. No greyed-out state. |
| Tap target separation | Tapping the trailer button does NOT navigate to detail page. Tapping anywhere else on the card preserves the existing detail-page navigation. |
| TMDB video selection | Pure function `selectBestTrailer(videos): string \| null`. Filter to `site === 'YouTube'`, prefer `type='Trailer'` > `'Teaser'` > `'Clip'`, then `official: true`, then most-recent `published_at`. Take first remaining. Returns the YouTube key (e.g., `'dQw4w9WgXcQ'`) or null if none qualifies. |
| Data fetching | **Prefetched into `release_calendar`** via the existing warming worker AND user-driven enrichment paths. Client reads `trailer_youtube_key` from the calendar query payload — zero per-card TMDB calls at render time. |
| Schema | New nullable column `release_calendar.trailer_youtube_key TEXT`. Idempotent migration. |
| Edge case: no YouTube video, only Vimeo | Filter to YouTube only. Treat as no trailer. |
| Edge case: TMDB videos endpoint failure | Log + continue. Calendar row written without trailer. Next nightly warming retries. |
| Edge case: YouTube video pulled / unavailable | YouTube handles it (shows "video unavailable"). Acceptable degradation. |
| Web build (Expo) | `Linking.openURL` opens YouTube in a new tab. Same UX. |

## Architecture

```
┌─ supabase/functions/_shared/select-best-trailer.ts (new)
│   └── selectBestTrailer(videos): string | null
│
├─ supabase/functions/enrich-release-calendar/index.ts (modified)
│   └── On enrichment: also fetch /movie/{id}/videos, call selectBestTrailer, include trailer_youtube_key in upsert payload
│
├─ supabase/functions/warm-release-calendar/index.ts (modified)
│   └── On daily warming: same — fetch videos endpoint per movie, populate trailer_youtube_key
│
├─ release_calendar.trailer_youtube_key (new TEXT NULL column)
│   └── Read by getReleaseCalendar() — flows through to client unchanged
│
└─ Client
    ├─ lib/tmdb.types.ts — CalendarRelease type gets trailer_youtube_key field
    ├─ lib/trailer-utils.ts (new) — openTrailer(key) helper
    └─ components/calendar/release-card.tsx — conditional Play Trailer button
```

## Scope

### 1. Migration: add trailer_youtube_key column

```sql
ALTER TABLE public.release_calendar
ADD COLUMN trailer_youtube_key TEXT;
```

Migration filename uses standard `YYYYMMDDHHMMSS_*.sql` convention. No backfill needed; warming worker + per-movie enrichment populate over time. Existing rows have `trailer_youtube_key = NULL` → client renders without "Play Trailer" button (graceful).

### 2. Shared helper: `selectBestTrailer`

New file `supabase/functions/_shared/select-best-trailer.ts`. Pure function, no I/O.

```ts
interface TMDBVideo {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;       // 'YouTube' | 'Vimeo' | ...
  size: number;
  type: string;       // 'Trailer' | 'Teaser' | 'Clip' | 'Featurette' | ...
  official: boolean;
  published_at: string;  // ISO 8601
}

export interface TMDBVideosResponse {
  results: TMDBVideo[];
}

const TYPE_RANK: Record<string, number> = {
  Trailer: 0,
  Teaser: 1,
  Clip: 2,
};

/**
 * Picks a single best YouTube trailer key from a TMDB videos response,
 * or null if nothing qualifies.
 *
 * Heuristic (ranked):
 *   1. Filter to site === 'YouTube' (Vimeo / TMDB-hosted skipped)
 *   2. Filter to type ∈ {'Trailer', 'Teaser', 'Clip'} (skip Featurette, BTS, etc.)
 *   3. Sort by:
 *      - type rank (Trailer < Teaser < Clip)
 *      - official: true before false
 *      - published_at descending (most recent)
 *   4. Take the first
 */
export function selectBestTrailer(response: TMDBVideosResponse): string | null {
  const candidates = response.results.filter(
    (v) => v.site === 'YouTube' && v.type in TYPE_RANK
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const ra = TYPE_RANK[a.type] ?? 999;
    const rb = TYPE_RANK[b.type] ?? 999;
    if (ra !== rb) return ra - rb;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return b.published_at.localeCompare(a.published_at);
  });
  return candidates[0].key;
}
```

### 3. Wire into `enrich-release-calendar`

After the existing `/movie/{id}/release_dates` call, add a second TMDB call to `/movie/{id}/videos` (in parallel via `Promise.all`). Use `selectBestTrailer` to extract the key. Include in the upsert payload via a new field on `ReleaseCalendarUpsertRow`.

`buildRowsFromTMDB` signature gains a `trailerKey: string | null` parameter; every row in the output carries the same trailerKey for the movie.

If videos fetch fails, log + fall through with `trailerKey = null` — don't fail the whole enrichment.

### 4. Wire into `warm-release-calendar`

Same pattern — the daily worker already iterates over movies and fetches per-movie release_dates. Add a parallel fetch for `/videos`, run through `selectBestTrailer`, include in the upsert.

The dedup logic (`byKey` Map preferring populated certification) stays unchanged — `trailer_youtube_key` is per-movie, not per-(type,date), so all rows for the same tmdb_id+region get the same key.

**Reconciliation pass:** the existing null-title reconciliation (PR #404/405) does NOT need changes for this. Existing rows with null trailer_youtube_key just stay null until the next full warm cycle — that's fine.

### 5. Type the new column on the client

`lib/tmdb.types.ts` — find the `CalendarRelease` interface (or similar). Add:

```ts
trailer_youtube_key: string | null;
```

`lib/release-calendar-service.ts` — `getReleaseCalendar()` currently does `select('*')` from PostgREST so the new column flows through automatically. No service-layer change needed.

### 6. New helper: `lib/trailer-utils.ts`

```ts
import { Linking } from 'react-native';

/**
 * Opens a YouTube video by key. iOS opens the YouTube app if installed,
 * falls back to Safari. Web opens a new tab.
 */
export function openTrailer(youtubeKey: string): Promise<void> {
  return Linking.openURL(`https://youtube.com/watch?v=${youtubeKey}`);
}
```

Tests: a small Jest test asserting `Linking.openURL` is called with the right URL.

### 7. Update `release-card.tsx`

Add a Pressable in the bottom-right of the content area. Conditional on `release.trailer_youtube_key`.

```tsx
{release.trailer_youtube_key && (
  <Pressable
    onPress={(e) => {
      e.stopPropagation?.();  // don't trigger card press
      openTrailer(release.trailer_youtube_key!);
    }}
    hitSlop={8}
    style={styles.trailerButton}
    accessibilityRole="button"
    accessibilityLabel="Play trailer"
  >
    <Text style={[styles.trailerText, { color: colors.tint }]}>
      Play Trailer
    </Text>
    <Ionicons name="play-circle" size={16} color={colors.tint} />
  </Pressable>
)}
```

Add styles:

```ts
trailerButton: {
  position: 'absolute',
  bottom: 0,
  right: 0,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},
trailerText: {
  ...Typography.body.smMedium,
  fontSize: 13,
  fontWeight: '600',
},
```

The watchlist button is at top-right; trailer button is at bottom-right. They don't overlap. Both are absolutely positioned within the same content container.

### 8. Tests

**Unit tests for `selectBestTrailer`** — `__tests__/edge-functions/select-best-trailer.test.ts` (Jest, since the helper is in `_shared/` and exportable as plain TS). Match warming worker's existing pattern of no Deno tests; this helper is the exception because it's pure and lives in a `_shared/` location that Jest can import.

If Jest can't resolve `supabase/functions/_shared/`, mirror the helper to `lib/trailer/` and have both Deno + Jest import it (decided in plan stage).

Test cases for `selectBestTrailer`:
- Empty `results` → null
- Only Vimeo videos → null
- Only Featurette/BTS types → null
- Single official Trailer → returns its key
- Trailer + Teaser → Trailer wins
- Two Trailers, one official one not → official wins
- Two officials, different `published_at` → most recent wins
- Mixed: official Teaser vs unofficial Trailer → Trailer wins (type beats official)

**Jest test for `openTrailer`** — `__tests__/lib/trailer-utils.test.ts`:
- Calls `Linking.openURL` with `'https://youtube.com/watch?v=KEY'`
- Returns the promise

**No new tests for** `release-card.tsx` (component test infra not extensive in this codebase) or the edge function changes (matches existing pattern). Manual device validation covers the integration.

### 9. Device validation

After deploy + OTA:
1. Open calendar, find a movie with a known trailer (e.g., a major theatrical release like Mortal Kombat II)
2. Confirm "Play Trailer ▶" button appears in bottom-right of the card
3. Tap → YouTube opens to the trailer
4. Find a movie known to lack a trailer — confirm NO button shows
5. Add a brand-new movie to watchlist → enrich-release-calendar fires fire-and-forget → wait ~5 sec → confirm button appears (proves per-add enrichment populates trailer_youtube_key)
6. Toggle watchlist filter on/off — confirm button still shows on watchlisted cards
7. Web build smoke: open in browser, tap Play Trailer → opens YouTube in a new tab

## Risks

| Risk | Mitigation |
|---|---|
| TMDB rate limiting from doubled per-movie calls | Calls run in parallel via `Promise.all` (no extra latency); rate limit is 50/sec; warming worker batches movies in groups of 20 with 250ms delay; doubling effectively halves the warming throughput but stays under limits. |
| `trailer_youtube_key` column added but warming worker hasn't run yet → existing rows stay null | Acceptable. Cards without trailers already exist (older rows). Daily warming + user-driven enrichment converge over time. Manual MCP backfill is an option. |
| YouTube link rotates / video gets pulled | YouTube handles this. User sees "video unavailable" page. Could detect and re-fetch on next warm — defer to follow-up. |
| Card press vs trailer button press conflict | `e.stopPropagation()` + nested Pressable handles RN gesture priority. Test on device; if the card press ever fires, switch to TouchableWithoutFeedback wrapper or use `onPressIn` priorities. |
| Web bundle leak from `Linking.openURL` | `Linking` is part of `react-native` core, web-shimmed by `expo`. Verified working pattern in this codebase. |
| Helper test infra (Jest vs Deno) | If Jest can't resolve `supabase/functions/_shared/`, mirror the helper to `lib/trailer/` and have both Deno + Jest import it. Decided in plan stage. |

## Out of scope (intentional)

- In-app YouTube player (modal, autoplay, controls, mute)
- Trailer embedding on the movie detail page (separate scope)
- "Watch trailer" CTA on the home screen
- Vimeo or TMDB-hosted videos
- Caching / CDN proxy for YouTube thumbnails (not used in this iteration)
- Recommendations / "more like this"
- Notifications for "new trailer added"
- Auto-extract a trailer thumbnail image to display inline
- Backfill of historical `trailer_youtube_key=null` rows (post-merge MCP run can do this if needed)

## Estimated scope

3-4 hours, single PR, single worktree.

**Branch:** `feat/sp4-c-trailer-thumbnails`
**Worktree path:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-trailer-thumbnails`
