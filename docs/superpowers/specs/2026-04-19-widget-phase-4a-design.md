# Widget Phase 4a — Design Spec

**Date:** 2026-04-19
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4a (Polish v2 + Haptics)
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Vault cross-ref:** `vault://Projects/CineTrak/Features/Widget Phase 4 - Kickoff Session Note`

## Context

Phases 1–3 shipped a fully functional interactive medium widget on iOS 17+. Phase 4a is the first of three sub-phases: polish the visible UX and close out Phase 3's haptics limitation investigation.

Decisions locked via brainstorming session (2026-04-18 through 2026-04-19). Full Q&A visuals persisted at `.superpowers/brainstorm/79136-1776581415/content/`.

## Scope & phasing

Phase 4a ships as **two sequential PRs** on separate branches.

| | Branch | Worktree | Scope | Estimate |
|--|--|--|--|--|
| PR #1 | `feature/widget-4a-layout` | `cinetrak-widget-phase-4a` | Stats header, movie thumbs, featured poster, Q5 hybrid backfill | 1.5–2 days |
| PR #2 | `feature/widget-4a-haptics` | `cinetrak-widget-phase-4a-haptics` | 3-hour timeboxed haptics investigation spike | 0.5 day |

PR #1 ships first and unlocks device validation. PR #2's worktree is created after PR #1 merges.

## Design decisions

### Q1 — Extra space on medium widget

**Decision:** 3 TV posters + 2 movie thumbnails in a right column.

Considered: 5 cramped posters (rejected — too small, kills featured treatment), vertical text list of 5 recent movies (rejected — less visual), dynamic info panel with next-episode countdown (rejected — extra data plumbing, defer to 4c).

### Q2 — Featured-poster treatment

**Decision:** Last-updated show is always centered and enlarged (`flex: 1.4` vs `flex: 1`). Completed state does NOT change size — it adds a "Completed!" banner plus "Start S{N+1}" button inside the normal-size poster.

Rationale: the two-rules interaction (last-updated size change + completed size change) produces an ugly "2 enlarged + 1 squished" layout. A single sizing rule based on recency keeps the widget visually stable.

### Q3 — Haptics time-box

**Decision:** 3 hours of investigation in PR #2. Steps: iOS 27 beta test if available, Apple developer forum search, try alternate APIs (`SensoryFeedback` variants, `WKInterfaceDevice.play()`). If nothing fires on iOS 26.5 widget extensions after 3 hours, strip the dead haptic code from Phase 3 (keep `.contentShape` hit-target expansion which DOES work) and document as iOS limitation.

### Q4 — Stats header format

**Decision:** `Watched: {filmsWatched} Movies · {showsWatched} TV Shows` (middle dot `·`, Apple HIG standard).

Considered: pipe `|` (too technical), bullet `•` with no "Watched:" prefix (less clear), two-line with big numbers (trades poster space, overkill).

### Q5 — 100%-complete show behavior

**Decision:** **Hybrid C.** Widget query prefers active (`status='watching'`) shows. If fewer than 3 active, backfill with recently-watched (`status='watched'`) shows marked as trophies (dimmed + checkmark overlay). Heavy users see only actionable shows; light users never see empty slots.

Deferred to future iteration: using TMDB's show `status` field ("Ended" / "Returning Series") to distinguish "done forever" from "caught up, waiting for new season."

## Visual spec

### Dimensions (medium widget, ~338×158 pt)

- Padding: 14pt vertical, 16pt horizontal
- Stats header: ~25pt tall, centered, 11pt font, `rgba(255,255,255,0.6)`
- Body: HStack with 8pt gaps — 3 posters + movie thumb column

### Poster sizing (HStack flex)

- Left & right slots: `flex: 1`
- Center slot when it's the last-updated: `flex: 1.4`
- Movie thumb column: fixed 32pt wide, 2 thumbs stacked vertically with 4pt gap

### Per-poster states (independent of slot position)

