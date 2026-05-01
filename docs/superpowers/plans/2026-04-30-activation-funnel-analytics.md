# Activation Funnel Analytics + Onboarding Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 3 missing PostHog events (`onboarding:complete`, `review:create`, `scan:bonus_granted`) to close cinetrak's activation funnel measurement loop, plus fix two adjacent onboarding bugs (Skip-button bypass, transient flash for completed users) that would corrupt the funnel data if shipped separately.

**Architecture:** Pure client-side instrumentation. Reuses existing `lib/analytics.ts` PostHog wrapper. Uses TanStack Query `onSuccess(_, variables)` for review event firing only on persisted data. `completeOnboarding()` is upgraded to return `Promise<boolean>` so the onboarding event fires only when the DB write actually succeeded. Onboarding flash bug is fixed via a synchronous `<Redirect>` guard in `(onboarding)/_layout.tsx` (defense-in-depth — sidesteps the requestAnimationFrame race in the root layout).

**Tech Stack:** TypeScript, React Native + Expo Router, TanStack Query v5, Jest + @testing-library/react-native, PostHog (`lib/analytics.ts`).

**Spec:** `docs/superpowers/specs/2026-04-30-activation-funnel-analytics-design.md`

---

## Pre-flight: Worktree Setup

Run from `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak`:

```bash
git fetch origin main
git worktree add ../cinetrak-activation-funnel origin/main -b feat/activation-funnel-analytics
cp /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak/.env.local /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel/.env.local
cd ../cinetrak-activation-funnel
cp /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak/docs/superpowers/specs/2026-04-30-activation-funnel-analytics-design.md docs/superpowers/specs/
cp /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak/docs/superpowers/plans/2026-04-30-activation-funnel-analytics.md docs/superpowers/plans/
git add docs/superpowers/
git commit -m "docs: add activation funnel analytics spec + plan"
```

The `.env.local` copy is required per `feedback_worktree_env_local` — anything that imports `lib/supabase` will break without it. After this, all subsequent task commands run from `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel`.

---

## File Map

| File | Type | Responsibility |
|---|---|---|
| `hooks/use-onboarding.tsx` | modify | `completeOnboarding()` returns `Promise<boolean>` for caller to gate side effects |
| `app/(onboarding)/profile-setup.tsx` | modify | Fire `onboarding:complete` + person property on successful persist |
| `hooks/use-review-actions.ts` | modify | Fire `review:create` on `createMutation.onSuccess` |
| `app/(tabs)/scanner.tsx` | modify | Fire `scan:bonus_granted` on rpc success; replace `console.error` with `captureException` |
| `app/(onboarding)/index.tsx` | modify | Remove Skip button (handler + JSX + styles) |
| `app/(onboarding)/_layout.tsx` | modify | Add Redirect guard for completed users |
| `__tests__/hooks/use-onboarding.test.ts` | create | Test new boolean return contract |
| `__tests__/hooks/use-review-actions.test.ts` | extend | Test `review:create` analytics firing |

---

## Task 1: `completeOnboarding()` returns `Promise<boolean>`

**Files:**
- Modify: `hooks/use-onboarding.tsx`
- Test: `__tests__/hooks/use-onboarding.test.ts` (create)

**Why:** `profile-setup.tsx` (Task 2) needs to gate analytics on actual DB persistence, not silent failure paths. The current API returns `void`, hiding success/failure from the caller.

- [ ] **Step 1.1: Write the failing test file**

Create `__tests__/hooks/use-onboarding.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: mockEq };
      },
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return { eq: () => ({ single: mockSingle }) };
      },
    })),
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

import { OnboardingProvider, useOnboarding } from '@/hooks/use-onboarding';
import { useAuth } from '@/hooks/use-auth';

const mockUseAuth = useAuth as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(OnboardingProvider, null, children);
}

describe('useOnboarding.completeOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
    mockSingle.mockResolvedValue({ data: { onboarding_completed: false }, error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('returns true on successful DB update', async () => {
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(true);
    expect(result.current.hasCompletedOnboarding).toBe(true);
  });

  it('returns false when supabase update returns an error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'db down' } });
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(false);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it('returns false when no user is signed in', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.completeOnboarding();
    });

    expect(success).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm failure**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npx jest __tests__/hooks/use-onboarding.test.ts`

