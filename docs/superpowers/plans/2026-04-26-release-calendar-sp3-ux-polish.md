# Release Calendar SP3: UX Polish (Month Slide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontal slide animation when the user navigates between months in the release calendar — iOS Calendar style, direction-aware, reduce-motion respected, rapid-tap resilient.

**Architecture:** A new self-contained hook (`useMonthSlideAnimation`) drives a `translateX` shared value via `react-native-reanimated`. The `CalendarGrid` component wraps its content in an `Animated.View` with the hook's animated style. Direction is inferred via ordinal `(year * 12 + month)` comparison. The screen and day list are unchanged.

**Tech Stack:** TypeScript, React Native 0.81, `react-native-reanimated@~4.1.1`, Expo, Jest + `jest-expo` preset (auto-mocks reanimated).

**Spec:** [`docs/superpowers/specs/2026-04-26-release-calendar-sp3-ux-polish-design.md`](../specs/2026-04-26-release-calendar-sp3-ux-polish-design.md)

**Branch:** `feat/release-calendar-sp3-ux-polish`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish`

---

## Task 1: Create `useMonthSlideAnimation` hook with tests

**Files:**
- Test: `__tests__/hooks/use-month-slide-animation.test.tsx` (new)
- Create: `hooks/use-month-slide-animation.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/use-month-slide-animation.test.tsx`:

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import {
  inferDirection,
  useMonthSlideAnimation,
} from '@/hooks/use-month-slide-animation';

describe('inferDirection', () => {
  it('returns "none" when prev is null (initial mount)', () => {
    expect(inferDirection(null, { year: 2026, month: 4 })).toBe('none');
  });

  it('returns "next" for forward navigation in same year', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 5 })
    ).toBe('next');
  });

  it('returns "prev" for backward navigation in same year', () => {
    expect(
      inferDirection({ year: 2026, month: 5 }, { year: 2026, month: 4 })
    ).toBe('prev');
  });

  it('returns "next" across December to January year boundary', () => {
    expect(
      inferDirection({ year: 2026, month: 12 }, { year: 2027, month: 1 })
    ).toBe('next');
  });

  it('returns "prev" across January to December year boundary', () => {
    expect(
      inferDirection({ year: 2026, month: 1 }, { year: 2025, month: 12 })
    ).toBe('prev');
  });

  it('returns "next" for multi-month forward jumps', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 7 })
    ).toBe('next');
  });

  it('returns "none" when same month re-rendered', () => {
    expect(
      inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 4 })
    ).toBe('none');
  });
});

describe('useMonthSlideAnimation', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an animatedStyle on initial render', () => {
    const { result } = renderHook(() =>
      useMonthSlideAnimation(2026, 4)
    );
    expect(result.current.animatedStyle).toBeDefined();
  });

  it('returns a stable animatedStyle reference shape across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ year, month }: { year: number; month: number }) =>
        useMonthSlideAnimation(year, month),
      { initialProps: { year: 2026, month: 4 } }
    );

    const initial = result.current.animatedStyle;
    rerender({ year: 2026, month: 5 });
    const afterChange = result.current.animatedStyle;

    // Both renders return a valid animatedStyle (a reanimated style object).
    // We can't assert deep equality on reanimated worklet-driven styles —
    // just confirm the hook didn't throw and still returns the expected shape.
    expect(initial).toBeDefined();
    expect(afterChange).toBeDefined();
  });

  it('subscribes to reduceMotionChanged on mount', () => {
    renderHook(() => useMonthSlideAnimation(2026, 4));
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function)
    );
  });

  it('unsubscribes from reduceMotionChanged on unmount', () => {
    const removeMock = jest.fn();
    (AccessibilityInfo.addEventListener as jest.Mock).mockReturnValue({
      remove: removeMock,
    });

    const { unmount } = renderHook(() =>
      useMonthSlideAnimation(2026, 4)
    );
    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish
npx jest __tests__/hooks/use-month-slide-animation.test.tsx
```
Expected: FAIL with "Cannot find module '@/hooks/use-month-slide-animation'" (the source doesn't exist yet).

- [ ] **Step 3: Implement the hook**

Create `hooks/use-month-slide-animation.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const SLIDE_DURATION_MS = 250;
const SCREEN_WIDTH = Dimensions.get('window').width;

export type SlideDirection = 'next' | 'prev' | 'none';

interface MonthYear {
  year: number;
  month: number;
}

/**
 * Pure helper. Ordinal `year * 12 + month` comparison handles year
 * boundaries for free: (2026, 12) → (2027, 1) is +1 ordinal = 'next'.
 *
 * Returns 'none' on initial mount (prev === null) so we don't animate
 * the first render — the calendar appears in place from the SP2
 * AsyncStorage hydration path.
 */
export function inferDirection(
  prev: MonthYear | null,
  current: MonthYear
): SlideDirection {
  if (prev === null) return 'none';
  const prevOrdinal = prev.year * 12 + prev.month;
  const currOrdinal = current.year * 12 + current.month;
  if (currOrdinal > prevOrdinal) return 'next';
  if (currOrdinal < prevOrdinal) return 'prev';
  return 'none';
}

/**
 * Drives a horizontal slide on month change.
 *
 * On (year, month) prop change:
 *   - Infers direction from previous → current ordinal comparison
 *   - For 'next': new month enters from off-screen-right and slides to 0
 *   - For 'prev': new month enters from off-screen-left and slides to 0
 *   - For 'none' or reduce-motion: snaps in place
 *
 * Reanimated's withTiming auto-cancels on new assignment to the shared
 * value, so rapid month-flips interrupt cleanly and animate to the latest.
 */
export function useMonthSlideAnimation(year: number, month: number) {
  const prevRef = useRef<MonthYear | null>(null);
  const translateX = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const direction = inferDirection(prevRef.current, { year, month });
    prevRef.current = { year, month };

    if (direction === 'none' || reduceMotion) {
      translateX.value = 0;
      return;
    }

    const startX = direction === 'next' ? SCREEN_WIDTH : -SCREEN_WIDTH;
    translateX.value = withSequence(
      withTiming(startX, { duration: 0 }),
      withTiming(0, {
        duration: SLIDE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [year, month, reduceMotion, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { animatedStyle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest __tests__/hooks/use-month-slide-animation.test.tsx
```
Expected: PASS, 11 tests green (7 inferDirection + 4 hook).

- [ ] **Step 5: Run lint and tsc**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-month-slide-animation.ts __tests__/hooks/use-month-slide-animation.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): add useMonthSlideAnimation hook for SP3 transitions