| State | Visual treatment |
|--|--|
| Active, not last-updated | Normal size; title + "S{N} E{M}" at bottom |
| Active, last-updated (center slot) | Enlarged (`flex: 1.4`); subtle amber ring `0 0 0 1.5pt rgba(255,185,96,0.5)` |
| Season complete, has next season on TMDB | "Completed!" banner (top, green) + "Start S{N+1}" tappable button (bottom); poster keeps its slot's normal size |
| Trophy (`is_trophy=true`) | Opacity 0.45, saturation 0.4; 26pt green circular checkmark centered; no eyeball button |

### Per-widget states (overall)

- **Normal** — ≥3 active shows: top 3 by `updated_at`
- **Light user** — &lt;3 active shows: backfill with recently-watched (trophy state) to reach 3 total
- **Signed out** — existing Phase 1 empty state, unchanged

### Movie thumbs (right column)

- Source: 2 most-recently-watched movies from `user_movies` where `status='watched'`, ordered by `updated_at` DESC
- Both tappable; deep link to movie detail route using the same `Link(destination:)` pattern the show posters use in Phase 1. The plan step verifies the movie-detail URL scheme exists — if not, a short RN-side addition is in-scope.
- Graceful degradation: if user has 0 movies, the thumb column is not rendered at all (HStack omits it); if user has 1, only the top thumb renders and the bottom slot is empty space.
- Tap target ≥ 44pt via `.contentShape` padding (visually 32pt, hit area expanded). Same approach as Phase 3's eyeball button.

## Data model changes

### Widget payload schema (version 1 → 2)

```ts
type WidgetPayload = {
  version: 2,
  cached_at: number,
  stats: { films_watched: number, shows_watched: number },
  shows: [
    {
      // ...existing Phase 3 fields:
      user_tv_show_id, tmdb_id, name, poster_filename,
      current_season, current_episode, total_seasons,
      total_episodes_in_current_season, episodes_by_season,
      is_season_complete, has_next_season, next_season_number, is_show_complete,

      // new in v2:
      is_trophy: boolean,       // true = sourced from status='watched' backfill
      last_updated: boolean     // true for the single most-recently-updated non-trophy show
    }
  ],
  movies: [                     // new in v2, max length 2
    { tmdb_id: number, name: string, poster_filename: string | null }
  ]
}
```

### Query changes in `syncWidgetCache()`

1. **Shows primary (unchanged):** `user_tv_shows` where `status='watching'`, order by `updated_at` DESC, limit 20. Take top 3.
2. **Shows backfill (new):** If primary count &lt; 3, run `user_tv_shows` where `status='watched'`, order by `updated_at` DESC, limit `3 - count`. Concat to primary results. Mark backfilled entries with `is_trophy: true`.
3. **`last_updated` flag computation:** Among shows where `is_trophy=false`, set `last_updated=true` on the entry with the highest `updated_at`. If all 3 are trophies (extremely light user), no flag set — rendering falls back to all-`flex: 1`.
4. **Show ordering in payload:** After flagging, reorder the shows array so the `last_updated=true` entry sits at index 1 (center slot). If no show has the flag (all trophies), keep the natural updated_at DESC order. Swift renders `shows[0]`, `shows[1]`, `shows[2]` as left/center/right — no position logic needed in the view layer.
5. **Movies (new):** `user_movies` where `status='watched'`, order by `updated_at` DESC, limit 2. Map to `{ tmdb_id, name, poster_filename }`. Download posters to `movie_poster_0.jpg` and `movie_poster_1.jpg` via the existing `writePosterFile` mechanism.

### Swift decoding compatibility

Missing `movies` / `is_trophy` / `last_updated` fields on decoded `WidgetPayload` default to `[]` / `false` / `false`. Pre-v2 caches written by Phase 3 render gracefully during rollout; no explicit migration logic needed.

## Implementation touchpoints

### RN side (`cinetrak/`)

- `lib/widget-cache.ts` — largest change. Add backfill query branch, movies query, poster download for movies, `last_updated` computation in `buildWidgetPayload()`, version bump to 2.
- `lib/widget-bridge.ts` — extend `WidgetPayload` TS type: add `movies` array, `is_trophy`, `last_updated`.
- `lib/widget-constants.ts` — add `MOVIE_POSTER_PREFIX = 'movie_poster_'`.

