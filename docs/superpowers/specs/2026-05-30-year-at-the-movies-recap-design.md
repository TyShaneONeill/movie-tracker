# Design Spec — "Your Year at the Movies" Recap (v1)

**Date:** 2026-05-30
**Status:** Approved (design) — ready for implementation plan
**Author:** Tyshane + Claude (co-pilot)
**Vault tracker:** `Projects/PocketStubs/Features/Engagement & Retention Initiative.md`
**Origin:** Hermes engagement analysis 2026-05-30 (direction ②, "Your Year at the Movies"). All Hermes claims re-verified against live code + git before scoping.

---

## 1. Summary

A free, shareable **ticket-stub poster** summarizing a user's completed year at the movies (films, hours, top genre, TV, plus sparse "moat" stats like premium-format and theater counts). Reachable from the Analytics tab with a year-archive selector. **Dark-launched:** the code ships to production dormant behind a default-OFF feature flag and stays invisible to users until the December 2026 moment, while remaining fully testable by the founder. The poster is the shippable core (v1); it is built self-contained so a later swipeable reveal sequence can wrap around it without rework.

**Strategic rationale:** PocketStubs+ is over-indexed on utility features; the recap adds an identity/delight artifact that drives both retention (annual hook) and acquisition (every share is a free billboard). With $0 revenue and a tiny base, v1 is intentionally **free and ungated** to maximize shareability.

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | First build target | "Your Year at the Movies" recap |
| 2 | Experience shape | **Hybrid (C):** build the single shareable poster (A) first, architected so a 3–4 card reveal sequence (C) wraps it later |
| 3 | Hero stats — always-on | **Films seen · Hours watched · Top genre · TV/episodes** |
| 4 | Hero stats — moat (adaptive) | **Premium-format count (IMAX/Dolby) · Theaters & chains visited** — render only when present |
| 5 | Reveal bookends (Phase C) | **First film → Last film** of the year |
| 6 | Cut from v1 | most-rewatched, avg rating, busiest month, First Takes count, $ spent |
| 7 | Availability | **Seasonal drop + archive:** year-archive selector over all completed years; default = most-recent **completed** year (see #13). Code ships now but **dormant** (per #11); user-facing go-live is the Dec 2026 flag flip + a push (Phase B). Not an in-progress year-to-date view. |
| 8 | Premium gating | **Free, no gate** in v1. Monetization (hi-res export / premium reveal / extra stats) deferred. |
| 9 | Poster style | **Ticket Stub** — perforated edge, ADMIT ONE, stats as ticket fields. On-brand, uncopyable, frames moat stats as ticket fields. |
| 10 | Data handling | Aggregate on `COALESCE(watched_at, added_at)`, bucketed in the **user's local timezone**; moat stats degrade gracefully when null. |
| 11 | **Release model** | **Dark launch.** Ship to production dormant; hidden from all users behind PostHog flag `year_recap_enabled` (default OFF). Flip ON remotely in **December 2026** — no app release needed. Flag = kill switch. |
| 12 | **Dev/test visibility** | Entry point visible to the founder while hidden from users, via `EXPO_PUBLIC_DEV_USER_IDS` + `__DEV__`. The `/recap/[year]` route is always directly navigable for testing regardless of flag. |
| 13 | **Launch year** | At Dec 2026 flip, default = most-recent **completed** year = **2026**. Pre-launch testing uses **2025** (complete real data) and **2026** (in-progress) to exercise both full and partial aggregation. |

---

## 3. Scope

**In scope (v1):**
- New year-scoped, timezone-correct stats RPC + seeded SQL correctness harness
- `useYearRecap(year)` hook
- Recap screen + Analytics-tab entry point + year-archive selector
- Ticket-stub poster component (adaptive to available data)
- Share integration (reuse existing capture + share service)
- **Dark-launch visibility gate** (`useRecapVisible()` — default hidden, dev override) + **dev-only `preview` QA mode**
- Empty/sparse/loading/error states
- Tests + lint/tsc/jest green

**Out of scope (deferred, but design must not preclude):**
- **Phase B:** late-December seasonal push notification for the just-completed year
- **Phase C:** swipeable reveal sequence (first film → hero stats → poster finale)
- Premium gating / hi-res export / watermark-free export
- In-progress (year-to-date) view

---

## 4. Architecture

### 4.1 Data layer — new RPC `get_user_year_recap(p_year int, p_timezone text default 'UTC')`

- **Security:** `security definer`, filters internally on `auth.uid()` — never trusts a passed user id. Granted to `authenticated` only.
- **Isolation:** new function; does **not** modify the existing `get_user_stats_summary` / `get_user_monthly_activity` RPCs (Analytics tab behavior unchanged).
- **Single round-trip:** returns one JSON object.
- **Year filter (timezone-correct):** bucket each timestamp in the user's local timezone before extracting the year:
  `EXTRACT(YEAR FROM (COALESCE(watched_at, added_at) AT TIME ZONE p_timezone)) = p_year`
  for `user_movies` (status = 'watched'); same pattern on `user_episode_watches.watched_at`. The client passes `Intl.DateTimeFormat().resolvedOptions().timeZone` (e.g. `'America/New_York'`); `p_timezone` defaults to `'UTC'` if absent. This matches the app's existing local-date philosophy (`lib/utils.ts:53`) and prevents Dec-31-late / Jan-1-early films landing in the wrong year.
- **Guard:** validate `p_timezone` is a recognized IANA name; fall back to `'UTC'` on an invalid value rather than erroring.

**Returned shape (JSON):**
```
{
  year: int,
  films_seen: int,                       // count user_movies watched in year
  hours_watched: numeric,                 // Σ runtime_minutes (movies) — see TV note
  genres: [{ genre_id: int, count: int }],// mapped to names client-side
  tv_shows: int,                          // distinct user_tv_shows active in year
  episodes_watched: int,                  // count user_episode_watches in year
  tv_hours: numeric,                       // Σ episode_runtime in year (kept separate to avoid double counting)
  formats: [{ format: text, count: int }],// watch_format ∪ theater_visits.format — MOAT, may be []
  theaters_count: int,                    // distinct theater_name — MOAT, may be 0
  chains_count: int,                      // distinct theater_chain — MOAT, may be 0
  first_film: { title: text, date: date } | null,  // Phase C bookend
  last_film:  { title: text, date: date } | null,   // Phase C bookend
  available_years: [int]                   // distinct years with watch data → archive selector
}
```

**Notes:**
- **TV hours kept separate** (`tv_hours`) from movie `hours_watched` to avoid double counting; the poster's "hours" hero uses movie hours (decide in plan whether to add tv_hours — default: movies only for the headline, TV shown as shows/episodes).
- Genre id→name mapping done client-side via `TMDB_GENRE_MAP` (`lib/tmdb.types.ts`), with `lib/genre-service.ts` fallback.
- `EXPLAIN` check that the year filter uses existing `user_id` + date indexing; add an index only if the plan shows a seq scan at scale.

### 4.2 Client

- **Hook:** `hooks/use-year-recap.ts` — `useYearRecap(year: number)` wraps react-query + `supabase.rpc('get_user_year_recap', { p_year: year })`; maps genre IDs → names; exposes `{ data, isLoading, error }`.
- **Screen:** `app/recap/[year].tsx` (expo-router; same convention as `app/analytics/[type].tsx`). Reads `year` param, renders poster + share button + archive selector.
- **Entry point:** a "Your Year at the Movies 🎟️" card pinned at the top of `app/(tabs)/analytics.tsx` → `router.push('/recap/<latestCompletedYear>')`.
- **Archive selector:** compact year chip row on the recap screen, fed by `available_years`.

### 4.3 Poster component — `components/recap/year-recap-poster.tsx`

- **Render:** plain React Native view (not Skia) for clean capture, mirroring the existing journey-card capture path.
- **Design:** ticket-stub — dark header bar (ADMIT ONE · POCKETSTUBS · 'YY), perforated divider (cinema red dashed + notch circles), cream body, large hero numeral, stat grid, footer line ("Your <year> at the movies").
- **Stat hierarchy (resolves mockup vs. decision §3/§4):**
  - **Hero numeral:** `films_seen`.
  - **Always-on grid stats (in order):** Hours watched · Top genre · TV/episodes.
  - **Adaptive moat slots (appended only when count > 0):** Premium-format count · Theaters & chains.
  - The grid renders 3–5 cells depending on available moat data and reflows accordingly (the earlier mockup showed the moat-rich variant; TV/episodes is always present whether or not moat stats are).
- **Palette:** matte black `#1A1A1A`, cinema red `#C41E3A`, warm cream `#F5EBD9`, gold `#D4AF37` accent (consistent with Achievement Visual System).
- **Adaptive:** moat fields (formats, theaters) render only when count > 0; the stat grid reflows to whatever is present. Never shows "0 IMAX".
- **Ref:** exposes a `ViewShot` ref for capture.

### 4.4 Share — `lib/share-service.ts`

- Add `shareRecap(viewShotRef, year)` alongside `shareReview()`: `captureCard(ref)` → PNG URI → native Share (`expo-sharing`) or Web Share API + clipboard fallback (PR #495 pattern). No new sharing infra.

### 4.5 Release gating — dark launch (visible to founder, hidden from users)

The feature ships to production **dormant** and stays invisible to users until the December 2026 flip.

- **Public visibility gate:** the Analytics-tab entry card renders only when:
  `useFeatureFlag('year_recap_enabled').enabled === true` **OR** the current user id ∈ `EXPO_PUBLIC_DEV_USER_IDS` **OR** `__DEV__`.
  Default flag state = **OFF**, so production users see nothing. (Same flag mechanism as the existing `popcorn_motion_physics` flag — `hooks/use-feature-flag.ts`.)
- **Remote launch + kill switch:** flip `year_recap_enabled` ON in PostHog in December — no app store release, no OTA needed. Flipping OFF instantly hides it if anything looks wrong.
- **Route always testable:** `app/recap/[year].tsx` is directly navigable (deep link / dev menu) **regardless of the flag**, so the founder can QA any time without exposing the entry point.
- **Gate helper:** centralize the visibility check in a small `useRecapVisible()` hook (wraps flag + dev-id + `__DEV__`) so there's one source of truth and the entry card stays a one-liner.

### 4.6 Testability (first-class — feature won't ship for ~7 months)

Because this sits unreleased until end of 2026, it must be trivially testable and data-verifiable in the interim:

- **Direct route + year archive:** navigate to `/recap/2025` (complete real data) or `/recap/2026` (in-progress) at will; the archive selector lists all `available_years`.
- **Forced-state QA mode:** the recap screen accepts a dev-only `preview` param (`/recap/2025?preview=full|sparse|empty`) that overrides the rendered data with fixtures, so all fallback branches (no moat data, thin year, empty) can be verified **without hunting for real sparse accounts**. `preview` is ignored unless `__DEV__` or dev-user.
- **RPC correctness harness:** a SQL test script (committed under `supabase/tests/` or the migration's companion) that seeds a synthetic user with: films across 2024/2025/2026 boundaries, rows with NULL `watched_at` (exercise COALESCE), a Dec-31-23:30-local film (exercise timezone bucketing), sparse vs rich formats/theaters, and an empty year — asserting exact recap output per year and timezone.
- **Data parity check:** a documented manual step to cross-check the RPC's `films_seen`/`hours_watched` for a known year against the existing Analytics tab totals (sanity that the new aggregation agrees with shipped numbers where they overlap).

---

## 5. States

| State | Behavior |
|-------|----------|
| Healthy | Full ticket-stub poster + share button + archive selector |
| Sparse moat data | Core 4 stats shown; moat fields hidden (adaptive grid) |
| Thin year (< ~5 films) | Friendly "Not enough yet — keep logging" empty state instead of a barren stub (exact threshold set in plan) |
| Loading | react-query loading skeleton consistent with analytics screen |
| Error | Inline error + retry, per existing analytics pattern |

---

## 6. Testing

- **RPC (SQL):** seeded user spanning 2024/2025/2026 boundaries; null `watched_at` (verify COALESCE→added_at path); a Dec-31-23:30-local film (verify timezone bucketing puts it in the right year for a non-UTC `p_timezone`); invalid `p_timezone` → UTC fallback; sparse/empty formats + theaters; confirm year scoping, graceful nulls, and `available_years` correctness. (See §4.6 harness.)
- **Hook:** mocked-rpc unit test, including genre id→name mapping and error path; verify it passes the device timezone.
- **Poster:** render tests for full data, sparse (no moat), and empty/thin year — driven via the `preview` fixtures so each branch is deterministic.
- **Visibility gate:** unit test `useRecapVisible()` — OFF flag + non-dev user → hidden; flag ON → visible; dev user / `__DEV__` → visible regardless of flag.
- **Share:** reuse existing share-service test patterns; manual verification native + web.
- **Gate:** `npm run lint && npx tsc --noEmit && npm test` must pass before PR.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **Accidental early exposure to users** | Default-OFF PostHog flag + dev-only override; entry hidden unless `year_recap_enabled` or dev user. Route reachable only by direct nav. Verified by the `useRecapVisible()` gate test. |
| **Year-boundary miscount (timezone)** | Bucket on `COALESCE(...) AT TIME ZONE p_timezone` using device tz; explicit Dec-31-late test case |
| Sparsity of `watch_format` / `theater_chain` / `theater_visits` | Adaptive rendering; core 4 stats are always-available; moat is bonus |
| `watched_at` nullable | `COALESCE(watched_at, added_at)` in the RPC |
| view-shot fidelity web vs native | Reuse proven journey-card capture path |
| TV runtime double-counting | Keep `tv_hours` separate; headline "hours" = movies only (revisit in plan) |
| Genre name drift | Static `TMDB_GENRE_MAP` + `genre-service` fallback |
| RPC performance at scale | `EXPLAIN` check; add index only if needed |
| Stale data (real stats won't exist until year-end) | Feature is data-correct by construction (aggregates live tables); pre-launch QA uses 2025 real data + `preview` fixtures, not mock numbers |

---

## 8. File manifest

**New:**
- `supabase/migrations/<timestamp>_create_get_user_year_recap.sql` (RPC, timezone-aware)
- `supabase/tests/get_user_year_recap_test.sql` (seeded correctness harness — §4.6)
- `hooks/use-year-recap.ts` (passes device timezone)
- `hooks/use-recap-visible.ts` (`useRecapVisible()` — flag + dev-id + `__DEV__`)
- `app/recap/[year].tsx` (reads `year` + dev-only `preview` param)
- `components/recap/year-recap-poster.tsx`

**Modified:**
- `lib/share-service.ts` (add `shareRecap()`)
- `app/(tabs)/analytics.tsx` (add recap entry card, gated by `useRecapVisible()`)

---

## 9. Out-of-scope follow-ups (tracked for later)

- **Launch toggle (Dec 2026):** flip PostHog `year_recap_enabled` ON — this is the actual go-live, no release required (the gate is built in v1).
- **Phase B:** schedule late-December push notification ("Your <year> is ready") — app already has push infra.
- **Phase C:** swipeable reveal sequence wrapping this poster as the finale.
- **Monetization:** hi-res / watermark-free export, premium reveal cards, extra stats behind PocketStubs+.
