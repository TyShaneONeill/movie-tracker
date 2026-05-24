# PRD: In-App Help Center

## Overview

Add a Help section accessible from Settings that gives users one place
to find FAQs, replay the onboarding tour, report a bug, request a
feature, and read the privacy policy / terms.

Source: Testers Community feedback report (2026-05), additional
recommendation "In-App Help Section."

---

## Problem Statement

Today users have to leave the app (or guess) when they need help. The
existing "Report a Bug" button is buried in Settings, and there is no
FAQ, no onboarding replay, and no way to suggest features.

---

## Goals

### Primary Goals
1. One discoverable Help surface from Settings.
2. Reduce duplicate support questions by answering the top ~10 FAQs
   in-app.
3. Centralise the bug-report and feature-request entry points so we
   stop adding loose buttons across the app.

### Success Metrics
- Help screen views > baseline within first month.
- Reduction in support emails that match existing FAQ topics.

---

## Feature Requirements

### P0 - Must Have
- [ ] New route `app/settings/help.tsx`.
- [ ] Linked from Settings root with a `Help & Feedback` row.
- [ ] FAQ accordion (typed constant in-repo for v1).
      Initial topics, seeded from `docs/TESTING_ISSUES.md` + tester
      report:
      - "How do I scan a ticket?"
      - "Where did my scan go?"
      - "Can I change the app theme?"
      - "How do I delete my account?"
      - "Why didn't my movie save?"
      - "How do reviews / ratings work?"
      - "How do I connect with friends?"
      - "What does premium include?"
      - "How do I export my data?"
      - "Reset password / change email?"
- [ ] "Replay onboarding tour" CTA (resets `pocketstubs_tour_completed_v1`
      and navigates to home) - depends on PRD-3.
- [ ] "Report a bug" CTA (move existing button here; keep the existing
      implementation).
- [ ] "Request a feature" CTA - opens the feature request form
      (depends on PRD-5).
- [ ] Links to Privacy Policy + Terms.

### P1 - Should Have
- [ ] Search across FAQ entries.
- [ ] "Was this helpful?" thumbs on each FAQ entry, telemetry-only.

### P2 - Nice to Have
- [ ] FAQ sourced from a Supabase table so we can update copy without
      a release.

### Out of Scope (v1)
- Live chat.
- AI-powered help bot.
- Multilingual FAQ.

---

## Technical Considerations

```ts
// lib/help/faq.ts
export type FaqEntry = {
  id: string;
  question: string;
  answer: string; // markdown-lite supported via existing renderer
  category: 'tickets' | 'tracking' | 'account' | 'social' | 'premium';
};

export const FAQ: FaqEntry[] = [ /* ... */ ];
```

Reuse whatever markdown / rich-text renderer the reviews feature
already uses to keep the bundle lean.

Navigation: `Settings -> Help & Feedback` should appear above
`Privacy` / `About` sections to keep the visual hierarchy logical.

---

## Privacy & Security

No new PII. Bug-report and feature-request submissions are governed
by their own PRDs.

---

## User Flow

1. Settings -> Help & Feedback.
2. Top: "Replay tour" + "Report a bug" + "Request a feature" CTAs.
3. Below: FAQ accordion.
4. Footer: Privacy Policy, Terms, app version.

---

## Open Questions

1. Should we surface a "Help" entry inside the onboarding tour itself?
   Recommend yes - last step says "Need help later? It's in Settings."
2. Final FAQ list - product owner pass needed.

---

## Implementation Phases

### Sprint 1
- [ ] Build `app/settings/help.tsx` + accordion component.
- [ ] Seed FAQ constant.
- [ ] Move "Report a Bug" button here.
- [ ] Wire "Replay tour" once PRD-3 lands.
- [ ] Wire "Request a feature" once PRD-5 lands.

---

*Last Updated: 2026-05-24*
*Status: Draft - Pending Review*