### Swift widget extension (`expo-plugins/widget-extension/src/PocketStubsWidget/`)

- `Models/WidgetData.swift` — add `Movie` struct; add `isTrophy: Bool = false` and `lastUpdated: Bool = false` to `Show`; add optional `movies: [Movie]?` to root payload struct.
- `Views/WidgetView.swift` — restructure HStack: update stats text format, apply flex ratios (center = 1.4 iff `lastUpdated`), append movie thumb column.
- `Views/SeasonCompleteBadge.swift` — verify banner + "Start S{N+1}" button render legibly at side-poster size (normal `flex: 1`). If cramped, tighten banner padding or swap for corner badge.
- `Views/EyeballButton.swift` — hide entire button when `isTrophy=true`.
- **New — `Views/MovieThumb.swift`** — small poster component, 32pt wide, tappable deep link.
- **New — `Views/TrophyOverlay.swift`** — ViewModifier applying opacity 0.45, saturation 0.4, and centering a green checkmark overlay.

### Tests (`cinetrak/__tests__/`)

- `__tests__/lib/widget-cache.integration.test.ts`:
  - Backfill triggers when active count &lt; 3 (test 0/3, 1/3, 2/3 active scenarios)
  - Backfill does NOT trigger when active count ≥ 3
  - `last_updated` set on most-recent non-trophy; absent when all 3 are trophies
  - Movies query populates from `user_movies` status='watched'
  - Graceful with 0 or 1 movies
  - Payload v2 shape — schema guard
- Maintain the 721-test green baseline.

### Out of scope for 4a

- New edge functions (none needed — movies don't require TMDB refresh)
- DB migrations (no schema changes)
- New entitlements or App Group changes
- Small + large widget variants (Phase 4c)
- Small-poster Completed-state legibility redesign — decided by device test, in-scope for this PR only if cramped

## Testing & risk

### Device validation checklist (Tyshane, before merge)

- [ ] Happy path: 3 active shows, stats render correctly, center poster amber ring visible in both light and dark mode
- [ ] Movie thumbs tappable, deep links route to correct movie detail
- [ ] Side-poster completed-state (season rollover) — banner + Start S{N+1} legible
- [ ] Trophy state — sign in with account having &lt;3 active + ≥1 completed show; confirm dim + checkmark renders
- [ ] Light user fallback — confirm backfill fills slots; no empty slot UI
- [ ] Stats text format matches spec

### Risk register

| Risk | Likelihood | Impact | Mitigation |
|--|--|--|--|
| Amber ring too subtle in light mode | Medium | Low | Device test; bump opacity or switch to accent color if invisible |
| Completed banner illegible on side posters | Medium | Medium | Device test during implementation; fallback = corner badge |
| Backfill adds round-trip latency | Low | Low | Only fires when primary returns &lt;3; single additional query |
| Movie thumb tap target too small | Low | Low | `.contentShape` expands hit area to 44pt min |
| Haptics spike yields nothing | High (accepted) | Low | Strip dead code; write ADR; accept iOS limitation |
| Payload version skew with pre-v2 Phase 3 caches | Low | Low | Swift decodes with defaults; no migration |

### Rollback strategy

Both PRs revert cleanly via `git revert`. No DB changes, no auth changes, no shared state mutations. Widget-only blast radius.

## References

- `vault://Projects/CineTrak/Features/Widget Phase 4 - Kickoff Session Note`
- `vault://Projects/CineTrak/Features/Widget Phase 3 - Polish Plan`
- `vault://Projects/CineTrak/Features/Widget Phase 3 - Deploy Gotchas + Widget Ext Haptic Limits`
- `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
- `vault://Projects/CineTrak/Features/PRD - User Show Metadata Refresh` (Phase 4b context)
- `docs/superpowers/specs/2026-03-12-premium-gating-design.md` (prior spec format reference)
