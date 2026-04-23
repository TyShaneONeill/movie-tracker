# Widget Phase 4c.3e — Widget UX Unlocks Design Spec

**Date:** 2026-04-22
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4c sub-project 3e (widget UX unlocks: proactive unaired-episode handling + next-season-waiting state)
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Parent note:** `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` (section 3e)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`
**Predecessor PRs:** #388 (4b.3), #389 (4b.4), #390 (4c tactical), #391 (4c flipped), #392 (4c catalog), #393 (wrapper fix), #394 (4c.3c server guard + pulse)

## Context

Phase 4c.3c (#394) closed the widget-bypasses-TS-guard bug at the RPC layer — the `mark_episode_watched` RPC now rejects unaired episodes with ERRCODE 22023. Device validation confirmed the data-integrity fix works, but also confirmed the `.pulse` breadcrumb is imperceptible on a 12pt SF Symbol. Users tapping the eyeball on an unaired episode still see nothing happen.

3e solves this proactively: instead of letting the tap happen and be silently rejected, the widget learns the air date at sync time and renders a non-tappable "Airs Friday" badge in the eyeball's place. The same mechanism covers a second waiting case: Returning Series where the user is caught up on the current season and `nextSeasonNumber` exists but `(nextSeasonNumber, 1)` hasn't aired yet. Previously the widget showed a tappable "Start S0N" button that would advance to an empty state if tapped.

`tv_show_episodes` (PR #392) already has the per-episode air_date data. No backend work needed — all air_date lookups happen RN-side during `syncWidgetCache`, carried into the widget payload, and consumed by the widget view at render time.

## Scope decision (from brainstorm)

| Sub-feature | Included? | Notes |
|--|--|--|
| A — Unaired next-episode UX | Yes | Eyeball replaced by orange "Airs Friday" pill when `nextEpisodeAirDate > today` |
| B — Next-season waiting UX | Yes | `Start S03` button replaced by orange "S03 airs Friday" pill when `nextSeasonFirstAirDate > today` |
| C — Episode-remaining count | Deferred | Not currently rendered; adds new UI with no clear user demand. YAGNI. |

## Design decisions (resolved during brainstorm)

| Decision | Value |
|--|--|
| Payload shape | Minimal flat fields: `nextEpisodeAirDate: String?` + `nextSeasonFirstAirDate: String?` on `Show` struct |
| Badge text format | Contextual: 1–6 days → weekday name ("Friday" — covers days=1 as tomorrow's weekday name, not a literal "tomorrow"), 7d–1y → short month-day ("Apr 29"), >1y → year ("2027"), nil fallback → render tappable eyeball (not a TBA badge) |
| Badge visual style | Orange capsule/pill — `Color.orange.opacity(0.18)` fill, `Color.orange` text, 0.5pt orange border at 0.35 opacity |
| Unaired next-episode rendering | Replace eyeball entirely — badge takes the eyeball's slot. No greyed-out eyeball, no clock icon. |
| Next-season waiting rendering | Replace `Start S03` button with same orange pill: `"S03 airs Friday"`. "Completed!" label above stays unchanged. |
| Nil air_date fallback | Render tappable eyeball (current behavior). Preserves user agency when catalog data is missing; 4c.3c's RPC guard + pulse handles the edge case. No "Date TBA" state. |
| Date comparison | Widget-side at render time — compare ISO date string to `Date()` via `Calendar.current`. No pre-computed "is unaired" boolean in payload. Lets the widget transition correctly on midnight rollover even if the payload hasn't resynced. |
| RN-side data fetching | One batched Supabase query per `syncWidgetCache` call covering all (show, season, episode) tuples across all widget shows. Typically ≤6 rows. |
| Widget test target | Out of scope — use pure function + inline test if `formatAirDate` logic demands unit coverage; otherwise rely on device validation. |

## Scope

### 1. Payload — `WidgetData.swift` `Show` struct

Add two fields (v3 schema, decodeIfPresent for backwards compat):

```swift
// Existing fields...
let isLastUpdated: Bool