Expected: FAIL — current `completeOnboarding` returns `void`, so `await result.current.completeOnboarding()` resolves to `undefined`, not `true` / `false`.

- [ ] **Step 1.3: Modify `hooks/use-onboarding.tsx`**

Update the interface (lines 6-11) and `completeOnboarding` (lines 58-77):

```typescript
interface OnboardingContextType {
  hasCompletedOnboarding: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<boolean>;
  resetOnboarding: () => Promise<void>;
}
```

```typescript
const completeOnboarding = useCallback(async (): Promise<boolean> => {
  if (!user?.id) return false;

  try {
    const { error } = await (supabase
      .from('profiles') as ReturnType<typeof supabase.from>)
      .update({ onboarding_completed: true } as Record<string, unknown>)
      .eq('id', user.id);

    if (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding-update' });
      return false;
    }

    setHasCompletedOnboarding(true);
    return true;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'complete-onboarding' });
    return false;
  }
}, [user?.id]);
```

- [ ] **Step 1.4: Run tests to confirm pass**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npx jest __tests__/hooks/use-onboarding.test.ts`

Expected: PASS — 3/3 tests green.

- [ ] **Step 1.5: Run typecheck across the project**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npx tsc --noEmit`

Expected: PASS. The only existing call site is `app/(onboarding)/profile-setup.tsx:127` (`await completeOnboarding();`) — that ignores the return value, which is still valid for a `Promise<boolean>`. No breakage. Task 2 will use the return value.

- [ ] **Step 1.6: Commit**

```bash
git add hooks/use-onboarding.tsx __tests__/hooks/use-onboarding.test.ts
git commit -m "refactor(onboarding): completeOnboarding returns Promise<boolean>"
```

---

## Task 2: `profile-setup.tsx` — fire `onboarding:complete` only on persisted success

**Files:**
- Modify: `app/(onboarding)/profile-setup.tsx`

**Depends on:** Task 1 (uses the new `Promise<boolean>` return type)

**Why:** Track event must reflect actual completion. `setPersonProperties({ onboarding_completed: true })` makes PostHog cohorts filterable.

- [ ] **Step 2.1: Add the analytics import**

In `app/(onboarding)/profile-setup.tsx`, after line 28 (`import { captureException } from '@/lib/sentry';`), add:

```typescript
import { analytics } from '@/lib/analytics';
```

- [ ] **Step 2.2: Replace the completion block**

In `handleComplete` (around line 122-128), find:

```typescript
      Toast.show({
        type: 'success',
        text1: 'Profile saved',
        visibilityTime: 2000,
      });
      await completeOnboarding();
      router.replace('/(tabs)');
```

Replace with:

```typescript
      const onboardingPersisted = await completeOnboarding();

      if (onboardingPersisted) {
        analytics.track('onboarding:complete', {
          has_avatar: !!avatarUrl,
          has_username: !!username.trim(),
        });
        analytics.setPersonProperties({ onboarding_completed: true });
      }

      Toast.show({
        type: 'success',
        text1: 'Profile saved',
        visibilityTime: 2000,
      });
      router.replace('/(tabs)');
```

Notes:
- Toast + `router.replace` still fire even if persistence failed — preserves existing UX (user moves on; on next launch the redirect logic re-routes them through onboarding again). The captureException already fires inside `completeOnboarding` so we have observability.
- Order moved: persist → analytics → toast → nav. This matters because analytics should fire at the moment of persisted truth, before any navigation defers.

