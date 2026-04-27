# Release Calendar SP3: UX Polish (Month Slide Transitions) — Design Spec

**Date:** 2026-04-26
**Status:** Ready for plan
**Feature:** Smooth horizontal-slide animation when navigating between months in the release calendar
**Parent initiative:** "Enterprise-grade release calendar" (SP3 of 4)
**Companion follow-ups:** SP4 (notifications, trailers, widget, multi-region, iCal, "coming this week" carousel) — out of scope for this spec
**Builds on:** [SP1 — Release Calendar Foundation](./2026-04-23-release-calendar-foundation-design.md) (PR #397) and [SP2 — Client Cache Hierarchy](./2026-04-26-release-calendar-sp2-cache-hierarchy-design.md) (PR #401)

## Context

After SP2, month-flip is *instant* (prefetched neighbors, hydrated cache) — but the visual transition is abrupt: tap chevron, state updates, calendar re-renders in place. The motion communicates "something happened" without communicating *direction*. iOS Calendar (Apple's native) and most modern calendar UIs slide horizontally to convey forward/backward navigation, which doubles as motion feedback for the chevron tap.

What's deferred from the original SP3 decomposition:

- **Virtualization of the release-day list** — at current US-only scale (~100 movies/month, ~10-20 releases on a busy single day), `ScrollView` with `.map()` handles the load fine. Virtualization (FlatList / FlashList) is YAGNI and adds either dependency weight or overhead-per-render. Revisit only if SP4 multi-region drives release counts past ~100/day.

What this spec adds:

- **Horizontal slide animation** when the calendar grid transitions between months
- Direction-aware (next slides right-to-left, prev slides left-to-right)
- Reduce-motion accessible (respects iOS "Reduce Motion" setting)
- Rapid-tap resilient (interrupts and animates to the latest target)

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| Scope | Month transitions only. Virtualization punted (Q1 Option B). |
| Animation flavor | Horizontal slide, iOS Calendar style (Q2 Option A) |
| Surface that animates | Whole `CalendarGrid` (chevron row + month name + weekday row + day cells) as a single unit. Day list below snaps to new content when `selectedDate` changes. (Q3 Option A) |
| Library | `react-native-reanimated@~4.1.1` (already in deps) |
| Duration | 250ms |
| Easing | `Easing.out(Easing.cubic)` |
| Direction inference | Ordinal `year * 12 + month` comparison between previous and current props |
| Year-boundary handling | Falls out for free from ordinal comparison (Dec 2026 → Jan 2027 = +1 ordinal = next; reverse = prev) |
| Reduce-motion behavior | If `AccessibilityInfo.isReduceMotionEnabled()` is true, skip animation; render new month in place |
| Rapid-tap behavior | Interrupt in-flight animation, animate to latest. No queuing, no debouncing. |
| Overflow containment | Animated wrapper has `overflow: 'hidden'` to prevent off-screen month bleeding into adjacent UI |
| Where direction lives | Internal to `CalendarGrid` via `useMonthSlideAnimation` hook. Screen (`app/release-calendar.tsx`) is unchanged. |

## Scope

### 1. New hook — `hooks/use-month-slide-animation.ts`

Encapsulates the animation logic. Takes the current `(year, month)` and returns:
- `animatedStyle`: a reanimated `useAnimatedStyle` style object to apply to the grid wrapper
- (Internally) tracks the previous `(year, month)`, infers direction, drives a `translateX` `useSharedValue` via `withTiming`

```ts
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const SLIDE_DURATION_MS = 250;
const SCREEN_WIDTH = Dimensions.get('window').width;

type Direction = 'next' | 'prev' | 'none';

/**
 * Pure helper: ordinal comparison handles year boundaries for free.
 * (2026, 12) → (2027, 1) = ordinal jump from 24324 → 24325 = next.
 */
export function inferDirection(
  prev: { year: number; month: number } | null,
  current: { year: number; month: number }
): Direction {
  if (prev === null) return 'none';
  const prevOrdinal = prev.year * 12 + prev.month;
  const currOrdinal = current.year * 12 + current.month;
  if (currOrdinal > prevOrdinal) return 'next';
  if (currOrdinal < prevOrdinal) return 'prev';
  return 'none';
}

export function useMonthSlideAnimation(year: number, month: number) {
  const prevRef = useRef<{ year: number; month: number } | null>(null);
  const translateX = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Subscribe to reduce-motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => sub.remove();
  }, []);

  // Animate on month change
  useEffect(() => {
    const direction = inferDirection(prevRef.current, { year, month });
    prevRef.current = { year, month };

    if (direction === 'none' || reduceMotion) {
      translateX.value = 0;
      return;
    }

    // Phase 1: snap to the offscreen-start position (no animation)
    // Phase 2: animate to 0 with timing
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

**Why this shape:**
- Direction inference is pure, exported, testable in isolation
- `useRef` for previous (year, month) to detect change
- Single `translateX` shared value drives the transform
- `withSequence` snaps to start position then animates to 0 — no complex two-pass rendering
- Reduce-motion respected by short-circuiting to `translateX.value = 0`
- Auto-cancellation of in-flight animations is built into reanimated (`withTiming` interrupts on new assignment)

### 2. Update `components/calendar/calendar-grid.tsx`

Wrap the existing grid content in an `Animated.View` with the hook's `animatedStyle`. Add `overflow: 'hidden'` to the wrapper.

**Pseudo-diff:**

```tsx
import Animated from 'react-native-reanimated';
import { useMonthSlideAnimation } from '@/hooks/use-month-slide-animation';

export default function CalendarGrid({ year, month, ...props }: CalendarGridProps) {
  // ... existing hooks (theme, useMemo for dayCells, etc.) ...
  const { animatedStyle } = useMonthSlideAnimation(year, month);

  // Existing skeleton-gate from SP2 stays first — no animation when hydrating
  if (isLoading && datesWithReleases.length === 0) {
    return <CalendarGridSkeleton ... />;
  }

  return (
    <View style={styles.outerContainer}>
      <Animated.View style={[styles.animatedWrapper, animatedStyle]} testID="calendar-grid">
        {/* existing month-header row, weekday row, day grid — UNCHANGED */}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    overflow: 'hidden', // CRITICAL: prevents off-screen month from bleeding into divider/day list
  },
  animatedWrapper: {
    // ... whatever the current container styles are ...
  },
  // ... existing styles ...
});
```

**Important details:**
- `overflow: 'hidden'` lives on an OUTER container, not on the animated wrapper itself. Reanimated transforms the inner wrapper; the outer clips the result.
- Existing `testID="calendar-grid"` (added in SP2 Task 4) moves to the `Animated.View` — keeps the test still valid.
- The skeleton-gate from SP2 stays as the first early-return; we never animate a skeleton.
- The `CalendarGrid` component's existing `styles.container` may need to split into `outerContainer` + `animatedWrapper`. Migration is mechanical.

### 3. No changes to `app/release-calendar.tsx`

The screen passes `year` and `month` props to `CalendarGrid`. The hook reads those props and animates internally. The screen's `handleMonthChange` (which sets year/month state) is the trigger; the screen itself doesn't know animation exists. Clean abstraction.

### 4. No changes to day list, screen scroll behavior, or selectedDate flow

Per Q3 Option A: only the grid animates. The day list below the grid swaps content instantly when `selectedDate` changes (which already happens via the SP2 tagalong fix's default-day logic).

## Data flow

### Forward navigation (next chevron tap)

```
1. User taps next chevron → CalendarGrid's onMonthChange fires
   → app/release-calendar.tsx sets year/month state
2. CalendarGrid re-renders with new (year, month) props
3. useMonthSlideAnimation: prevRef has old (year, month); current has new
   inferDirection returns 'next'
4. translateX.value = withSequence(
     withTiming(SCREEN_WIDTH, { duration: 0 }),  // snap to off-screen-right
     withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) })  // slide in
   )