// Phase 4c.3e additions
let nextEpisodeAirDate: String?       // ISO-8601 date for (currentSeason, currentEpisode+1)
let nextSeasonFirstAirDate: String?   // ISO-8601 date for (nextSeasonNumber, 1); nil when !hasNextSeason
```

Update:
- `Show` designated initializer: add both parameters with `nil` defaults at the end
- `CodingKeys`: add `case nextEpisodeAirDate = "next_episode_air_date"`, `case nextSeasonFirstAirDate = "next_season_first_air_date"`
- `init(from decoder:)`: add `decodeIfPresent` calls for both, default `nil`
- `WidgetDataWriter.markEpisodeWatched` / `advanceSeason`: propagate both fields through the patch mutation — they're read-through from the existing cached row, not recomputed (the next widget sync refreshes them)

### 2. RN-side sync — wherever `syncWidgetCache` builds the payload

Locate the existing `buildShowPayload` (or equivalent). After collecting the shows' `(tmdb_show_id, current_season, current_episode, next_season_number, has_next_season)` state, run a single batched query:

```ts
const tuples: Array<[number, number, number]> = [];
for (const show of shows) {
  // Next episode in current season
  tuples.push([show.tmdbShowId, show.currentSeason, show.currentEpisode + 1]);
  // First episode of next season, if applicable
  if (show.hasNextSeason && show.nextSeasonNumber != null) {
    tuples.push([show.tmdbShowId, show.nextSeasonNumber, 1]);
  }
}

const { data: episodeRows } = await supabase
  .from('tv_show_episodes')
  .select('tmdb_show_id, season_number, episode_number, air_date')
  .or(tuples.map(([s, se, ep]) =>
    `and(tmdb_show_id.eq.${s},season_number.eq.${se},episode_number.eq.${ep})`
  ).join(','));

const airDateMap = new Map<string, string | null>();
for (const row of episodeRows ?? []) {
  airDateMap.set(`${row.tmdb_show_id}:${row.season_number}:${row.episode_number}`, row.air_date);
}

// During payload build, per show:
const nextEpisodeAirDate = airDateMap.get(`${show.tmdbShowId}:${show.currentSeason}:${show.currentEpisode + 1}`) ?? null;
const nextSeasonFirstAirDate = show.hasNextSeason && show.nextSeasonNumber
  ? airDateMap.get(`${show.tmdbShowId}:${show.nextSeasonNumber}:1`) ?? null
  : null;
```

The `or()` clause with `and(...)` tuples is PostgREST's way to query by multiple composite keys in one round trip. Fail-open on query error — fall back to `null` for both fields and let the widget render tappable eyeballs (no regression from pre-3e behavior).

### 3. Swift date formatter + badge view — new `Views/AirDateBadge.swift`

```swift
import SwiftUI

/// Formats an ISO-8601 date string into widget-friendly "Airs X" text.
/// Comparison is against the calendar day, not instant time — so "tomorrow"
/// rolls over at local midnight.
func formatAirDate(_ iso: String, now: Date = Date(), calendar: Calendar = .current) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    // Parse as local calendar date — TMDB air_date is a calendar day
    // (yyyy-MM-dd), not an instant. Using local tz means "Airs Thursday"
    // means "aim to watch on your Thursday."
    guard let airDate = formatter.date(from: iso) else { return "soon" }

    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    let components = calendar.dateComponents([.day], from: today, to: air)
    let days = components.day ?? 0

    if days <= 0 {
        return "soon" // already-aired shouldn't reach here, but guard
    } else if days <= 6 {
        let weekdayFormatter = DateFormatter()
        weekdayFormatter.dateFormat = "EEEE"
        return weekdayFormatter.string(from: airDate)
    } else if days <= 365 {
        let shortFormatter = DateFormatter()
        shortFormatter.dateFormat = "MMM d"
        return shortFormatter.string(from: airDate)
    } else {
        let yearFormatter = DateFormatter()
        yearFormatter.dateFormat = "yyyy"
        return yearFormatter.string(from: airDate)
    }
}

struct AirDateBadge: View {
    let text: String  // e.g. "Airs Friday" or "S03 airs Friday"

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(.orange)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.orange.opacity(0.18))
            .clipShape(Capsule())
            .overlay(
                Capsule().strokeBorder(Color.orange.opacity(0.35), lineWidth: 0.5)
            )
    }
}

