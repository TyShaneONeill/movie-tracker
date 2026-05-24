# PRD: First-Launch Coachmark Tour

## Overview

Add an interactive, dismissible spotlight tour that runs once after a
user completes onboarding. The tour highlights the main features
(tracking, ticket scan, reviews, social/journey, profile) so new users
discover them without having to hunt.

Source: Testers Community feedback report (2026-05), item 1.

---

## Problem Statement

The app currently has a welcome flow at `app/(onboarding)/index.tsx`
and a genre setup at `app/(onboarding)/profile-setup.tsx`, but after
that the user lands in the tab shell with no guidance. Key
differentiators - ticket scanning, AI journey art, and the social layer -
are not surfaced.

The tester explicitly asked for: interactive tour, tooltips, and a
skip option.

---

## Goals

### Primary Goals
1. Show new users the 4-5 highest-value features within their first
   session.
2. Make the tour skippable at every step.
3. Make the tour replayable from Settings -> Help so existing users
   benefit too.
4. Version the tour so we can re-trigger it after major UI redesigns.

### Success Metrics
- Day-1 activation of ticket scanner > current baseline.
- Day-7 retention of users who completed onboarding +N%.
- Tour skip rate (measured, not optimised - just to confirm Skip works).

---

## Feature Requirements

### P0 - Must Have
- [ ] Tour engine: spotlight/cutout overlay + tooltip card with Next /
      Skip controls.
- [ ] Steps (initial set, all in the main tab shell):
      1. "Track what you watch" - tracking tab.
      2. "Scan a ticket" - ticket scan entry point.
      3. "Share your take" - reviews entry point.
      4. "Your journey, visualised" - AI journey art / profile.
      5. "Find friends" - social tab.
- [ ] Tour triggers once, after `profile-setup` finishes for the first
      time. Gated by AsyncStorage key
      `pocketstubs_tour_completed_v1`.
- [ ] Skip button on every step. Skipping also sets the completed flag.
- [ ] Replayable from Settings -> Help ("Replay tour") - covered by
      PRD-4.
- [ ] Tour does not block deep links / push-notification taps - if a
      deep link is pending, tour defers to next cold start.

### P1 - Should Have
- [ ] Light haptic on step transition.
- [ ] Localisation-ready strings (even if only en at launch).

### P2 - Nice to Have
- [ ] Per-feature "new feature" coachmarks reusing the same engine when
      we ship something later (e.g., flag a new tab item).

### Out of Scope
- A/B testing different tour copy.
- Animations beyond a simple fade between steps.
- Re-running the tour for upgraded existing users on first launch of
  this build. Reasoning: Settings -> Replay covers them and we avoid
  surprising people mid-session.

---

## Technical Considerations

### Library choice

Two viable options:

| Option | Pros | Cons |
|--------|------|------|
| `react-native-copilot` | Battle-tested, walkthrough API, supports custom UI | Some maintenance lag, may need patching for React 19 / Expo 54 |
| Custom (Modal + Animated cutout) | Zero deps, exact styling, future-proof | More code, need to handle keyboard / safe areas ourselves |

**Recommendation:** evaluate `react-native-copilot` against current
React / Expo. If it works clean, use it. If it fights React 19, write
the small custom version - the spotlight cutout is achievable with
`MaskedView` + `Animated`.

### Targeting elements

Each tour step needs a ref to the target component. Approach: a
lightweight `TourTarget` wrapper component that registers its layout
with a `TourProvider`. Tour engine reads positions and animates the
spotlight.

### Storage

```ts
// lib/onboarding/tour-state.ts
const TOUR_KEY = 'pocketstubs_tour_completed_v1';

export async function hasTourCompleted(): Promise<boolean> { ... }
export async function markTourCompleted(): Promise<void> { ... }
export async function resetTour(): Promise<void> { ... } // for replay
```

Key is versioned (`_v1`). Bump when adding/removing major steps so
active users get the refreshed tour.

---

## Privacy & Security

No new PII. Tour state is local-only (AsyncStorage). No need to sync
to Supabase - if a user reinstalls, replaying is fine.

---

## User Flow

### First-time happy path
1. User finishes signup + profile-setup.
2. Lands on home tab. Tour starts after ~500ms delay (let the screen
   settle).
3. Spotlight highlights the tracking tab with tooltip and "Next" /
   "Skip" buttons.
4. Tap Next through 5 steps; final step says "You're all set" with
   "Got it" CTA.
5. Flag set; tour will not run again.

### Skip path
1. Any step -> Skip -> tour dismisses, flag set.

### Replay path
1. Settings -> Help -> Replay tour -> resets flag, navigates to home,
   tour restarts.

---

## Open Questions

1. Should we offer a "don't show again" checkbox on the welcome step,
   or is Skip enough? Recommend Skip-only - the flag already prevents
   repeats.
2. Where exactly to anchor the social / journey step in the IA - which
   tab is canonical? Confirm with current shell.

---

## Implementation Phases

### Sprint 1: Engine
- [ ] Decide library vs. custom (1-day spike).
- [ ] Build `TourProvider`, `TourTarget`, `TourOverlay`.

### Sprint 2: Steps + integration
- [ ] Add `TourTarget` wrappers to the 5 target components.
- [ ] Wire trigger after profile-setup.
- [ ] Wire reset from Settings -> Help.

### Sprint 3: Polish + QA
- [ ] Safe-area + keyboard handling.
- [ ] Light + dark theme styling.
- [ ] Test on small phones (iPhone SE) and large foldables.

---

*Last Updated: 2026-05-24*
*Status: Draft - needs library choice (copilot vs custom)*
