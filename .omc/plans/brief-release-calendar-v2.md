# Brief: Release Calendar v2 — results first, docked week-strip calendar (Track A #1)

## Why
Ty's roadmap: the calendar currently sits on top and buries the day's releases. v2 inverts the hierarchy — releases own the screen; the calendar becomes a thumb-reachable docked bottom sheet. **Design source of truth: `.omc/plans/release-calendar-v2-mock.html`** (Variant B, locked by Ty 2026-07-09). Read it FIRST and match it — layout, dock states, chip row, dot semantics, spacing intent. It is an HTML mock, not pixel law: use real theme tokens, not its hex values.

## Working rules
- Own worktree `../cinetrak-release-calendar-v2`, branch `feature/release-calendar-v2` off origin/main; symlink node_modules (do NOT commit the symlink — check `git status` before commit).
- **DRAFT PR**; gate `npm run lint && npx tsc --noEmit && npm test` before push.
- No deploys, no OTA — human handles.

## Flag gating (house pattern)
- New PostHog flag **`release_calendar_v2`** — create hook `hooks/use-release-calendar-v2.ts` as a byte-pattern mirror of `hooks/use-stats-v2.ts` (1200ms resolve timeout → v1 fallback, `EXPO_PUBLIC_RELEASE_CALENDAR_V2_OVERRIDE` env override, same test shape).
- `app/release-calendar.tsx` branches exactly like `app/(tabs)/analytics.tsx:31-37`: flag OFF → current screen **byte-identical** (0-line diff when flag off — verify with `git diff` on extraction), flag ON → new `components/release-calendar-v2/` screen.
- ⚠️ Ty must create the flag in the PostHog dashboard before rollout (no API key on disk) — note it in the PR body.

## Current implementation (recon verified 2026-07-09)
- `app/release-calendar.tsx` (~460 lines): SafeAreaView → header (back / title / filter-sheet button, lines 194-218) → `CalendarGrid` on top (221-231) → divider → `ScrollView` + `ReleaseDayList` (237-248) → inline filter bottom-sheet (252+, NOT a Modal).
- Data hooks: `useReleaseCalendar({month, year})`, `useWatchlistIds`, `useCalendarFilters(user)` + exported `FILTER_CHIPS`, watchlist mutation with `requireAuth` guard (181-185), `watchlistOnlyEmpty` state (188).
- Calendar: `components/calendar/calendar-grid.tsx` — reuse its date/dot logic (datesWithReleases, watchlistDates, personalizedDates props) rather than reinventing; the v2 dock renders the same data in two densities.
- Taste scores already flow (`tasteScores` prop into ReleaseDayList) — the mock's "★ 92% taste match" line uses THIS existing data (`hooks/use-taste-profile.ts` — NOTE: that hook belongs to Release Calendar personalization, do not confuse with the newer `useTasteInsights`).

## Build spec (from the mock — B1/B2 states + Interaction spec section)
1. **Layout**: chips row (always-visible filter chips from `FILTER_CHIPS`, ⚙ keeps the existing full filter sheet) → results list (flex:1, day header "Fri · July 17 · 4 releases" with count) → docked calendar sheet.
2. **Dock = bottom sheet, two snap points**: week strip (default) ↔ full month grid (pull up). Drag handle, spring animation, `useReducedMotion` respected. Prefer the project's existing sheet/gesture primitives (grep for existing bottom-sheet usage before adding a dep — NO new native modules: this must ship OTA to 1.5.1/runtime 1.6.0 binaries; JS-only, capability rules apply).
3. **Navigation semantics**:
   - Week view: ‹ › = ±1 week; strip horizontal swipe pages by week; month label follows the week (boundary weeks show the month containing the selected/first day — pick one rule and unit-test it).
   - Expanded month: ‹ › = ±1 month (existing `handleMonthChange`).
   - Day tap (either state): select day, swap results; from expanded → snap back to week view centered on the tapped day.
   - Selected day always visible in the strip (auto-center).
4. **Data unchanged**: keep month-window fetching (`useReleaseCalendar({month, year})`); the week strip is a view over the loaded month; crossing a month boundary triggers the existing month load. No backend changes.
5. **Dot semantics kept**: brand dot = releases, gold dot = watchlist; selected day inverted (mock shows both states).
6. **Empty/edge states**: keep `watchlistOnlyEmpty` handling, loading skeletons per existing screen; a day with 0 releases shows the existing empty treatment with the count header reading "no releases".
7. **Theme**: light + dark first-class via existing theme tokens (`useTheme`/colors as the current screen does). Android-specific: no dashed-border tricks (RN renders solid), test edge-to-edge insets on the dock.

### Tests
- Flag branch (v1 untouched when off — mirror the stats_v2 gate tests).
- Week-arithmetic unit tests (pure lib): week paging across month boundaries incl. DST-agnostic date math, month-label rule, auto-center logic.
- Render tests: chip row states, day-header count, dock snap-state conditional rendering.

## Report back
Files changed, gate output (exact counts), draft PR URL, any deviations from the mock with reasoning, and what remains for emulator QA (QA itself is a separate pass — do not claim UI validated).