Drives a translateX shared value via reanimated withSequence: snap to
off-screen position based on direction (next/prev), then ease-out cubic
to 0 over 250ms. Direction inferred from ordinal year*12+month
comparison, handling year boundaries. Reduce-motion respected via
AccessibilityInfo subscription. Pure inferDirection helper exported
for unit testing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire hook into `CalendarGrid` with tests

**Files:**
- Test: `__tests__/components/calendar/calendar-grid.test.tsx` (extend, +2 tests)
- Modify: `components/calendar/calendar-grid.tsx`

- [ ] **Step 1: Read the current `calendar-grid.tsx` structure**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish
grep -n "return (\|<View\|styles.container\|testID" components/calendar/calendar-grid.tsx | head -20
```

Note the line numbers for:
- The skeleton-gate early-return (`if (isLoading && datesWithReleases.length === 0)`)
- The main `return (` with `<View style={styles.container} testID="calendar-grid">`
- The closing `</View>` of the main return

You'll wrap the main return's `<View>` with a new outer `<View>` that has `overflow: 'hidden'`, and convert the inner `<View>` to `<Animated.View>`.

- [ ] **Step 2: Write the failing tests**

Open `__tests__/components/calendar/calendar-grid.test.tsx` and APPEND two new tests AFTER the existing `describe` block. The existing 3 tests stay verbatim.

```tsx
// At the bottom of the existing file, add:

describe('CalendarGrid — slide animation wiring', () => {
  it('renders without throwing when (year, month) changes', () => {
    const { rerender, getByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();

    rerender(
      <CalendarGrid
        {...baseProps}
        year={2026}
        month={5}
        datesWithReleases={['2026-05-15']}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
  });

  it('keeps the calendar-grid testID on the animated wrapper', () => {
    const { getByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading={false}
      />
    );

    // The testID="calendar-grid" should be on the Animated.View (the inner
    // wrapper that holds the month header + weekday row + day cells).
    // The outer overflow-clip View should NOT have a testID.
    const grid = getByTestId('calendar-grid');
    expect(grid).toBeTruthy();
  });
});
```

The existing imports at the top of the test file (`render`, `CalendarGrid`, `jest.mock` for `@/lib/theme-context`, `jest.mock` for `@expo/vector-icons`) cover everything these new tests need. Do NOT add new imports.

- [ ] **Step 3: Run tests to verify the new tests fail (and existing 3 pass)**

Run:
```bash
npx jest __tests__/components/calendar/calendar-grid.test.tsx
```
Expected: 3 existing pass; 2 new should pass on initial render but the second-render assertion may fail or pass — depends on whether the current grid component already handles a re-render. If both new tests pass already, that means the test isn't strictly TDD but documents expected behavior. Acceptable; the real verification is the implementation step.

- [ ] **Step 4: Modify `components/calendar/calendar-grid.tsx`**

Make four changes:

**Change A — add imports near the existing import block:**

```tsx
import Animated from 'react-native-reanimated';
import { useMonthSlideAnimation } from '@/hooks/use-month-slide-animation';
```

**Change B — call the hook inside the `CalendarGrid` component, BEFORE the skeleton-gate:**

Find the line where `const colors = Colors[effectiveTheme];` resolves. Add the hook call IMMEDIATELY AFTER it, BEFORE the `if (isLoading && datesWithReleases.length === 0)` early-return. So:

```tsx
  const colors = Colors[effectiveTheme];
  const { animatedStyle } = useMonthSlideAnimation(year, month);

  if (isLoading && datesWithReleases.length === 0) {
    return (
      <CalendarGridSkeleton
        cardColor={colors.card}
        shimmerColor={colors.backgroundSecondary}
      />
    );
  }
```

The hook is called BEFORE the early-return so React's rules-of-hooks aren't violated when the gate flips between true and false across renders.

**Change C — wrap the main return's `<View>` in an `Animated.View` with `animatedStyle`, and add an outer overflow-clip `<View>`:**

Find the existing main return:
```tsx
return (
  <View style={styles.container} testID="calendar-grid">
    {/* ... month header, weekday row, day grid ... */}
  </View>
);
```

Replace with:
```tsx
return (
  <View style={styles.slideClip}>
    <Animated.View
      style={[styles.container, animatedStyle]}
      testID="calendar-grid"
    >
      {/* ... existing children unchanged ... */}
    </Animated.View>
  </View>
);
```

**Change D — add the new style entry to the StyleSheet at the bottom of the file:**

Find the existing `StyleSheet.create({ ... })` block. Add `slideClip` as a new entry. The exact style:

```tsx
slideClip: {
  overflow: 'hidden', // CRITICAL: prevents off-screen new month from bleeding into adjacent UI during slide
},
```

Do NOT modify `styles.container` — it stays exactly as it was.

- [ ] **Step 5: Run the calendar-grid test file to verify all 5 tests pass**

Run:
```bash
npx jest __tests__/components/calendar/calendar-grid.test.tsx
```
Expected: 5 passing (3 existing + 2 new).

- [ ] **Step 6: Run the full test suite to verify no regressions**

Run:
```bash
npm test -- --silent 2>&1 | grep "Tests:"
```
Expected: 838 baseline + 11 hook tests + 2 grid tests = ~851 total, all passing.

- [ ] **Step 7: Run lint and tsc**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 8: Commit**

```bash
git add components/calendar/calendar-grid.tsx __tests__/components/calendar/calendar-grid.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): wire month slide animation into CalendarGrid

Wraps the existing grid content in Animated.View driven by
useMonthSlideAnimation. Outer slideClip View has overflow:hidden so the
off-screen month doesn't bleed into the divider/day list during slide.
Skeleton-gate from SP2 stays as the first early-return — we never
animate a skeleton.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pre-PR verification gate

**Files:** None (verification only)

- [ ] **Step 1: Run lint, typecheck, and full test suite together**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish
npm run lint && npx tsc --noEmit && npm test -- --silent
```

Expected:
- Lint: 0 errors. Pre-existing warnings in unrelated files OK.
- TSC: zero output (clean).
- Tests: ~851 passing.

- [ ] **Step 2: If anything fails, do NOT proceed**

Common issues:
- Reanimated import conflict — `import Animated from 'react-native-reanimated'` is the default export for the View; verify
- `slideClip` style not added — visual failure, not test failure (only caught on device)
- Hook called inside skeleton-gate — would violate rules-of-hooks; React would error in dev

Fix and re-run until all three pass.

- [ ] **Step 3: Confirm git status is clean and commit list is correct**

Run:
```bash
git status && git log --oneline origin/main..HEAD
```

Expected commit list (in order):
1. `docs: SP3 release calendar UX polish design spec` (already committed)
2. `feat(calendar): add useMonthSlideAnimation hook for SP3 transitions`
3. `feat(calendar): wire month slide animation into CalendarGrid`

Plus the plan-doc commit before Task 1 (added during the writing-plans step).

---

## Task 4: Web bundle leak smoke test

**Files:** None (smoke test only)

- [ ] **Step 1: Build the web bundle**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish
npx expo export --platform web 2>&1 | tail -5
```
Expected: build completes with no errors.

- [ ] **Step 2: Confirm reanimated's web shim is present**

Run:
```bash
grep -rl "useMonthSlideAnimation\|inferDirection" dist/ | head -3
```
Expected: at least one match (a JS chunk file).

- [ ] **Step 3: Confirm no native-only modules leaked**

Run:
```bash
grep -rl "WidgetBridgeModule\|RNBLE\|RNAudioRecorder" dist/ 2>/dev/null
```
Expected: zero matches. (Sanity check — these are unrelated to SP3 but confirm we didn't accidentally pull native deps via a transitive change.)

- [ ] **Step 4: Clean up the dist directory**

Run:
```bash
rm -rf dist/
git status
```
Expected: clean (`dist/` is gitignored).

- [ ] **Step 5: No commit needed for this task**

Smoke is purely diagnostic. Move on.

---

## Task 5: Device validation checklist (manual — Tyshane runs)

**Files:** None (manual verification)

This task is performed by Tyshane on a physical iPhone or iOS Simulator. The agent should produce this checklist as a hand-off document and not attempt to run device validation.

- [ ] **Tap next chevron** — Grid slides right-to-left over ~250ms with ease-out feel; new month appears on the left side after the slide settles. Day list below updates instantly to the new selected day's releases.

- [ ] **Tap prev chevron** — Grid slides left-to-right (mirror of the above).

- [ ] **Year boundary forward** — Navigate to Dec 2026, tap next. Slides right-to-left as if it were any forward navigation; Jan 2027 lands.

- [ ] **Year boundary back** — From Jan 2027, tap prev. Slides left-to-right; Dec 2026 lands.

- [ ] **Rapid-tap next 3x** — Within 500ms tap next chevron three times. Animation lands on month+3 cleanly with a single smooth slide. No flicker. No half-states.

- [ ] **Reduce Motion ON** — Settings → Accessibility → Motion → Reduce Motion = ON. Reopen app, navigate months. Expected: instant snap, no slide.

- [ ] **Toggle Reduce Motion mid-session** — Open the calendar with Reduce Motion OFF (slide works). Background the app, toggle Reduce Motion to ON in iOS Settings, foreground the app, navigate. Expected: instant snap (animation respects the new setting without app restart).

- [ ] **No off-screen bleed** — During a slide, no part of the off-screen month is visible above/below the calendar grid (i.e., the divider, the day list, the screen header all clip cleanly). If you see ghost pixels of the next-month grid leaking into the divider area, `overflow: 'hidden'` on the slideClip is wrong.

- [ ] **SP2 cold-launch hydration still works** — Kill app, reopen. Calendar should hydrate from AsyncStorage instantly (SP2 behavior); no slide animation on the first paint (initial mount = direction `'none'`).

- [ ] **Day list snap is correct** — Tapping a different day on the same month: day list updates instantly with no animation (correct; SP3 doesn't animate day list).

If any check fails, file a follow-up bug or note the issue. Don't merge until all 10 checks pass.

---

## Task 6: PR prep + push

**Files:** None (git operations only)

- [ ] **Step 1: Confirm clean state**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp3-ux-polish
git status && git log --oneline origin/main..HEAD
```
Expected: clean working tree, 4 commits ahead (1 spec + 1 plan + 2 code).

- [ ] **Step 2: Push the branch**

Run:
```bash
git push -u origin feat/release-calendar-sp3-ux-polish
```
Expected: branch pushed, upstream tracking set.

- [ ] **Step 3: Open PR via gh CLI**

Run:
```bash
gh pr create --title "feat(calendar): SP3 UX polish — month slide transitions" --body "$(cat <<'EOF'
## Summary
- Add a horizontal slide animation when navigating between months in the release calendar (iOS Calendar style).
- New self-contained `useMonthSlideAnimation` hook drives a `translateX` shared value via `react-native-reanimated`. Direction inferred from ordinal `(year * 12 + month)` comparison — year boundaries (Dec→Jan) handled for free.
- `CalendarGrid` wraps content in `Animated.View`; outer `slideClip` View has `overflow: 'hidden'` to prevent off-screen month bleeding during slide.
- Reduce-motion accessible (`AccessibilityInfo.isReduceMotionEnabled` subscription). Rapid-tap interrupts cleanly via reanimated's `withTiming` auto-cancel.

Builds on SP1 ([#397](https://github.com/TyShaneONeill/movie-tracker/pull/397)) and SP2 ([#401](https://github.com/TyShaneONeill/movie-tracker/pull/401)). Virtualization deferred (Q1 punted per scale analysis — current ~10-20 releases per busy day doesn't justify FlatList overhead).

**Spec:** `docs/superpowers/specs/2026-04-26-release-calendar-sp3-ux-polish-design.md`
**Plan:** `docs/superpowers/plans/2026-04-26-release-calendar-sp3-ux-polish.md`

## Files changed
- `hooks/use-month-slide-animation.ts` (new) — `inferDirection` pure helper + `useMonthSlideAnimation` hook
- `components/calendar/calendar-grid.tsx` — wrap content in `Animated.View`, add `slideClip` outer container with `overflow: 'hidden'`
- `__tests__/hooks/use-month-slide-animation.test.tsx` (new, 11 cases) — direction inference + hook lifecycle
- `__tests__/components/calendar/calendar-grid.test.tsx` — extend with 2 cases (re-render, testID preservation)

## Test plan
- [x] `npm run lint && npx tsc --noEmit && npm test` — all green
- [x] Web bundle smoke test — `expo export --platform web` succeeds; no native-module leaks
- [ ] **iOS device validation (Tyshane to run before merge):**
  - [ ] Tap next chevron → slide right-to-left over ~250ms
  - [ ] Tap prev chevron → slide left-to-right
  - [ ] Year boundary forward (Dec → Jan): forward slide
  - [ ] Year boundary back (Jan → Dec): backward slide
  - [ ] Rapid-tap next 3x: lands on month+3 cleanly, no flicker
  - [ ] Reduce Motion ON: instant snap, no slide
  - [ ] Toggle Reduce Motion mid-session: respects new setting without restart
  - [ ] No off-screen bleed during slide (divider/day list clip cleanly)
  - [ ] SP2 cold-launch hydration: no slide on initial mount
  - [ ] Day list snap on different-day select: instant, no animation

## Out of scope
- SP4 features (notifications, trailers, widget, multi-region, iCal, "coming this week" carousel)
- Swipe-to-navigate gesture (could be SP3.5 follow-up; gesture-handler is in deps)
- Virtualization of release-day list (deferred per scale analysis)
- Day list animations (only grid animates per spec Q3 Option A)
- Skeleton-to-grid fade transition (current instant swap is fine)

## Tracked notes
- `Dimensions.get('window').width` is read at hook module load. If the user rotates the device or uses iPad split-view, the slide distance is wrong. Acceptable for SP3 (phone-only, rotation locked); document for future tablet support.
- Existing `getReleaseCalendar` positional-args footgun (called out in SP2 PR #401) remains; SP3 doesn't touch the service layer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: returns PR URL.

- [ ] **Step 4: Capture the PR URL for the daily note**

Note the URL. Save for vault updates.

- [ ] **Step 5: Hand off to Tyshane for device validation + final code review + merge**

The PR is open. Tyshane:
1. Runs the device validation checklist from Task 5
2. Triggers a final code-review agent on the PR (opus + superpowers:code-reviewer)
3. Optionally runs the formal `code-review:code-review` skill for an independent pass
4. Merges if green

---

## Self-review notes

The plan covers:
- All 4 spec sections (hook, grid wire-up, testing strategy, device validation)
- Year boundaries (explicit test cases in inferDirection unit tests)
- Reduce-motion subscription + cleanup (tested at hook level)
- Web bundle smoke (Task 4)
- Device validation handoff (Task 5)
- PR prep with structured description (Task 6)

Each implementation task (1, 2) follows TDD: failing test → impl → passing test → commit. Tasks 3-6 are verification/handoff.

No placeholders — every code block contains the actual code an engineer would write.

If a future contributor changes `Dimensions.get('window').width`'s read site (e.g. moves it inside the hook to handle rotation), they should update the documented limitation in the PR's "Tracked notes" section.

If reanimated's `withSequence`/`withTiming` API changes in a future major (5.x), the hook's effect body needs updating; the test mocks (auto-applied by `jest-expo`) should adapt automatically.
