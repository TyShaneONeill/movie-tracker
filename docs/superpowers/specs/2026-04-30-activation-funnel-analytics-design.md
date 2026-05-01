# Design Spec: Activation Funnel Analytics + Onboarding Bug Fixes

**Date**: 2026-04-30
**Status**: Ready for implementation
**Scope**: Single PR — 4 analytics events + 2 onboarding bug fixes
**Source**: 2026-04-30 daily note Tier 1 strategic audit + bug reports surfaced during brainstorming

---

## Why this PR

Per the 2026-04-30 strategic audit, the activation funnel is dark — no `onboarding:complete`, `review:create`, or `scan:bonus_granted` events fire today. Every subsequent retention or conversion decision (TV episode pushes, widget App Store, premium gates) is a guess until this lands. Two adjacent onboarding bugs (Skip button bypassing the flow, transient flash of onboarding screen for completed users) are folded in because they would corrupt the funnel data this PR is trying to capture if shipped separately.

Per `feedback_tagalong_fixes.md`, UX bugs adjacent to a marquee feature ship in the same PR.

---

## Scope Decisions (Q&A from brainstorming)

| Decision | Choice |
|---|---|
| Where does `analytics.identify()` fire? | **Already wired** at `app/_layout.tsx:159-177` via `useAnalyticsIdentity`. No work needed. |
| Person properties on `onboarding:complete`? | `setPersonProperties({ onboarding_completed: true })` only. No timestamp (event timestamp covers it). |
| `review:create` properties? | `{ media_type, has_text, rating, is_rewatch, visibility }` — `is_rewatch` for retention analysis, `visibility` for premium-pitch segmentation. |
| Test strategy? | Targeted TDD — assert event names fire on the correct code paths and assert bug-fix behaviors. Don't over-assert property values (brittle). |
| PR shape? | Single bundled PR. Bug fixes are constitutive of clean funnel data. |

---

## Files Touched

| # | File | Change |
|---|------|--------|
| 1 | `hooks/use-onboarding.tsx` | Change `completeOnboarding` return type from `Promise<void>` to `Promise<boolean>` — return `true` on DB-update success, `false` on captured error paths. Lets caller gate analytics on actual persistence. |
| 2 | `app/(onboarding)/profile-setup.tsx` | Replace `await completeOnboarding()` (line 127) with `const success = await completeOnboarding();`. If `success`: `analytics.track('onboarding:complete', { has_avatar: !!avatarUrl, has_username: !!username.trim() })` then `analytics.setPersonProperties({ onboarding_completed: true })`. Skip toast + nav if `!success` (existing behavior already silently swallows the DB error — keep parity, no regression). Import `analytics` from `@/lib/analytics`. |
| 3 | `hooks/use-review-actions.ts` | Import `analytics`. In `createMutation.onSuccess` use the `(_data, variables)` callback signature (TanStack Query passes original mutation args as `variables`): `analytics.track('review:create', { media_type: mediaType, has_text: !!variables.reviewText, rating: variables.rating ?? null, is_rewatch: !!variables.isRewatch, visibility: variables.visibility })`. Using `variables` (input) not `data` (Review result, may be snake_case from DB) avoids type-shape ambiguity. |
| 4 | `app/(tabs)/scanner.tsx` | Import `analytics`. In `handleAdReward` (line 257): on rpc success (after `setScansRemaining`), `analytics.track('scan:bonus_granted')`. On rpcError, replace `console.error` (line 263) with `captureException(new Error(rpcError.message), { context: 'scanner-increment-bonus-scans' })`. |
| 5 | `app/(onboarding)/index.tsx` | Remove `handleSkip` function (113-116), remove `<View style={styles.header}>...Skip Pressable...</View>` block (147-154), remove `header`, `skipButton`, `skipText` styles (225-237). |
| 6 | `app/(onboarding)/_layout.tsx` | Add `useAuth` + `useOnboarding` imports. In `OnboardingLayout`: if `isLoading` return `null` (root spinner shown by `_layout.tsx:201`); if `user && hasCompletedOnboarding` return `<Redirect href="/(tabs)" />`. Otherwise render existing `<Stack>`. |

---

## Event Taxonomy Added

| Event | Properties | Where |
|---|---|---|
| `onboarding:complete` | `has_avatar: boolean`, `has_username: boolean` | `profile-setup.tsx` |
| `review:create` | `media_type: 'movie' \| 'tv_show'`, `has_text: boolean`, `rating: number \| null`, `is_rewatch: boolean`, `visibility: 'public' \| 'friends' \| 'private'` | `use-review-actions.ts` |
| `scan:bonus_granted` | (none) | `scanner.tsx` |

Person property added at `onboarding:complete` moment: `onboarding_completed: true`.

---

## Bug Fix #1: Remove Skip Button

**Reason**: Skip lets users bypass onboarding entirely, breaking the activation funnel measurement. With Skip removed, `onboarding:complete` reflects actual completion.

**Acceptance**: After removal, the only path off `(onboarding)/index.tsx` is the "Get Started" button on the last slide → `(onboarding)/profile-setup.tsx`.

---

## Bug Fix #2: Onboarding Flash Redirect Guard

**Symptom**: Authenticated users who have completed onboarding sometimes see the first onboarding screen for a single frame before being redirected to `(tabs)`.