- [ ] **Step 2.3: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add app/\(onboarding\)/profile-setup.tsx
git commit -m "feat(analytics): fire onboarding:complete on persisted profile setup"
```

---

## Task 3: `use-review-actions.ts` — fire `review:create` event

**Files:**
- Modify: `hooks/use-review-actions.ts`
- Test: `__tests__/hooks/use-review-actions.test.ts` (extend)

**Why:** Closes the activation-funnel review event gap. Properties (`media_type`, `has_text`, `rating`, `is_rewatch`, `visibility`) selected per spec for retention/conversion analysis.

- [ ] **Step 3.1: Add the failing test**

Append to `__tests__/hooks/use-review-actions.test.ts` (within the existing `describe('useReviewActions', ...)` block, after the existing tests):

```typescript
  it('fires analytics review:create event after createReview success', async () => {
    mockCreateReview.mockResolvedValue({
      id: 'rev-2',
      user_id: 'user-1',
      tmdb_id: 550,
      rating: 8,
      review_text: 'Solid',
      is_rewatch: false,
      visibility: 'public',
      media_type: 'movie',
    });

    const { result } = renderHook(() => useReviewActions(550, 'movie'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoadingReview).toBe(false));

    await act(async () => {
      await result.current.createReview({
        tmdbId: 550,
        rating: 8,
        reviewText: 'Solid',
        isRewatch: false,
        visibility: 'public',
      } as Parameters<typeof result.current.createReview>[0]);
    });

    expect(mockTrack).toHaveBeenCalledWith(
      'review:create',
      expect.objectContaining({ media_type: 'movie' }),
    );
  });
```

Also at the top of the file, add an `analytics` mock and the `act` import (find the existing imports / mocks). Add this mock alongside the existing ones:

```typescript
const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));
```

And update the line `import { renderHook, waitFor } from '@testing-library/react-native';` to also import `act`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react-native';
```

