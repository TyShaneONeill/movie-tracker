# Ticket Scan v2 — PR 4 Brief: Journey Card (display)

**Goal:** dark-only v2 re-skin of the **Journey Card** (the surface the v2 scan flow lands on at `/journey/movie/[tmdbId]`), behind `ticket_scan_v2`. **Display only** — Edit Journey + CompanionPicker are PR 5. **JS-only → OTA-able (NO migration).** Flag-OFF must render the existing v1 journey card byte-identical.

This is a **port/re-skin of existing, working v1 components** — not greenfield. Recreate the Claude Design look on `ScanV2Colors`/`s()`/`ScanText`, reusing the v1 data layer untouched.

Sources: design recon (`scan-screens3.jsx` `JourneyTicket`/`ScreenJourney` 31–200, `scan-art.jsx` `Avatar`/`AvatarStack` 284–328) + codebase recon (file:line refs below).

## Scope (files)
- **NEW** `components/scan-v2/journey-card.tsx` — the v2 `JourneyTicket` (front + back faces, crossfade flip).
- **NEW** `components/scan-v2/journey-screen.tsx` — v2 `ScreenJourney`: header (`JOURNEY X OF Y` + title + back), the card carousel (mirror v1's horizontal FlatList of journeys), the **Original↔AI** segmented toggle, and a v2-styled "Log another viewing" trailing card.
- **NEW** `components/scan-v2/avatar-stack.tsx` — overlapping avatars (`max 3` + `+N`), wrapping the global `<Avatar>`.
- **MODIFY** `app/journey/movie/[tmdbId].tsx` — when the `ticket_scan_v2` flag resolves true, render `<JourneyScreenV2>`; else the existing v1 `JourneyCarouselScreen` UNCHANGED. (Same flag hook as the rest of v2.)
- Reuse `components/ui/avatar.tsx` `<Avatar userId size .../>` (full photo→initial→DiceBear chain; verify it reads on the dark surface). No new barcode lib.

## The card (front) — from design spec
Flex poster (`flex:1`, min `s(270)`, max `s(580)`, top radius `s(22)`) with glass overlay buttons (flip top-left, edit/pencil top-right, both `s(36)` circles) + a `THEATRICAL RUN` status tag bottom-right (rose, mono — keep theater-hardcoded, do NOT generalize). Then the **perforation seam** (dashed line + two bg-colored notch circles straddling it). Then the **stub** (content-sized, `tk.card` bg / AI gradient): header row = title (`display s(23)` 800) + italic rating (`accent`, `{rating.toFixed(1)} / 10`, only if rating != null); then a **2-page carousel** — page 0 = details grid (`StubField`s, 2-col, only-populated, reflow), page 1 = "Your First Take" note (+ a rating bar) — with page dots/chevrons when a take exists. `StubField` order: Date · Cinema · Seat·Aud · Format · **With** (AvatarStack node, else text) · Paid. Empty fields drop out (never render blank).

## The card (back) — flip
Crossfade (key the inner view on `flipped` → re-mount fade; NO 3D transform). Emerald "Verified theater visit" pill + decorative barcode (`Icon`-style vertical bars, `height s(82)`) + **real confirmation code** (mono, `s(12)`, letterSpacing 3) from `user_movies.ticket_id` (fallback `CNTK-…`) + footer (title + `THEATER · DATE`).

## ScreenJourney wrapper
Header: back btn + centered `JOURNEY {index} OF {total}` (mono accent) / title. Body: the card, then the **Original / AI Art** segmented toggle (only when `!flipped`) — Original (cardHi when active) / AI Art (accent + sparkle when active). Reuse the v1 toggle logic.

## Data — REUSE v1 layer (no new reads/writes for display)
- READ: `useJourneysByMovie(tmdbId)` (`hooks/use-journey.ts`) → `user_movies` rows (`status='watched'`, ordered `journey_number`) + the `first_takes` join. `useJourney(id)` for one.
- **Field mapping** (`user_movies` → card): Date ← `watched_at`; Cinema ← `location_name`/`theater_chain`; Seat ← `seat_location` (+ `auditorium`); Format ← `watch_format`; **With** ← `watched_with: string[]` (names) → AvatarStack via `<Avatar>` (+ name→avatar from mutual-follows, as v1's edit screen does `edit/[id].tsx:159-166`); Paid ← `ticket_price`; note ← joined `first_takes.quote_text`; rating ← `first_takes.rating` (`numeric(3,1)` 1–10 nullable); conf ← `ticket_id`.
- **Original↔AI toggle WRITE:** reuse v1 `handleTogglePoster` pattern (`[tmdbId].tsx:592`) → `updateJourney(journeyId, { display_poster })` (optimistic via `useJourneyMutations`). Poster choice: `display_poster==='ai_generated' && ai_poster_url` → AI art, else original/TMDB; no AI poster → show the AI-generation button (reuse v1).
- **Edit pencil → routes to the EXISTING v1 `/journey/edit/[id]`** for now (PR 5 replaces with the v2 EditSheet). Don't build edit in PR 4.
- The unused `get_journey_*` RPCs: do NOT wire to them (v1 reads via `select *`).

## Decisions (defaults; veto)
1. **Decorative barcode** + real `ticket_id` code. (Real scannable barcode = new lib, no use case — defer.)
2. **Edit pencil → existing v1 edit route** (PR 5 swaps it).
3. **AvatarStack uses the global `<Avatar>`** (photo→initial→DiceBear). If it renders light-on-dark, pass explicit dark styling.
4. Keep `THEATRICAL RUN` / theater wording hard-coded (no `watch_context` generalization — README).

## Parallel-component rule / flag-off
New `components/scan-v2/journey-*.tsx` only. Do NOT modify the v1 `components/journey/*` / `app/journey/movie/[tmdbId].tsx` render path except the single flag branch that picks v1 vs v2. Flag-off → zero v2 render, v1 byte-identical.

## Proof-of-work gate
- `npx tsc --noEmit` clean · `npm run lint` 0 errors · `npm test` (full, `--testPathIgnorePatterns '/.worktrees/'`).
- **Flag-off byte-identical** (v1 journey card render unchanged).
- **Device QA via OTA** (JS-only): the v2 card renders for a real journey (after a scan, or any watched movie), front/back flip, Original↔AI toggle persists, details/first-take carousel + dots, AvatarStack for a multi-companion journey, multi-journey carousel (X of Y), no black-bar / dark-on-dark regressions. Emulator harness if a seeded journey is hard to reach.

## Out of scope → PR 5
Edit Journey sheet, CompanionPicker, "Add photos" upload, real scannable barcode. (Edit pencil routes to v1 edit until then.)
