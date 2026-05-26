# Roadmap: Testers Community Feedback (2026-05)

Derived from the Testers Community feedback report on Pocketstubs v1.3.0.
The report identified no crashes or critical bugs and proposed five UX
enhancements plus five "additional recommendations." This roadmap maps
those into engineering and non-engineering tracks and sequences them.

---

## Source

Testers Community Feedback Report, received 2026-05. Five core
opportunities flagged:

1. Dynamic walkthrough for new users
2. Optimized Play Store screenshots
3. ASO-friendly app description
4. Eye icon in password field
5. System theme option (light/dark/system)

Plus five additional recommendations: user feedback mechanism, social
media integration, in-app help section, regular update cadence,
in-app feature request tracker.

---

## Engineering PRDs

| ID | Title | Tier | Effort | PRD |
|----|-------|------|--------|-----|
| 1 | Password visibility toggle | Quick win | ~2h | [PRD-password-visibility-toggle.md](./PRD-password-visibility-toggle.md) |
| 2 | System theme option in Settings | Quick win | ~1h | [PRD-system-theme-option.md](./PRD-system-theme-option.md) |
| 3 | First-launch coachmark tour | Medium | 2-3d | [PRD-onboarding-coachmark-tour.md](./PRD-onboarding-coachmark-tour.md) |
| 4 | In-app Help Center | Medium | 1-2d | [PRD-in-app-help-center.md](./PRD-in-app-help-center.md) |
| 5 | Feedback & feature request channel | Medium | 2d | [PRD-feedback-and-feature-requests.md](./PRD-feedback-and-feature-requests.md) |
| 6 | Social media share for reviews & stubs | Larger | 3-4d | [PRD-social-share.md](./PRD-social-share.md) |

### Key findings from grounding the report in code

Two items from the tester report needed re-scoping after reading the
codebase:

- **System theme is already implemented in `lib/theme-context.tsx`** -
  it stores `'light' | 'dark' | 'system'` in AsyncStorage under
  `pocketstubs_theme_preference` and syncs to `profiles.theme_preference`
  in Supabase. The gap is purely UI: `app/settings/index.tsx:230-236`
  only exposes a binary Dark Mode switch. PRD-2 is just a UI surfacing
  task, not a backend change.
- **Onboarding already exists** at `app/(onboarding)/index.tsx` and
  `app/(onboarding)/profile-setup.tsx`. What the tester is requesting
  is an interactive coachmark/spotlight tour layered over the main app
  shell, not a welcome flow. PRD-3 covers that.

---

## Non-engineering tracks (out of scope for PRDs)

These are flagged here so they aren't dropped, but they belong to
design / marketing / ops, not engineering.

- **Play Store screenshots.** Recommend 6-8 framed screenshots covering
  tracking, ticket scan, AI journey art, social, reviews, and the new
  theme options. Tooling: Figma frames + `fastlane screengrab` for
  device capture once we have the polished build from PRD-1/PRD-2
  shipped.
- **ASO copy refresh.** Keyword research first (AppTweak / Sensor Tower
  / similar), then a long description rewrite emphasising movie
  tracking, ticket scanning, AI journey art, and the social layer. Pair
  this with the screenshot refresh as one App Store update.
- **Release cadence.** Document a recurring review cycle for ASO terms
  and changelog drafting in `docs/operations/`. Not blocking any PRD.

---

## Suggested sequencing

```
Week 1   PRD-1 + PRD-2                 ship as a "polish" patch release
Week 2   PRD-3                         coachmark tour
Week 3   PRD-4 + PRD-5                 help center + feedback channel
Week 4+  PRD-6, ASO + screenshot refresh in parallel
```

Week 1 should land on this branch (`claude/tester-feedback-review-SNvfD`)
as a single small PR. Subsequent PRDs each get their own branch off
`main` to keep review scope tight.

---

## Status tracking

| PRD | Status |
|-----|--------|
| 1   | Draft - ready to start |
| 2   | Draft - ready to start |
| 3   | Draft - needs library choice (copilot vs custom) |
| 4   | Draft |
| 5   | Draft - needs Supabase schema review |
| 6   | Sprint 1 complete - ready for Sprint 2 (mobile) |

---

*Last Updated: 2026-05-24*
*Status: Draft - Pending Review*