- [ ] **Step 3.2: Run test to confirm failure**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npx jest __tests__/hooks/use-review-actions.test.ts -t "fires analytics review:create"`

Expected: FAIL — `mockTrack` never called.

- [ ] **Step 3.3: Modify `hooks/use-review-actions.ts`**

Add the analytics import after line 11 (`import type { Review, ReviewVisibility } from '@/lib/database.types';`):

```typescript
import { analytics } from '@/lib/analytics';
```

In `createMutation` (around lines 43-57), update the `onSuccess` callback to receive `_data` and `variables`, and fire the event:

```typescript
  // Mutation to create a new review
  const createMutation = useMutation({
    mutationFn: async (data: CreateReviewData) => {
      if (!user) throw new Error('Not authenticated');
      return createReview(user.id, { ...data, mediaType: mediaType as 'movie' | 'tv_show' });
    },
    onSuccess: (_data, variables) => {
      analytics.track('review:create', {
        media_type: mediaType,
        has_text: !!variables.reviewText,
        rating: variables.rating ?? null,
        is_rewatch: !!variables.isRewatch,
        visibility: variables.visibility ?? 'public',
      });
      queryClient.invalidateQueries({ queryKey: ['review', user?.id, tmdbId, mediaType] });
      queryClient.invalidateQueries({ queryKey: ['movieReviews', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['friendsRatings', tmdbId] });
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
      queryClient.invalidateQueries({ queryKey: ['profileStats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['userReviews', user?.id] });
      triggerAchievementCheck();
    },
  });
```

Note: `variables` here is the typed `CreateReviewData` passed to `mutate()` — has `reviewText`, `rating`, `isRewatch`, `visibility` exactly as defined. Using `variables` (input) avoids any DB-shape ambiguity from `_data` (Review result).

- [ ] **Step 3.4: Run test to confirm pass**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npx jest __tests__/hooks/use-review-actions.test.ts`

Expected: all tests in the file PASS, including the new one.

- [ ] **Step 3.5: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add hooks/use-review-actions.ts __tests__/hooks/use-review-actions.test.ts
git commit -m "feat(analytics): fire review:create event on review creation"
```

---

## Task 4: `scanner.tsx` — fire `scan:bonus_granted` + replace `console.error` with `captureException`

**Files:**
- Modify: `app/(tabs)/scanner.tsx`

**Why:** Daily-note Tier 1 scope. The rewarded-ad bonus path is the highest-intent monetization signal in the scanner flow. The `console.error` swallow on rpcError is a production observability gap.

- [ ] **Step 4.1: Add the analytics import**

In `app/(tabs)/scanner.tsx`, after line 36 (`import { captureException } from '@/lib/sentry';`), add:

```typescript
import { analytics } from '@/lib/analytics';
```

- [ ] **Step 4.2: Update `handleAdReward`**

Find lines 257-269:

```typescript
  const handleAdReward = useCallback(async () => {
    if (!user) return;
    const { error: rpcError } = await supabase.rpc('increment_bonus_scans', {
      p_user_id: user.id,
    });
    if (rpcError) {
      console.error('Failed to increment bonus scans:', rpcError);
      return;
    }
    // Re-fetch scan status to update UI
    const status = await fetchScanStatus();
    setScansRemaining(status.scansRemaining);
  }, [user]);
```

Replace with:

```typescript
  const handleAdReward = useCallback(async () => {
    if (!user) return;
    const { error: rpcError } = await supabase.rpc('increment_bonus_scans', {
      p_user_id: user.id,
    });
    if (rpcError) {
      captureException(new Error(rpcError.message), { context: 'scanner-increment-bonus-scans' });
      return;
    }
    analytics.track('scan:bonus_granted');
    // Re-fetch scan status to update UI
    const status = await fetchScanStatus();
    setScansRemaining(status.scansRemaining);
  }, [user]);
```

- [ ] **Step 4.3: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add app/\(tabs\)/scanner.tsx
git commit -m "feat(analytics): fire scan:bonus_granted; replace console.error with captureException in handleAdReward"
```

---

## Task 5: `(onboarding)/index.tsx` — remove Skip button

**Files:**
- Modify: `app/(onboarding)/index.tsx`

**Why:** Skip lets users bypass onboarding entirely, breaking activation funnel measurement and degrading first-run UX. Removing it makes "Get Started" on the last slide the only path forward.

- [ ] **Step 5.1: Remove `handleSkip` function**

Delete lines 113-116:

```typescript
  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/(tabs)');
  };
```

- [ ] **Step 5.2: Remove the Skip button JSX**

Delete lines 147-154 (the entire `{/* Skip button */}` block plus the surrounding `<View style={styles.header}>`):

```tsx
      {/* Skip button */}
      <View style={styles.header}>
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <ThemedText style={[styles.skipText, { color: colors.textSecondary }]}>
            Skip
          </ThemedText>
        </Pressable>
      </View>
```

- [ ] **Step 5.3: Remove the unused styles**

Delete lines 225-237 (the `header`, `skipButton`, `skipText` style blocks):

```typescript
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  skipButton: {
    padding: Spacing.sm,
  },
  skipText: {
    ...Typography.body.base,
    fontWeight: '500',
  },
```

- [ ] **Step 5.4: Remove unused imports if any**

Check if `useOnboarding` and `router` are still used elsewhere in the file. After Skip removal:
- `useOnboarding` is still imported but no longer destructured — `completeOnboarding` was its only usage. Remove `const { completeOnboarding } = useOnboarding();` line (around line 78).
- Remove the import line: `import { useOnboarding } from '@/hooks/use-onboarding';` (around line 21).
- `router` is still used by `handleGetStarted` — keep the `router` import.

- [ ] **Step 5.5: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit`

Expected: PASS. ESLint may flag any remaining unused imports — fix any flagged.

- [ ] **Step 5.6: Commit**

```bash
git add app/\(onboarding\)/index.tsx
git commit -m "fix(onboarding): remove Skip button to enforce full onboarding flow"
```

---

## Task 6: `(onboarding)/_layout.tsx` — add Redirect guard for completed users

**Files:**
- Modify: `app/(onboarding)/_layout.tsx`

**Why:** Prevents the transient onboarding screen flash for authenticated users who have already completed onboarding. `<Redirect>` renders synchronously — no `requestAnimationFrame` deferral, no chance for `index.tsx` to mount.

- [ ] **Step 6.1: Replace the layout file**

Current content (full file, 10 lines):

```tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
```

Replace with:

```tsx
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';

export default function OnboardingLayout() {
  const { user } = useAuth();
  const { hasCompletedOnboarding, isLoading } = useOnboarding();

  // Root layout already shows a spinner while loading — render nothing here to avoid flash.
  if (isLoading) return null;

  // Authenticated user who has already completed onboarding should never see this group.
  if (user && hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
```

- [ ] **Step 6.2: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add app/\(onboarding\)/_layout.tsx
git commit -m "fix(onboarding): redirect completed users from onboarding layout to prevent flash"
```

---

## Task 7: Final verification

**Files:** None — verification only.

- [ ] **Step 7.1: Run full lint, typecheck, and test suite**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-activation-funnel && npm run lint && npx tsc --noEmit && npm test`

Expected: PASS — 915+ tests, all green. New tests added in Tasks 1 and 3 increment count by ~4.

- [ ] **Step 7.2: Manual device QA checklist (post-PR-merge)**

After PR merge + EAS update:
1. **Skip button absent**: Open onboarding (sign in as a fresh test user) → verify no Skip button appears in the upper-right
2. **No flash for completed user**: Sign in as a completed user → verify direct navigation to `(tabs)` without onboarding flash
3. **PostHog Live Events tab open** during a fresh signup flow → confirm events fire:
   - `onboarding:complete` (with `has_avatar`, `has_username` properties)
   - `review:create` (after creating a review for any movie)
   - `scan:bonus_granted` (after watching a rewarded ad on the scan-exhausted screen)
4. **Person property check**: In PostHog, find the test user's person profile → confirm `onboarding_completed: true` is set

- [ ] **Step 7.3: Open the PR**

```bash
git push -u origin feat/activation-funnel-analytics
gh pr create --title "feat(analytics): activation funnel events + onboarding bug fixes" --body "$(cat <<'EOF'
## Summary
- Fires 3 missing PostHog events: `onboarding:complete`, `review:create`, `scan:bonus_granted`
- Sets `onboarding_completed: true` person property at the moment of profile-setup completion
- `completeOnboarding()` now returns `Promise<boolean>` so callers can gate side effects on persistence success
- Removes "Skip" button from onboarding flow (enforces activation funnel integrity)
- Adds `<Redirect>` guard to `(onboarding)/_layout.tsx` to fix transient onboarding-screen flash for completed users

Closes the activation-funnel measurement loop per the 2026-04-30 strategic audit (Tier 1).

## Test plan
- [x] `__tests__/hooks/use-onboarding.test.ts` — new, 3 cases for `completeOnboarding()` boolean contract
- [x] `__tests__/hooks/use-review-actions.test.ts` — extended, asserts `analytics.track('review:create', ...)` fires
- [x] `npm run lint && npx tsc --noEmit && npm test` — all green
- [ ] Manual device QA — see checklist in `docs/superpowers/plans/2026-04-30-activation-funnel-analytics.md` Task 7.2
- [ ] PostHog Live Events — verify all 3 events fire on a fresh device run

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of Scope (from spec)

- `scan:success` event (adjacent gap, not in daily-note Tier 1)
- Identify-call enrichment with `onboarding_completed` (`setPersonProperties` covers it)
- Tier 2.2 TV new-episode push notifications (separate session)
- Tier 2.3 Widget to App Store (separate session — `@bacons/apple-targets` confirmed absent from main's `app.config.js`)
- Tier 3 premium gates on release calendar filters (separate session)
- Tier 5 sweep replacing other `console.error` calls with `captureException` (separate hygiene PR)
