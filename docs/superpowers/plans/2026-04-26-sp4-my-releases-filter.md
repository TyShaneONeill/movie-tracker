# SP4-A My-Releases Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Show only my watchlist" toggle to the calendar filter sheet that limits both grid dots and day-list cards to releases the user has added to their watchlist.

**Architecture:** Pure filter helpers extracted to `lib/calendar-filters.ts` (unit-testable, reusable). `app/release-calendar.tsx` adds a `watchlistOnly` state, hydrates from / persists to `profiles.calendar_default_filters`, applies the helpers via `useMemo`, and renders a Switch row in the existing filter sheet (gated on auth). `components/calendar/release-day-list.tsx` gets one new prop for the empty-state variant.

**Tech Stack:** TypeScript, React Native (Expo), `react-native` `Switch`, Supabase profiles, Jest + `@testing-library/react-native`.

**Spec:** [`docs/superpowers/specs/2026-04-26-sp4-my-releases-filter-design.md`](../specs/2026-04-26-sp4-my-releases-filter-design.md)

**Branch:** `feat/sp4-my-releases-filter`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter`

**Spec/plan reconciliation note:** The spec says "no new hooks, no new lib functions." The plan refines this by extracting two pure filter helpers to `lib/calendar-filters.ts`. The reasoning is testability — pure helpers are unit-testable in isolation, vs. screen-level tests that require heavy hook/provider mocking. The spec's intent (single screen-level state, no new abstractions over existing data flow) is preserved; only the unit-test boundary moves. Total LOC growth is minimal (~30 lines).

---

## Task 1: Create `lib/calendar-filters.ts` with pure helpers + tests

**Files:**
- Test: `__tests__/lib/calendar-filters.test.ts` (new)
- Create: `lib/calendar-filters.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/calendar-filters.test.ts`:

```ts
import {
  filterDatesByWatchlist,
  filterDayReleases,
} from '@/lib/calendar-filters';
import type { CalendarDay, CalendarRelease } from '@/lib/tmdb.types';

function makeRelease(overrides: Partial<CalendarRelease> = {}): CalendarRelease {
  return {
    tmdb_id: 100,
    title: 'Test Movie',
    poster_path: '/test.jpg',
    backdrop_path: null,
    release_type: 3, // Theatrical
    release_type_label: 'Theatrical',
    genre_ids: [28],
    vote_average: 7.5,
    release_date: '2026-04-15',
    ...overrides,
  };
}

function makeDay(date: string, releases: CalendarRelease[]): CalendarDay {
  return { date, releases };
}

describe('filterDatesByWatchlist', () => {
  const day1 = makeDay('2026-04-10', [makeRelease({ tmdb_id: 10 })]);
  const day2 = makeDay('2026-04-15', [
    makeRelease({ tmdb_id: 20 }),
    makeRelease({ tmdb_id: 30 }),
  ]);
  const day3 = makeDay('2026-04-20', [makeRelease({ tmdb_id: 40 })]);
  const days = [day1, day2, day3];
  const fallback = ['2026-04-10', '2026-04-15', '2026-04-20'];

  it('returns fallback dates when watchlistOnly is false', () => {
    expect(
      filterDatesByWatchlist(days, new Set([10]), false, fallback)
    ).toEqual(fallback);
  });

  it('returns empty array when watchlistOnly is true and watchlistIds is undefined', () => {
    expect(filterDatesByWatchlist(days, undefined, true, fallback)).toEqual([]);
  });

  it('returns empty array when watchlistOnly is true and watchlistIds is empty', () => {
    expect(filterDatesByWatchlist(days, new Set(), true, fallback)).toEqual([]);
  });

  it('returns dates with at least one watchlist release when filter is on', () => {
    expect(
      filterDatesByWatchlist(days, new Set([10, 30]), true, fallback)
    ).toEqual(['2026-04-10', '2026-04-15']);
  });

  it('excludes dates with no watchlist releases', () => {
    expect(filterDatesByWatchlist(days, new Set([10]), true, fallback)).toEqual([
      '2026-04-10',
    ]);
  });

  it('returns empty array when no day has a watchlist release', () => {
    expect(filterDatesByWatchlist(days, new Set([999]), true, fallback)).toEqual(
      []
    );
  });
});