/// Helper: returns true when the given ISO date is strictly in the future relative to `now`.
func isAirDateFuture(_ iso: String?, now: Date = Date(), calendar: Calendar = .current) -> Bool {
    guard let iso = iso else { return false }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    // Parse as local calendar date — TMDB air_date is a calendar day
    // (yyyy-MM-dd), not an instant. Using local tz means "Airs Thursday"
    // means "aim to watch on your Thursday."
    guard let airDate = formatter.date(from: iso) else { return false }
    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    return air > today
}
```

### 4. Widget view integration — `WidgetView.swift` + `SeasonCompleteBadge.swift`

`WidgetView.swift` `ShowCard` bottom block:

```swift
Group {
    if show.isTrophy {
        EmptyView()
    } else if show.isSeasonComplete {
        SeasonCompleteBadge(show: show)
    } else {
        VStack(spacing: 2) {
            Text(episodeLabel)
                .font(.caption2)
                .foregroundColor(.primary)
            // Phase 4c.3e: badge replaces eyeball when next episode unaired
            if isAirDateFuture(show.nextEpisodeAirDate) {
                AirDateBadge(text: "Airs \(formatAirDate(show.nextEpisodeAirDate!))")
            } else {
                EyeballButton(show: show)
            }
        }
    }
}
```

`SeasonCompleteBadge.swift`:

```swift
var body: some View {
    VStack(spacing: 3) {
        Text("Completed!")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.green)
            .symbolEffect(.bounce, value: show.isSeasonComplete)

        if show.hasNextSeason, let next = show.nextSeasonNumber {
            // Phase 4c.3e: show orange airs-pill when next season hasn't aired
            if isAirDateFuture(show.nextSeasonFirstAirDate) {
                AirDateBadge(text: "S\(String(format: "%02d", next)) airs \(formatAirDate(show.nextSeasonFirstAirDate!))")
            } else {
                Button(intent: StartNextSeasonIntent(...)) {
                    // existing button content unchanged
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

## Testing

### Swift tests — pure functions only, no widget test target

`formatAirDate` and `isAirDateFuture` are pure. If we want coverage, we can:
1. Add them to a shared file that's also compilable from a tiny `swift run` harness, OR
2. Skip unit tests and rely on device validation — these functions are simple enough that device testing + the ~5 cases below cover correctness.

Recommendation: **skip unit tests for this PR.** Cases to exercise during device validation:
- Next episode airs tomorrow (days=1) → weekday name (e.g., "Airs Thursday"). Per brainstorm decision, we do NOT print literal "tomorrow" — days=1 falls into the 1–6-day weekday-name bucket for format consistency
- Next episode airs in 3 days (Friday) → "Airs Friday"
- Next episode airs in 12 days (Apr 29) → "Airs Apr 29"
- Next episode airs in 500 days → "Airs 2027"
- `nextEpisodeAirDate == nil` → tappable eyeball, no badge

### RN tests — `__tests__/lib/widget-cache.test.ts`

Mock Supabase; assert that for a show where `tv_show_episodes` returns a future air_date, the payload includes `nextEpisodeAirDate`. Four cases:
1. Aired next episode → `nextEpisodeAirDate` set to a past date
2. Unaired next episode → `nextEpisodeAirDate` set to a future date
3. `hasNextSeason && nextSeason.episode1.air_date > today` → `nextSeasonFirstAirDate` set to future date
4. `!hasNextSeason` → `nextSeasonFirstAirDate` is `null`

### Device validation

- Pick a Returning Series mid-season with an unaired next episode (same fixture as 4c.3c device test): verify orange pill replaces eyeball. Tap does nothing (non-interactive).
- Let the air date pass (or change system clock) and reload widget: badge disappears, eyeball reappears, tap marks as watched.
- Pick a caught-up Returning Series where next season's E01 hasn't aired: verify "S0N airs [date]" pill replaces "Start S0N" button. Tap does nothing.
- Backwards compat: verify v1/v2 cached payloads decode cleanly with new fields defaulting to nil.

## Out of scope (explicit)

- **Sub-feature C** (aired-only episode-remaining count) — YAGNI deferral per brainstorm
- **Notification or "airing tomorrow" alerts** — widget only
- **Backend changes** — no new Supabase fields, functions, or edge functions. All data from existing `tv_show_episodes`.
- **Widget test target setup** — not worth the yak-shaving for two pure functions
- **Animation polish** — no new `.symbolEffect` or transition animations beyond what's already there
- **Payload version bump / migration** — rely on `decodeIfPresent` for v2→v3 compat, same pattern as `movies` and `isLastUpdated`

## Dependencies / sequencing

Depends on: `tv_show_episodes` table (#392 shipped). Reuses existing RN Supabase client infrastructure.

Unblocks nothing in Phase 4c queue (3e closes out the phase), but the `nextEpisodeAirDate` field sets foundation for future "airing soon" notifications or calendar integrations.

## References

- `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` section 3e
- `vault://Daily Notes/2026-04-22` — this session
- PR #394 — Phase 4c.3c server-side guard + eyeball pulse (predecessor; established the rejection path this spec makes proactive)
- PR #392 — `tv_show_episodes` catalog (provides air_date data)
- PR #390 — TS-side unaired filter (defense-in-depth layer 1)
