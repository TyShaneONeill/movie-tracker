# PRD: In-App Feedback & Feature Request Channel

## Overview

Add an in-app form that lets users submit feature requests and general
feedback directly to a Supabase table, so we have a structured source
of user input instead of relying on store reviews.

Source: Testers Community feedback report (2026-05), additional
recommendations "User Feedback Mechanism" and "Feature Request
Tracker."

---

## Problem Statement

We currently get user feedback via:

- Play / App Store reviews (low signal, no follow-up channel).
- Tester reports like this one.
- Direct email to support.

There is no in-app channel for feature requests, and no way to spot
request duplicates or popularity. We need a lightweight, structured
channel that we own.

---

## Goals

### Primary Goals
1. Capture feature requests and general feedback with enough metadata
   to triage them.
2. Make submission a single screen with no friction.
3. Lay the foundation for an upvote / status-tracking UI later (not v1).

### Success Metrics
- > N submissions in first 30 days.
- > 50% of submissions categorisable into existing roadmap themes.

---

## Feature Requirements

### P0 - Must Have
- [ ] New route `app/settings/feedback.tsx` reachable from the Help
      Center (PRD-4).
- [ ] Form fields:
      - Type: "Feature request" | "General feedback" (radio).
      - Title (required, max 100 chars).
      - Description (required, max 1000 chars).
      - Optional screenshot (camera roll picker, single image).
- [ ] Server-side: `feature_requests` Supabase table with RLS.
- [ ] Submission posts as the authenticated user; guest users see a
      sign-in prompt.
- [ ] Success state with "Thanks - we read every one" copy.
- [ ] Rate limit: 5 submissions / user / 24h, enforced server-side.

### P1 - Should Have
- [ ] Email confirmation to the submitter (Supabase function trigger).
- [ ] Admin dashboard view (separate doc, not in this PRD).

### P2 - Nice to Have
- [ ] Upvote feature on a public-facing list of submitted requests.
- [ ] Status updates back to the user when an item ships.

### Out of Scope (v1)
- Public roadmap board.
- Comment threads on submissions.

---

## Technical Considerations

### Schema

```sql
CREATE TABLE feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('feature_request', 'feedback')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  app_version TEXT,
  platform TEXT,           -- 'ios' | 'android' | 'web'
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'planned', 'shipped', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_requests_user ON feature_requests(user_id);
CREATE INDEX idx_feature_requests_status ON feature_requests(status);
```

### RLS

- Authenticated users can `INSERT` their own rows.
- Authenticated users can `SELECT` only their own rows.
- Admin role can `SELECT` / `UPDATE` all rows.
- No `DELETE` from the client - cascade on user delete handles it.

### Rate limiting

Add a `before insert` trigger or a wrapping RPC that counts the user's
last-24h submissions and rejects if >= 5.

### Screenshot storage

Reuse the existing Supabase Storage bucket pattern used by ticket
scans (`avatars` / `tickets` already exist). New bucket
`feedback-screenshots` with signed URLs.

---

## Privacy & Security

- Submissions belong to the user and are deleted (`SET NULL`) on
  account deletion.
- Screenshot uploads warn the user not to include sensitive info before
  the picker opens.
- App version + platform auto-captured; no other device info.

---

## User Flow

1. Settings -> Help & Feedback -> Request a feature.
2. User picks type, fills title + description, optionally attaches
   screenshot.
3. Submit -> spinner -> success state.
4. Optional email confirmation.

---

## Open Questions

1. Do we expose the user's submissions back to them in-app
   ("My feedback")? Recommend yes in v1.1, no in v1.
2. Profanity / abuse filter? Recommend simple keyword filter + manual
   moderation; defer until volume justifies.

---

## Implementation Phases

### Sprint 1: Backend
- [ ] Migration for `feature_requests` table + RLS.
- [ ] Storage bucket + policies.
- [ ] Rate-limit RPC.

### Sprint 2: UI
- [ ] `app/settings/feedback.tsx` form.
- [ ] Hook into Help Center.
- [ ] Empty / error / success states.

### Sprint 3: Polish
- [ ] Email confirmation function.
- [ ] Analytics events.

---

*Last Updated: 2026-05-24*
*Status: Draft - needs Supabase schema review*