describe('filterDayReleases', () => {
  const releases = [
    makeRelease({ tmdb_id: 10, release_type: 3 }), // Theatrical
    makeRelease({ tmdb_id: 20, release_type: 6 }), // Streaming
    makeRelease({ tmdb_id: 30, release_type: 3 }), // Theatrical
  ];
  const allTypes = new Set([1, 2, 3, 4, 5, 6]);
  const theatricalOnly = new Set([1, 2, 3]);

  it('returns all releases when watchlistOnly is false and all types selected', () => {
    expect(filterDayReleases(releases, allTypes, undefined, false)).toEqual(
      releases
    );
  });

  it('filters by type only when watchlistOnly is false', () => {
    expect(filterDayReleases(releases, theatricalOnly, undefined, false)).toEqual(
      [releases[0], releases[2]]
    );
  });

  it('filters by watchlist when watchlistOnly is true', () => {
    expect(
      filterDayReleases(releases, allTypes, new Set([10, 30]), true)
    ).toEqual([releases[0], releases[2]]);
  });

  it('combines type and watchlist filters with AND logic', () => {
    // Only theatrical releases that are also in watchlist
    expect(
      filterDayReleases(releases, theatricalOnly, new Set([10, 20]), true)
    ).toEqual([releases[0]]);
  });

  it('returns empty array when watchlistOnly is true but watchlistIds is undefined', () => {
    expect(filterDayReleases(releases, allTypes, undefined, true)).toEqual([]);
  });

  it('returns empty array when watchlistOnly is true and no releases match watchlist', () => {
    expect(filterDayReleases(releases, allTypes, new Set([999]), true)).toEqual(
      []
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter
npx jest __tests__/lib/calendar-filters.test.ts
```
Expected: FAIL with "Cannot find module '@/lib/calendar-filters'".

- [ ] **Step 3: Implement the helpers**

Create `lib/calendar-filters.ts`:

```ts
import type { CalendarDay, CalendarRelease } from './tmdb.types';

/**
 * Returns the subset of dates that have at least one release in the
 * user's watchlist. When watchlistOnly is false, returns the provided
 * fallback (the unfiltered dates_with_releases from the API).
 *
 * Used by the calendar grid to drive the red "has releases" dot when
 * the my-releases filter is on.
 */
export function filterDatesByWatchlist(
  days: CalendarDay[],
  watchlistIds: Set<number> | undefined,
  watchlistOnly: boolean,
  fallback: string[]
): string[] {
  if (!watchlistOnly) return fallback;
  if (!watchlistIds || watchlistIds.size === 0) return [];
  return days
    .filter((d) => d.releases.some((r) => watchlistIds.has(r.tmdb_id)))
    .map((d) => d.date);
}

/**
 * Filters a single day's releases by type chip selection AND, optionally,
 * by watchlist membership. Both filters apply with AND semantics:
 * a release must match a selected type AND (if watchlistOnly is true)
 * be in the user's watchlist.
 */
export function filterDayReleases(
  releases: CalendarRelease[],
  filterTypes: Set<number>,
  watchlistIds: Set<number> | undefined,
  watchlistOnly: boolean
): CalendarRelease[] {
  return releases.filter((r) => {
    if (!filterTypes.has(r.release_type)) return false;
    if (watchlistOnly && !(watchlistIds?.has(r.tmdb_id) ?? false)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/calendar-filters.test.ts
```
Expected: PASS, all 12 tests green (6 + 6).

- [ ] **Step 5: Run lint and tsc**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar-filters.ts __tests__/lib/calendar-filters.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): add pure filter helpers for SP4-A my-releases filter

Two pure functions in lib/calendar-filters.ts:
- filterDatesByWatchlist: which dates the grid should show release dots
  for when the my-releases filter is on
- filterDayReleases: which release cards the day list should show,
  combining type-chip filters AND watchlist filter with AND semantics

12 unit tests covering edge cases (no watchlist, empty watchlist, no
matches, AND combinations). Pure functions — no React, no hooks,
unit-testable in isolation without screen mounting.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `release-day-list.tsx` with `watchlistOnlyEmpty` prop

**Files:**
- Test: `__tests__/components/calendar/release-day-list.test.tsx` (new)
- Modify: `components/calendar/release-day-list.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/calendar/release-day-list.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ReleaseDayList } from '@/components/calendar/release-day-list';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

const baseProps = {
  date: '2026-04-15',
  releases: [],
  watchlistIds: new Set<number>(),
  onMoviePress: jest.fn(),
  isLoading: false,
};

describe('ReleaseDayList — empty-state variants', () => {
  it('shows default empty state when no releases and watchlistOnlyEmpty is false', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} watchlistOnlyEmpty={false} />
    );
    expect(getByText('No releases on this date')).toBeTruthy();
    expect(getByText('Check another day or adjust your filters')).toBeTruthy();
    expect(queryByText('Your watchlist is empty')).toBeNull();
  });

  it('shows default empty state when watchlistOnlyEmpty is undefined', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} />
    );
    expect(getByText('No releases on this date')).toBeTruthy();
    expect(queryByText('Your watchlist is empty')).toBeNull();
  });

  it('shows watchlist-empty message when watchlistOnlyEmpty is true', () => {
    const { getByText, queryByText } = render(
      <ReleaseDayList {...baseProps} watchlistOnlyEmpty={true} />
    );
    expect(getByText('Your watchlist is empty')).toBeTruthy();
    expect(getByText('Add movies to your watchlist to see them here')).toBeTruthy();
    expect(queryByText('No releases on this date')).toBeNull();
  });

  it('renders release cards when releases array is non-empty regardless of watchlistOnlyEmpty', () => {
    const release = {
      tmdb_id: 100,
      title: 'Test Movie',
      poster_path: '/test.jpg',
      backdrop_path: null,
      release_type: 3,
      release_type_label: 'Theatrical',
      genre_ids: [28],
      vote_average: 7.5,
      release_date: '2026-04-15',
    };
    const { queryByText } = render(
      <ReleaseDayList
        {...baseProps}
        releases={[release]}
        watchlistOnlyEmpty={true}
      />
    );
    // Empty-state messages must NOT appear when there are actual releases
    expect(queryByText('Your watchlist is empty')).toBeNull();
    expect(queryByText('No releases on this date')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/components/calendar/release-day-list.test.tsx
```
Expected: 3rd test fails because the new `watchlistOnlyEmpty` prop isn't honored yet (still shows default text). Other tests may pass already since they assert existing default behavior.

- [ ] **Step 3: Read the current `release-day-list.tsx` empty-state region**

Run:
```bash
grep -n "No releases on this date\|Check another day\|emptyTitle\|emptySubtitle" components/calendar/release-day-list.tsx | head
```

Note the line where `No releases on this date` literal appears (lines 123-128). Identify the prop interface (probably `ReleaseDayListProps`) at the top of the file.

- [ ] **Step 4: Add the new prop**

In `components/calendar/release-day-list.tsx`:

1. **Extend the props interface** — find `interface ReleaseDayListProps {` (or similar) and add:
   ```tsx
   /**
    * When true and `releases` is empty, the empty state message changes
    * from the default "No releases on this date" to a watchlist-specific
    * "Your watchlist is empty / Add movies to your watchlist to see them
    * here." message. Used when the my-releases filter is on but the
    * user has zero watchlist items.
    */
   watchlistOnlyEmpty?: boolean;
   ```

2. **Destructure in the function signature** — add `watchlistOnlyEmpty = false` to the destructured props.

3. **Update the empty-state JSX** — find the block with `No releases on this date` (lines ~123-128) and replace with a conditional:

   ```tsx
   <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
     {watchlistOnlyEmpty ? 'Your watchlist is empty' : 'No releases on this date'}
   </Text>
   <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
     {watchlistOnlyEmpty
       ? 'Add movies to your watchlist to see them here'
       : 'Check another day or adjust your filters'}
   </Text>
   ```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest __tests__/components/calendar/release-day-list.test.tsx
```
Expected: 4/4 passing.

- [ ] **Step 6: Run the full test suite to verify no regressions**

```bash
npm test -- --silent 2>&1 | grep "Tests:"
```
Expected: 851 baseline + 12 from Task 1 + 4 new = 867 passing.

- [ ] **Step 7: Run lint and tsc**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add components/calendar/release-day-list.tsx __tests__/components/calendar/release-day-list.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): add watchlistOnlyEmpty prop to ReleaseDayList

When the my-releases filter is on AND the user's watchlist is globally
empty, the day-list shows a tailored empty-state message ("Your watchlist
is empty / Add movies to your watchlist to see them here") instead of
the default ("No releases on this date / Check another day or adjust
your filters"). Optional prop, defaults to false — no behavior change
for existing callers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire up the filter in `app/release-calendar.tsx`

**Files:**
- Modify: `app/release-calendar.tsx`

This task has no new TDD tests — the helpers are unit-tested in Task 1, the day-list change is tested in Task 2, and the screen-level integration is verified by manual device validation in Task 5. Adding screen-mounting tests would require heavy mocking of useReleaseCalendar, useWatchlistIds, useTasteProfile, useAuth, supabase, and useMutation — high cost, low marginal value over the existing unit coverage.

- [ ] **Step 1: Read the current screen state hooks and filter sheet**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter
grep -n "useState\|useMemo\|filterTypes\|FILTER_CHIPS\|calendar_default_filters\|<ReleaseDayList\|<CalendarGrid\|showFilters" app/release-calendar.tsx | head -30
```

Identify line numbers for:
- The existing `[filterTypes, setFilterTypes]` `useState`
- The hydration `useEffect` that loads `calendar_default_filters`
- The Apply button's `supabase.from('profiles').update(...)` call
- The `selectedDayReleases` `useMemo`
- The `watchlistDates` `useMemo`
- The `personalizedDates` `useMemo`
- The `<CalendarGrid>` JSX
- The `<ReleaseDayList>` JSX
- The filter sheet's chip container in the modal panel

- [ ] **Step 2: Add the `watchlistOnly` state**

Near the existing `const [filterTypes, setFilterTypes] = useState<Set<number>>(...)`:

```tsx
const [watchlistOnly, setWatchlistOnly] = useState(false);
```

- [ ] **Step 3: Extend the hydration effect**

Find the existing `useEffect` that calls `supabase.from('profiles').select('calendar_default_filters')`. Replace its body with:

```tsx
useEffect(() => {
  if (!user) return;
  supabase
    .from('profiles')
    .select('calendar_default_filters')
    .eq('id', user.id)
    .single()
    .then(({ data: profile }) => {
      if (profile?.calendar_default_filters) {
        const saved = profile.calendar_default_filters as {
          release_types?: number[];
          my_watchlist_only?: boolean;
        };
        if (saved.release_types) {
          setFilterTypes(new Set(saved.release_types));
        }
        if (saved.my_watchlist_only) {
          setWatchlistOnly(saved.my_watchlist_only);
        }
      }
    });
}, [user]);
```

- [ ] **Step 4: Extend the Apply persistence**

Find the Apply button's `onPress` (or wherever the existing `supabase.from('profiles').update(...)` runs after the user taps Apply). Update the call:

```tsx
supabase
  .from('profiles')
  .update({
    calendar_default_filters: {
      release_types: [...filterTypes],
      my_watchlist_only: watchlistOnly,
    },
  })
  .eq('id', user.id);
```

- [ ] **Step 5: Replace inline filter logic with `lib/calendar-filters.ts` helpers**

At the top of the file, add the import:

```tsx
import {
  filterDatesByWatchlist,
  filterDayReleases,
} from '@/lib/calendar-filters';
```

Then update the three `useMemo`s:

**Replace `selectedDayReleases`:**

```tsx
const selectedDayReleases = useMemo(() => {
  if (!data || !selectedDate) return [];
  const day = data.days.find((d) => d.date === selectedDate);
  if (!day) return [];
  return filterDayReleases(day.releases, filterTypes, watchlistIds, watchlistOnly);
}, [data, selectedDate, filterTypes, watchlistIds, watchlistOnly]);
```

**Add `filteredDatesWithReleases` (new memo, place near `watchlistDates`):**

```tsx
const filteredDatesWithReleases = useMemo(
  () =>
    filterDatesByWatchlist(
      data?.days ?? [],
      watchlistIds,
      watchlistOnly,
      data?.dates_with_releases ?? []
    ),
  [data, watchlistIds, watchlistOnly]
);
```

**Replace `personalizedDates`:**

```tsx
const personalizedDates = useMemo(() => {
  if (!tasteProfile || !data) return [];
  return data.days
    .filter((d) =>
      d.releases.some((r) => {
        if (watchlistOnly && !(watchlistIds?.has(r.tmdb_id) ?? false)) return false;
        const result = scoreRelease(r.genre_ids, r.tmdb_id, tasteProfile);
        return result.score >= 50;
      })
    )
    .map((d) => d.date);
}, [data, watchlistOnly, watchlistIds, tasteProfile]);
```

(`watchlistDates` is unchanged — it already filters to watchlist days unconditionally.)

- [ ] **Step 6: Compute `watchlistOnlyEmpty` and pass it to `ReleaseDayList`**

Near where `selectedDayReleases` is defined, add:

```tsx
const watchlistOnlyEmpty = watchlistOnly && (watchlistIds?.size ?? 0) === 0;
```

Find `<ReleaseDayList ... />` JSX and add the new prop:

```tsx
<ReleaseDayList
  date={selectedDate || ''}
  releases={selectedDayReleases}
  watchlistIds={watchlistIds ?? new Set()}
  onMoviePress={handleMoviePress}
  onToggleWatchlist={handleToggleWatchlist}
  tasteScores={tasteScores}
  isLoading={isLoading}
  watchlistOnlyEmpty={watchlistOnlyEmpty}
/>
```

- [ ] **Step 7: Update `<CalendarGrid>` to receive filtered dates**

Find `<CalendarGrid ... />` JSX. Replace `datesWithReleases={data?.dates_with_releases ?? []}` with:

```tsx
<CalendarGrid
  year={year}
  month={month}
  selectedDate={selectedDate}
  datesWithReleases={filteredDatesWithReleases}
  watchlistDates={watchlistDates}
  personalizedDates={personalizedDates}
  onSelectDate={setSelectedDate}
  onMonthChange={handleMonthChange}
  isLoading={isLoading}
/>
```

(`watchlistDates` and `personalizedDates` were already passed; `personalizedDates` now reflects the filter from Step 5; `watchlistDates` doesn't need a filter — it's already watchlist-only by definition.)

- [ ] **Step 8: Add the Switch row to the filter sheet**

Find the filter sheet's modal panel (the `View` with `styles.modalPanel`). Inside, locate the section before the chip container — the place where the modal title and "Release Type" section header are. Add a new section ABOVE the existing "Release Type" header:

```tsx
{/* Watchlist Only Section — auth-gated */}
{user && (
  <View style={styles.switchRow}>
    <Text style={[styles.switchLabel, { color: colors.text }]}>
      Show only my watchlist
    </Text>
    <Switch
      value={watchlistOnly}
      onValueChange={setWatchlistOnly}
      trackColor={{ false: colors.backgroundSecondary, true: colors.tint }}
      accessibilityLabel="Show only releases in my watchlist"
    />
  </View>
)}

{/* Release Type Section */}
<Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>
  Release Type
</Text>
{/* ... existing chip container unchanged ... */}
```

Add `Switch` to the imports from `react-native` at the top of the file:

```tsx
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Switch,  // <-- new
} from 'react-native';
```

- [ ] **Step 9: Add the new styles**

Find the `StyleSheet.create({ ... })` block at the bottom of the file. Add two entries:

```tsx
switchRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: Spacing.sm,
  marginBottom: Spacing.md,
},
switchLabel: {
  ...Typography.body,
  flex: 1,
},
```

(If `Typography.body` doesn't exist by that exact name, use whatever the existing modal title or filter section uses — check the file's existing patterns for a body-text style.)

- [ ] **Step 10: Run the full test suite to verify no regressions**

```bash
npm test -- --silent 2>&1 | grep "Tests:"
```
Expected: 867 passing (baseline + new from Tasks 1+2). No screen tests added in Task 3.

- [ ] **Step 11: Run lint and tsc**

```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 12: Commit**

```bash
git add app/release-calendar.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): wire SP4-A my-releases filter into release-calendar screen

- Add watchlistOnly state hydrated from profiles.calendar_default_filters.
- Persist on Apply alongside existing release_types preference.
- Use new lib/calendar-filters helpers for selectedDayReleases (added
  watchlist filter clause) and a new filteredDatesWithReleases memo
  (drives the calendar grid's red dots).
- Filter personalizedDates to respect the watchlist filter (golden dots
  only on days with watchlist+taste-matched intersection).
- Add Switch row to the filter sheet, gated on `user` (hidden in guest
  mode).
- Pass watchlistOnlyEmpty to ReleaseDayList for the empty-watchlist
  helper message.

CalendarGrid component is unchanged — receives filtered date arrays;
the dot rendering logic stays dumb. Filter helpers are pure; logic
covered by 12 unit tests in Task 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pre-PR verification gate

**Files:** None (verification only)

- [ ] **Step 1: Run lint, typecheck, and full test suite together**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter
npm run lint && npx tsc --noEmit && npm test -- --silent
```

Expected:
- Lint: 0 errors. Pre-existing warnings unchanged.
- TSC: 0 errors.
- Tests: 867 passing (851 baseline + 16 new = 12 from filters + 4 from day-list).

- [ ] **Step 2: If anything fails, do NOT proceed**

Common issues:
- Forgot to add `Switch` to the `react-native` import in `app/release-calendar.tsx`
- `Typography.body` style not found — substitute the existing body text style
- The hydration `useEffect` was extended but not all callers updated — re-verify Step 3 of Task 3

Fix and re-run until all three pass.

- [ ] **Step 3: Confirm git status is clean and commit list is correct**

```bash
git status && git log --oneline origin/main..HEAD
```

Expected commit list (in order):
1. `docs: SP4-A my-releases filter design spec`
2. `feat(calendar): add pure filter helpers for SP4-A my-releases filter`
3. `feat(calendar): add watchlistOnlyEmpty prop to ReleaseDayList`
4. `feat(calendar): wire SP4-A my-releases filter into release-calendar screen`

Plus the plan-doc commit added before Task 1.

---

## Task 5: Web bundle leak smoke test

**Files:** None (smoke test only)

- [ ] **Step 1: Build the web bundle**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter
npx expo export --platform web 2>&1 | tail -5
```
Expected: build completes with no errors.

- [ ] **Step 2: Confirm SP4-A code is present in the bundle**

```bash
grep -rl "filterDatesByWatchlist\|filterDayReleases" dist/ 2>/dev/null | head -3
```
Expected: at least one match.

- [ ] **Step 3: Confirm no native-only modules leaked**

```bash
grep -rl "WidgetBridgeModule" dist/ 2>/dev/null
```
Expected: zero matches (sanity check).

- [ ] **Step 4: Cleanup**

```bash
rm -rf dist/
git status
```
Expected: clean (`dist/` is gitignored).

---

## Task 6: Device validation checklist (manual — Tyshane runs)

This task is performed by Tyshane on a physical iPhone or iOS Simulator.

- [ ] **Switch ON, watchlist has items** — calendar grid red dots show only on days with watchlist releases; day list shows only watchlist cards.

- [ ] **Switch OFF** — calendar reverts to all-releases view; day list shows all releases for selected day.

- [ ] **Persistence across app restart** — kill app, reopen. Switch state preserved (matches the Apply-button behavior the existing type-filter chips already have).

- [ ] **Combine with type filters** — turn switch ON, deselect "Streaming" chip. Calendar shows only watchlist items that are NOT streaming. Verify AND semantics.

- [ ] **Empty watchlist + filter ON** — sign in with a fresh account (or remove all watchlist items), turn filter on. Calendar grid shows zero dots; day list shows "Your watchlist is empty / Add movies to your watchlist to see them here."

- [ ] **Guest mode** — sign out, open calendar. Filter sheet does NOT show the Switch row (only the type chips visible).

- [ ] **Add movie to watchlist while filter is on** — within ~5 min (React Query staleTime) or after pull-to-refresh, the new movie appears in the filter view.

- [ ] **Personalized dots respect filter** — if you have a taste profile and a watchlist movie that's also taste-matched, the gold/personalized dot appears on that day. If the taste-matched movie is NOT in your watchlist, the gold dot disappears when filter is on.

- [ ] **SP3 slide animation still works** — tap chevrons; the slide animation should be unaffected by the filter state.

- [ ] **SP2 cold-launch hydration still works** — kill app, reopen. Calendar hydrates instantly from AsyncStorage; the filter state hydrates from `profiles.calendar_default_filters` shortly after.

If any check fails, file a follow-up bug or note the issue. Don't merge until critical checks pass.

---

## Task 7: PR prep + push

- [ ] **Step 1: Confirm clean state**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-sp4-my-releases-filter
git status && git log --oneline origin/main..HEAD
```
Expected: clean working tree, 5 commits ahead (1 spec + 1 plan + 3 code).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/sp4-my-releases-filter
```
Expected: branch pushed.

- [ ] **Step 3: Open PR via gh CLI**

```bash
gh pr create --title "feat(calendar): SP4-A my-releases filter (watchlist-only toggle)" --body "$(cat <<'EOF'
## Summary

- Add a "Show only my watchlist" Switch to the calendar filter sheet. When ON, the calendar grid (red dots, gold dots, personalized golden dots) and the day-list cards all show only releases for movies in the user's watchlist.
- Pure filter helpers extracted to `lib/calendar-filters.ts` (12 unit tests). Screen wires them via `useMemo`.
- Persists alongside type-filter preferences in `profiles.calendar_default_filters` (jsonb; new field `my_watchlist_only`). No DB migration needed.
- Hidden in guest mode (gated on `user` truthy).
- Empty-watchlist + filter ON → tailored "Your watchlist is empty" message in the day list.
- AND semantics with the existing type chips: e.g. "watchlist items that are theatrical."

Builds on SP1 ([#397](https://github.com/TyShaneONeill/movie-tracker/pull/397)), SP2 ([#401](https://github.com/TyShaneONeill/movie-tracker/pull/401)), SP3 ([#402](https://github.com/TyShaneONeill/movie-tracker/pull/402)). First slice of the SP4 feature pack.

**Spec:** `docs/superpowers/specs/2026-04-26-sp4-my-releases-filter-design.md`
**Plan:** `docs/superpowers/plans/2026-04-26-sp4-my-releases-filter.md`

## Files changed
- `lib/calendar-filters.ts` (new) — `filterDatesByWatchlist` + `filterDayReleases` pure helpers
- `__tests__/lib/calendar-filters.test.ts` (new, 12 cases)
- `components/calendar/release-day-list.tsx` — new `watchlistOnlyEmpty` prop
- `__tests__/components/calendar/release-day-list.test.tsx` (new, 4 cases)
- `app/release-calendar.tsx` — `watchlistOnly` state, hydration, persistence, filter wiring, Switch row in filter sheet

## Test plan
- [x] `npm run lint && npx tsc --noEmit && npm test` — 867/867 pass, 0 lint errors, tsc clean
- [x] Web bundle smoke test — `expo export --platform web` succeeds
- [ ] **iOS device validation (Tyshane to run before merge):**
  - [ ] Switch ON, watchlist has items: dots only on watchlist days; cards only watchlist
  - [ ] Switch OFF: all releases visible
  - [ ] Persistence across app restart
  - [ ] Combine with type filters: AND semantics
  - [ ] Empty watchlist + filter ON: tailored helper message
  - [ ] Guest mode: Switch row hidden
  - [ ] Add movie to watchlist while filter is on: appears within ~5min
  - [ ] Personalized dots respect filter
  - [ ] SP3 slide animation unaffected
  - [ ] SP2 cold-launch hydration unaffected

## Out of scope
- Other SP4 features: notifications, trailers, "Coming this week" carousel, multi-region, iCal, widget. Each gets its own PR.
- `useFilteredReleases` hook abstraction — premature; useMemos are fine
- Mutation/toast on persistence failure (parity with existing type-filter fire-and-forget)
- Database migration (jsonb column, no schema change)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: returns PR URL.

- [ ] **Step 4: Hand off to Tyshane**

Tyshane runs Task 6 device validation, optionally triggers a code-review pass, and merges if green.

---

## Self-review notes

**Spec coverage:**
- Q1 (Switch at top of filter sheet): Task 3 Step 8 ✓
- Q2 (filter applies to grid + day list): Task 3 Steps 5–7 ✓
- Q3a (default OFF): Task 3 Step 2 — `useState(false)` ✓
- Q3b (guest mode hidden): Task 3 Step 8 — `{user && (...)}` ✓
- Q3c (empty-watchlist message): Task 2 + Task 3 Step 6 ✓
- Persistence to `calendar_default_filters`: Task 3 Steps 3 & 4 ✓
- AND semantics with type filters: Task 1 `filterDayReleases` test case ✓

**Type consistency:**
- `Set<number>` for `watchlistIds` — used consistently across helpers, screen, and tests
- `boolean` for `watchlistOnly` — consistent
- `string[]` for date arrays — consistent
- `CalendarRelease` and `CalendarDay` types from `@/lib/tmdb.types` — imported consistently

**No placeholders.** Every task has full code. No "similar to Task N" references. No "TBD."

**File responsibility:**
- `lib/calendar-filters.ts` — pure filter logic, no React, ~30 lines
- `components/calendar/release-day-list.tsx` — UI variant on existing component
- `app/release-calendar.tsx` — orchestration; grows by ~30 lines but stays under 500 lines total

**Risks captured in spec.** Re-read before merging.