5. Reanimated worklet drives translateX from SCREEN_WIDTH → 0 over 250ms
6. Grid renders new month inside the animated wrapper, sliding in from the right
7. After 250ms, translateX settles at 0; idle until next month change
```

### Backward navigation

Mirror image: `translateX.value = withSequence(withTiming(-SCREEN_WIDTH, 0), withTiming(0, 250))`.

### Year boundary

Same as next/prev — ordinal comparison handles wraparound. (2026, 12) → (2027, 1) reads as `+1 ordinal` = `'next'`, slides right-to-left. (2026, 1) → (2025, 12) reads as `-1 ordinal` = `'prev'`, slides left-to-right.

### Initial mount

`prevRef.current === null` → `inferDirection` returns `'none'` → `translateX.value = 0` (no animation). Grid renders in place with current month. SP2's hydration-from-AsyncStorage flow continues unaffected.

### Rapid-tap interrupt

User taps next 3x in 300ms. Each tap re-runs the effect. Reanimated's `withTiming` cancels the in-flight animation on each new assignment to `translateX.value`, so the third tap's animation is the only one that completes — landing the grid at month+3, single smooth slide. No flicker, no half-states.

### Reduce-motion change mid-session

User toggles iOS Reduce Motion in Settings while the app is open. `AccessibilityInfo` emits `'reduceMotionChanged'`. Hook updates `reduceMotion` state. Next month change skips animation; previous animation behavior is gone. No app restart needed.

## Error handling

| Failure mode | Behavior |
|---|---|
| Reanimated worklet runtime error (unlikely on supported platforms) | Falls back to React thread — `translateX.value = 0` is the visual fallback. No animation, but month change still happens. |
| `AccessibilityInfo.isReduceMotionEnabled()` rejects | Hook defaults `reduceMotion` to `false`; animation runs as if reduce-motion is off. Acceptable degradation. |
| Mid-animation prop change beyond direction | Reanimated cancels in-flight, animates to the latest. No state explosion. |
| Web platform (no native reanimated) | Reanimated 4.x has web support. The animated style applies as a CSS transform on web. If web bundler complains, add a platform-conditional fallback (`Platform.OS === 'web' ? null : animatedStyle`) — but verify on bundle smoke test first. |

## Testing

### Unit — `inferDirection`

`__tests__/hooks/use-month-slide-animation.test.tsx` (new):

```ts
describe('inferDirection', () => {
  it('returns "none" when prev is null (initial mount)', () => {
    expect(inferDirection(null, { year: 2026, month: 4 })).toBe('none');
  });

  it('returns "next" for forward navigation in same year', () => {
    expect(inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 5 })).toBe('next');
  });

  it('returns "prev" for backward navigation in same year', () => {
    expect(inferDirection({ year: 2026, month: 5 }, { year: 2026, month: 4 })).toBe('prev');
  });

  it('returns "next" across December to January year boundary', () => {
    expect(inferDirection({ year: 2026, month: 12 }, { year: 2027, month: 1 })).toBe('next');
  });

  it('returns "prev" across January to December year boundary', () => {
    expect(inferDirection({ year: 2026, month: 1 }, { year: 2025, month: 12 })).toBe('prev');
  });

  it('returns "next" for multi-month forward jumps', () => {
    expect(inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 7 })).toBe('next');
  });

  it('returns "none" when same month re-rendered', () => {
    expect(inferDirection({ year: 2026, month: 4 }, { year: 2026, month: 4 })).toBe('none');
  });
});
```

### Unit — `useMonthSlideAnimation` hook

Same file. Test that:
- The hook returns an `animatedStyle` object on every render
- Mount with `{ year: 2026, month: 4 }` then re-render with `{ year: 2026, month: 5 }` — verify the hook returns a stable `animatedStyle` and that the effect ran (because reanimated is auto-mocked synchronously by `jest-expo`, the assertion is on final shared-value state, not animation curve)
- With `AccessibilityInfo.isReduceMotionEnabled` mocked to resolve `true`, the animation effect short-circuits (no slide setup; `translateX.value` stays at 0 directly)

### Component — `CalendarGrid` integration

Extend `__tests__/components/calendar/calendar-grid.test.tsx`:

- Existing 3 tests for skeleton wiring stay
- New test: render with `year=2026, month=4`, then re-render with `year=2026, month=5`. Assert the grid is still in the tree (no remount). The animation itself isn't deterministically testable in unit-test environment (jest fake reanimated mock); device validation covers the visual.
- Optional: assert `testID="calendar-grid"` is on the `Animated.View`, not lost in the refactor.

### Device validation (manual — Tyshane runs)

| Scenario | Expected |
|---|---|
| Tap next chevron | Grid slides right-to-left over ~250ms; new month appears |
| Tap prev chevron | Grid slides left-to-right over ~250ms |
| Year-boundary forward (Dec → Jan) | Slides right-to-left (forward direction preserved) |
| Year-boundary back (Jan → Dec) | Slides left-to-right |
| Rapid-tap next 3x | Grid lands on month+3 in a single smooth slide; no flicker |
| Reduce Motion ON (Settings → Accessibility → Motion) | Month change is instant; no slide |
| Toggle Reduce Motion mid-session | Next navigation respects new setting without app restart |
| Pre-existing tagalong fix (SP2 commit `3f64fe7`) | `selectedDate` defaults still work; day list updates after slide completes |
| Background refetch lands mid-slide | Animation continues smoothly; data updates apply at slide-end if anything changed |

### Web bundle smoke

`expo export --platform web` succeeds. Reanimated 4.x has web support; if bundler complains, gate the animated style on `Platform.OS !== 'web'` as a fallback. Web users get the SP2 instant-feel without the slide — acceptable degradation.

### Pre-PR gate

```bash
npm run lint && npx tsc --noEmit && npm test
```

All green. Baseline before SP3: 838 tests, 0 lint errors, 0 TSC errors.

## Out of scope

- **Virtualization of release-day list** — punted in Q1 per scale analysis. Revisit if SP4 multi-region raises release counts past ~100/day.
- **Swipe-to-navigate gesture** — Q2 Option C. Could be a one-day SP3.5 follow-up; gesture-handler is already in deps.
- **Year picker / month picker dropdown** — chevron-only UI stays.
- **Day list animations** — Q3 Option A: only grid animates. Day list snaps to new selected day's releases.
- **Skeleton-to-grid fade transition** — when fresh-install data lands and skeleton swaps for grid, that swap is instant (current behavior). Polish for SP3.5+ if anyone asks.
- **Vertical / paginated month navigation** — horizontal slide only, matching iOS Calendar.
- **Animated dot indicators** (release dots fade in/out as data updates) — separate polish.
- **SP4 features** — release notifications, trailer thumbnails, my-releases filter, multi-region preferences, iCal export, home-screen widget integration, "coming this week" carousel.

## Risks

- **Reanimated jest behavior** — the codebase uses `jest-expo` preset (`jest.config.js`), which auto-mocks `react-native-reanimated`. Worklets become synchronous: `useSharedValue(0).value` returns the latest assigned value immediately; `withTiming(toValue)` resolves to `toValue` instantly; `withSequence(a, b)` returns `b`. Tests verify final state, not animation curve. No additional mock setup needed. Reanimated-using components in the codebase (e.g. `components/popcorn/PopcornKernel.tsx`, `components/ui/swipe-to-confirm.tsx`) confirm this pattern works.
- **`overflow: 'hidden'` on the outer container** — easy to omit. Failure mode is the next-month grid bleeding into the divider/day list during slide. Caught only by device validation, not unit test. Implementer must confirm the visual on iOS sim before declaring task done.
- **`Dimensions.get('window').width` at module load** — the screen-width constant is read once at hook module load. If the user rotates the device or the window resizes (iPad split-view), the slide distance is wrong (clipped or extra-far). For SP3 we accept this — phone-only app, no split-view, rotation locked. Document for future tablet support.
- **Reanimated worklet error logs in dev** — reanimated 4.x has stricter worklet rules. If a worklet accesses a JS-thread function, it logs warnings. The hook's worklet (`useAnimatedStyle`) only reads `translateX.value`, no JS calls — should be clean. Verify in dev.

## Dependencies / sequencing

Depends on:
- SP1 (PR #397) ✓ — denormalized table, client reads
- SP2 (PR #401) ✓ — persistence, prefetch, skeleton-gate
- `react-native-reanimated@~4.1.1` ✓ already installed
- `react-native@0.81.5` ✓
- `expo@^54` ✓ (reanimated 4.x is supported)

Unblocks:
- SP4 swipe-to-navigate (gesture-handler is in deps; building on SP3's slide animation makes adding the gesture cheap — same translateX shared value, just driven by a `Pan` gesture instead of a `useEffect`)
- Future "coming this week" carousel can reuse the slide pattern via the same hook

## References

- [SP1 Release Calendar Foundation Design](./2026-04-23-release-calendar-foundation-design.md) — `docs/superpowers/specs/2026-04-23-release-calendar-foundation-design.md`
- [SP2 Client Cache Hierarchy Design](./2026-04-26-release-calendar-sp2-cache-hierarchy-design.md) — `docs/superpowers/specs/2026-04-26-release-calendar-sp2-cache-hierarchy-design.md`
- PR #397 (SP1) — https://github.com/TyShaneONeill/movie-tracker/pull/397
- PR #401 (SP2) — https://github.com/TyShaneONeill/movie-tracker/pull/401
- Reanimated 4 docs — https://docs.swmansion.com/react-native-reanimated/
- iOS Reduce Motion — `react-native` `AccessibilityInfo.isReduceMotionEnabled()`