**Root cause**: `(onboarding)/_layout.tsx` has no auth/completion guards. The root `_layout.tsx:107-113` defers all navigation by one `requestAnimationFrame`, so a completed user transiently routed into `(onboarding)` renders the index screen for ~16ms before the redirect-back-to-tabs effect fires. The conditional at `_layout.tsx:149` (`!hasCompletedOnboarding`) also treats the loading-state value `null` as truthy, opening a window for spurious redirects-into-onboarding.

**Fix**: Defense-in-depth at the layout level.

```tsx
// app/(onboarding)/_layout.tsx
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';

export default function OnboardingLayout() {
  const { user } = useAuth();
  const { hasCompletedOnboarding, isLoading } = useOnboarding();

  if (isLoading) return null;
  if (user && hasCompletedOnboarding) return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
```

`<Redirect>` renders synchronously — no `rAF` delay, no chance for index.tsx to mount.

---

## Error Handling

- All `analytics.track`, `analytics.setPersonProperties` calls are no-op safe (PostHog client init can fail silently per `lib/analytics.ts:30, 44`).
- `captureException` replaces `console.error` for the `increment_bonus_scans` rpcError path — production observability win, no behavior change for the user (function still returns early).
- Redirect guard returns `null` while loading — the root layout `_layout.tsx:201-204` already shows a spinner during this window, so users see no double-spinner or blank flicker.

---

## Test Plan (Approach B — targeted TDD, matching existing cinetrak `__tests__/` conventions)

Existing convention in `__tests__/`: hook-level tests (`__tests__/hooks/`) and lib-level tests (`__tests__/lib/`). No `__tests__/app/` precedent — screen-level tests are not the pattern. Plan adjusted accordingly.

| Test File | Coverage |
|---|---|
| `__tests__/hooks/use-review-actions.test.ts` **(extend existing)** | Mock `lib/analytics` + review-service. Fire `createReview` mutation. Assert `analytics.track('review:create', expect.objectContaining({ media_type: 'movie' }))` called once. Don't assert exhaustive property values. |
| `__tests__/hooks/use-onboarding.test.ts` **(new — hook lacks tests today)** | Mock supabase. Test: (a) `completeOnboarding()` returns `true` on DB success and sets `hasCompletedOnboarding=true`; (b) returns `false` when supabase update returns an error; (c) returns `false` when `!user?.id`. Covers the new return-type contract that profile-setup depends on. |
| `__tests__/lib/scanner-bonus-analytics.test.ts` **(new — lift `handleAdReward` analytics into a small testable helper if needed, OR extract test target)** | If `handleAdReward` stays inline in `scanner.tsx`, this test is omitted. Otherwise: assert `analytics.track('scan:bonus_granted')` fires on rpc success and `captureException` fires on rpcError with correct context. **Decision deferred to implementation**: keep helper inline if test gymnastics aren't worth it; rely on PostHog Live Events + Sentry verification post-deploy. |

For the screen-level changes that have no precedent for unit tests in cinetrak, rely on:
- **Manual PostHog Live Events verification** post-deploy for `onboarding:complete`, `scan:bonus_granted`
- **Manual device QA** for: Skip button absent on `(onboarding)/index.tsx`, Redirect guard fires for completed users (sign in as a completed user → no flash)
- **TypeScript type-checking** catches the `completeOnboarding()` return-type contract change at compile time across all callers

Pre-PR check: `npm run lint && npx tsc --noEmit && npm test` all green. PostHog Live Events tab open during device QA.

---

## Implementation Sequencing (subagent-driven-development)

Six tasks. Tasks 1 → 2 are sequential (profile-setup depends on the new boolean return type). Tasks 3, 4, 5, 6 are independent and parallelizable with each other.

| # | Task | Depends on |
|---|------|-----------|
| 1 | `use-onboarding.tsx`: change `completeOnboarding` to return `Promise<boolean>` + new `__tests__/hooks/use-onboarding.test.ts` | — |
| 2 | `profile-setup.tsx`: gate analytics + setPersonProperties on `success === true` | 1 |
| 3 | `use-review-actions.ts`: add `analytics.track('review:create', ...)` + extend test | — |
| 4 | `scanner.tsx`: add `analytics.track('scan:bonus_granted')` + replace `console.error` with `captureException` | — |
| 5 | `(onboarding)/index.tsx`: remove Skip button (handler + JSX + styles) | — |
| 6 | `(onboarding)/_layout.tsx`: add Redirect guard | — |

Subagent dispatch: tasks 3, 4, 5, 6 run in parallel after task 1 completes. Task 2 runs once task 1 lands. Final foreground pass: lint + tsc + jest, then opus full-diff review, device QA, PR.

---

## Out of Scope (deliberately deferred)

- `scan:success` event — adjacent gap noted during recon, not in daily note Tier 1
- Identify-call enrichment with `onboarding_completed` — `setPersonProperties` covers it cleanly without complicating `useAnalyticsIdentity`
- Tier 2.2 TV new-episode push notifications — separate session
- Tier 2.3 Widget to App Store — confirmed `@bacons/apple-targets` absent from `app.config.js` on origin/main; bigger work, separate session
- Tier 3 premium gates on release calendar filters — separate session
- Tier 5 console.error → captureException sweep across other files — separate hygiene PR

---

## State to verify before merging

- `git log --oneline origin/main` — parent commit `cb2c230` (PR #414)
- `npm run lint && npx tsc --noEmit && npm test` — all green, 915+ tests
- PostHog Live Events tab — verify all 3 new events fire on a manual device run
- iOS device check: Skip button absent on onboarding slide 1; sign in as completed user → no flash before tabs

---

*[[Daily Notes/2026-04-30]] · Tier 1 of activation funnel analytics roadmap*
