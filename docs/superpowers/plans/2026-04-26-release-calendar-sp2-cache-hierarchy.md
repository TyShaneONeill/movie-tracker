# Release Calendar SP2: Client Cache Hierarchy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the release calendar feel instant — persist React Query cache for `release-calendar` queries to AsyncStorage with a 7-day TTL, prefetch ±1 adjacent months on every mount/navigation, and wire the existing `CalendarGridSkeleton` so the calendar never shows a blank screen.

**Architecture:** Use `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (official TanStack libs) with a whitelist filter that scopes persistence to `['release-calendar', ...]` queries only. The hook owns prefetch logic via `useEffect` on `(year, month, region)`. The grid swaps its `ActivityIndicator` overlay for the existing skeleton when data is empty. No new top-level directories.

**Tech Stack:** TypeScript, React Native (Expo), `@tanstack/react-query` 5.x, `@react-native-async-storage/async-storage` 2.x, Jest + `@testing-library/react-native`.

**Spec:** [`docs/superpowers/specs/2026-04-26-release-calendar-sp2-cache-hierarchy-design.md`](../specs/2026-04-26-release-calendar-sp2-cache-hierarchy-design.md)

**Branch:** `feat/release-calendar-sp2-cache-hierarchy`
**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-calendar-sp2`

---

## Task 1: Install persistence dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install both first-party TanStack persistence packages**

Run:
```bash
npm install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister
```

Both packages must match the major version of `@tanstack/react-query` (currently `^5.90.16`). npm will resolve compatible versions automatically.

- [ ] **Step 2: Verify installation**

Run:
```bash
grep -E "react-query-persist-client|query-async-storage-persister" package.json
```
Expected: two lines under `dependencies`, both `^5.x.x`.

Run:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): add react-query persist-client + async-storage persister

Foundation for SP2 client cache hierarchy. Wiring follows in next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire persister + dehydrate filter in `lib/query-client.tsx`

**Files:**
- Test: `__tests__/lib/query-client.test.ts` (new)
- Modify: `lib/query-client.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/query-client.test.ts`:

```ts
import type { Query } from '@tanstack/react-query';
import {
  shouldDehydrateReleaseCalendar,
  RQ_PERSIST_BUSTER,
  RQ_PERSIST_MAX_AGE,
  RQ_PERSIST_KEY,
} from '@/lib/query-client';

function makeQuery(queryKey: readonly unknown[]): Query {
  return { queryKey } as unknown as Query;
}

describe('query-client persistence config', () => {
  describe('shouldDehydrateReleaseCalendar', () => {
    it('returns true for release-calendar queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar', 2026, 4, 'US']))
      ).toBe(true);
    });

    it('returns true for release-calendar with any args length', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar']))
      ).toBe(true);
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['release-calendar', 2026, 12, 'US', 'extra']))
      ).toBe(true);
    });

    it('returns false for watchlist-tmdb-ids queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['watchlist-tmdb-ids']))
      ).toBe(false);
    });

    it('returns false for userMovies queries', () => {
      expect(
        shouldDehydrateReleaseCalendar(makeQuery(['userMovies', 'user-id']))
      ).toBe(false);
    });

    it('returns false for empty queryKey', () => {
      expect(shouldDehydrateReleaseCalendar(makeQuery([]))).toBe(false);
    });

    it('returns false for non-string first segment', () => {
      expect(shouldDehydrateReleaseCalendar(makeQuery([42, 'x']))).toBe(false);
    });
  });

  describe('persistence constants', () => {
    it('buster is set (bump on ReleaseCalendarResponse shape change)', () => {
      expect(RQ_PERSIST_BUSTER).toBe('1');
    });

    it('maxAge is 7 days in milliseconds', () => {
      expect(RQ_PERSIST_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('persist key is namespaced for cinetrak with version suffix', () => {
      expect(RQ_PERSIST_KEY).toBe('cinetrak-rq-cache-v1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest __tests__/lib/query-client.test.ts
```
Expected: FAIL with "Cannot find module '@/lib/query-client'" or "shouldDehydrateReleaseCalendar is not a function" (the symbols don't exist yet).

- [ ] **Step 3: Read the current `lib/query-client.tsx` to preserve existing structure**

Run:
```bash
cat lib/query-client.tsx
```

Note the existing `MutationCache` Toast handler — preserve it verbatim. Only the `QueryClientProvider` wrapping is changing.

- [ ] **Step 4: Replace the contents of `lib/query-client.tsx`**

Write `lib/query-client.tsx`:

```tsx
import { QueryClient, MutationCache } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import type { ReactNode } from 'react';

/**
 * Bump this on any breaking change to `ReleaseCalendarResponse` shape
 * (e.g. SP4 adds a new release_type, fields renamed). Old persisted
 * cache deserializing into a stale shape could crash render.
 *
 * See lib/tmdb.types.ts → ReleaseCalendarResponse.
 */
export const RQ_PERSIST_BUSTER = '1';

/**
 * Persisted cache TTL. Anything older than this is dropped on hydration.
 * 7 days balances "instant cold launch" against "stale data we'd rather
 * skeleton-and-refetch" — release dates rarely shift more than a few days,
 * and the background refetch lands within ~300ms of hydration.
 */
export const RQ_PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * AsyncStorage key the persister uses. Versioned so a future-day rename
 * (e.g. cinetrak-rq-cache-v2) lets us drop all v1 data atomically.
 */
export const RQ_PERSIST_KEY = 'cinetrak-rq-cache-v1';

/**
 * Whitelist filter for the dehydrate pipeline. Only `release-calendar`
 * queries are written to AsyncStorage. Future expansion (e.g. SP4 might
 * persist `watchlist-tmdb-ids` for instant calendar dot rendering) is
 * a one-line OR change in this function.
 *
 * Why a whitelist, not blacklist: explicit opt-in prevents accidental
 * persistence of PII (auth tokens), volatile state (mutation results),
 * or paginated infinite queries.
 */
export function shouldDehydrateReleaseCalendar(query: Query): boolean {
  return query.queryKey[0] === 'release-calendar';
}

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: RQ_PERSIST_KEY,
});

const mutationCache = new MutationCache({
  onError: (error) => {
    Toast.show({
      type: 'error',
      text1: 'Something went wrong',
      text2: error instanceof Error ? error.message : 'Please try again',
    });
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
  mutationCache,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: RQ_PERSIST_MAX_AGE,
        buster: RQ_PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateReleaseCalendar,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

**Important:** the existing `MutationCache` `onError` handler preserves the Toast on mutation failures. If the actual current handler in `lib/query-client.tsx` differs from the snippet above (e.g. richer error logic), preserve the original verbatim — only the constants, filter, and provider wrapping should change.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
npx jest __tests__/lib/query-client.test.ts
```
Expected: PASS, all 9 assertions green.

- [ ] **Step 6: Run lint and tsc to confirm no breakage**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 7: Commit**

```bash
git add lib/query-client.tsx __tests__/lib/query-client.test.ts
git commit -m "$(cat <<'EOF'
feat(calendar): persist release-calendar queries via AsyncStorage

Wire @tanstack/react-query-persist-client with an async-storage backend.
Whitelist filter limits persistence to ['release-calendar', ...] queries
to avoid disk-writing PII/volatile state. 7-day maxAge balances cold-launch
instantness against staleness; buster='1' guards against shape-change
deserialization bugs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add adjacent-month prefetch in `hooks/use-release-calendar.ts`

**Files:**
- Test: `__tests__/hooks/use-release-calendar.test.tsx` (new)
- Modify: `hooks/use-release-calendar.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/use-release-calendar.test.tsx`:

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/release-calendar-service', () => ({
  getReleaseCalendar: jest.fn().mockResolvedValue({
    days: [],
    dates_with_releases: [],
    total_results: 0,
  }),
  getWatchlistTmdbIds: jest.fn().mockResolvedValue(new Set<number>()),
}));

import { useReleaseCalendar } from '@/hooks/use-release-calendar';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery');

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { Wrapper, prefetchSpy, queryClient };
}

describe('useReleaseCalendar — prefetch behavior', () => {
  it('prefetches month-1 and month+1 on mount', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 4, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 3, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 5, 'US'],
      })
    );
  });

  it('handles January boundary: prev = (Dec, year-1)', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 1, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2025, 12, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 2, 'US'],
      })
    );
  });

  it('handles December boundary: next = (Jan, year+1)', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(() => useReleaseCalendar({ month: 12, year: 2026 }), {
      wrapper: Wrapper,
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 11, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2027, 1, 'US'],
      })
    );
  });

  it('prefetches new neighbors when month changes', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    const { rerender } = renderHook(
      (props: { month: number; year: number }) => useReleaseCalendar(props),
      {
        wrapper: Wrapper,
        initialProps: { month: 4, year: 2026 },
      }
    );

    prefetchSpy.mockClear();

    rerender({ month: 5, year: 2026 });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 4, 'US'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 6, 'US'],
      })
    );
  });

  it('does not prefetch when disabled', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(
      () => useReleaseCalendar({ month: 4, year: 2026, enabled: false }),
      { wrapper: Wrapper }
    );

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('honors custom region in prefetch keys', () => {
    const { Wrapper, prefetchSpy } = makeWrapper();

    renderHook(
      () => useReleaseCalendar({ month: 4, year: 2026, region: 'GB' }),
      { wrapper: Wrapper }
    );

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 3, 'GB'],
      })
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['release-calendar', 2026, 5, 'GB'],
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx jest __tests__/hooks/use-release-calendar.test.tsx
```
Expected: FAIL with `expect(prefetchSpy).toHaveBeenCalledWith(...) ... Number of calls: 0`. Currently the hook only fires `useQuery`, not `prefetchQuery`.

- [ ] **Step 3: Replace the contents of `hooks/use-release-calendar.ts`**

Write `hooks/use-release-calendar.ts`:

```ts
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getReleaseCalendar, getWatchlistTmdbIds } from '@/lib/release-calendar-service';
import type { ReleaseCalendarResponse } from '@/lib/tmdb.types';

interface UseReleaseCalendarOptions {
  month: number;
  year: number;
  region?: string;
  enabled?: boolean;
}

const RC_STALE_TIME = 1000 * 60 * 30; // 30 min — pg_cron warms daily, so 30 min is conservative
const RC_GC_TIME = 1000 * 60 * 60;    // 1 hr in-memory cache; persist layer handles longer-term

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

/**
 * SP1 (PR #397): reads the denormalized release_calendar table via
 * direct PostgREST (no edge function on the user path).
 *
 * SP2 (this hook): adds adjacent-month prefetch so navigation feels
 * instant. On every mount and (year, month, region) change, fires
 * parallel prefetches for month-1 and month+1. Each is independent —
 * a failure on one neighbor doesn't affect the current month.
 *
 * Year-boundary handling: January (m=1) prev wraps to (m=12, year-1);
 * December (m=12) next wraps to (m=1, year+1).
 */
export function useReleaseCalendar({
  month,
  year,
  region = 'US',
  enabled = true,
}: UseReleaseCalendarOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const prev = prevMonth(year, month);
    const next = nextMonth(year, month);

    queryClient.prefetchQuery({
      queryKey: ['release-calendar', prev.year, prev.month, region],
      queryFn: () => getReleaseCalendar(prev.month, prev.year, region),
      staleTime: RC_STALE_TIME,
      gcTime: RC_GC_TIME,
    });
    queryClient.prefetchQuery({
      queryKey: ['release-calendar', next.year, next.month, region],
      queryFn: () => getReleaseCalendar(next.month, next.year, region),
      staleTime: RC_STALE_TIME,
      gcTime: RC_GC_TIME,
    });
  }, [year, month, region, enabled, queryClient]);

  return useQuery<ReleaseCalendarResponse, Error>({
    queryKey: ['release-calendar', year, month, region],
    queryFn: () => getReleaseCalendar(month, year, region),
    enabled,
    staleTime: RC_STALE_TIME,
    gcTime: RC_GC_TIME,
  });
}

export function useWatchlistIds(enabled = true) {
  return useQuery<Set<number>, Error>({
    queryKey: ['watchlist-tmdb-ids'],
    queryFn: getWatchlistTmdbIds,
    enabled,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx jest __tests__/hooks/use-release-calendar.test.tsx
```
Expected: PASS, all 6 assertions green.

- [ ] **Step 5: Run lint and tsc**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-release-calendar.ts __tests__/hooks/use-release-calendar.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): prefetch adjacent months for instant navigation

useReleaseCalendar now fires parallel prefetches for month-1 and month+1
on every mount and (year, month, region) change. Year boundaries handled.
PostgREST queries against the denormalized release_calendar table are
~150-300ms each — three parallel = same wall time, dramatically faster
month-flip UX.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `CalendarGridSkeleton` in `components/calendar/calendar-grid.tsx`

**Files:**
- Test: `__tests__/components/calendar/calendar-grid.test.tsx` (new)
- Modify: `components/calendar/calendar-grid.tsx`

- [ ] **Step 1: Read the current `calendar-grid.tsx` to identify the loading-state region**

Run:
```bash
grep -n "ActivityIndicator\|isLoading\|CalendarGridSkeleton" components/calendar/calendar-grid.tsx
```

Note the line numbers for the `ActivityIndicator` import and the `{isLoading && (...)` render block. You'll be removing both.

- [ ] **Step 2: Write the failing test**

Create `__tests__/components/calendar/calendar-grid.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import CalendarGrid from '@/components/calendar/calendar-grid';

// Mock theme context so colors resolve without a provider tree.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

const baseProps = {
  year: 2026,
  month: 4,
  selectedDate: null,
  onSelectDate: jest.fn(),
  onMonthChange: jest.fn(),
};

describe('CalendarGrid — skeleton wiring', () => {
  it('renders CalendarGridSkeleton when isLoading is true and no dates exist', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={[]}
        isLoading
      />
    );

    expect(getByTestId('calendar-grid-skeleton')).toBeTruthy();
    expect(queryByTestId('calendar-grid')).toBeNull();
  });

  it('renders the actual grid when data exists, even during background refetch', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={['2026-04-15']}
        isLoading
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
    expect(queryByTestId('calendar-grid-skeleton')).toBeNull();
  });

  it('renders the actual grid when not loading and no data (empty month state)', () => {
    const { getByTestId, queryByTestId } = render(
      <CalendarGrid
        {...baseProps}
        datesWithReleases={[]}
        isLoading={false}
      />
    );

    expect(getByTestId('calendar-grid')).toBeTruthy();
    expect(queryByTestId('calendar-grid-skeleton')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
npx jest __tests__/components/calendar/calendar-grid.test.tsx
```
Expected: FAIL with `Unable to find an element with testID: calendar-grid-skeleton` (the testID doesn't exist; the skeleton isn't wired).

- [ ] **Step 4: Add `testID` to the existing `CalendarGridSkeleton`**

Edit `components/calendar/calendar-skeleton.tsx`. Find the `CalendarGridSkeleton` function's outer `<View style={gridStyles.container}>` and add `testID="calendar-grid-skeleton"`:

```tsx
function CalendarGridSkeleton({ cardColor, shimmerColor }: CalendarGridSkeletonProps) {
  return (
    <View style={gridStyles.container} testID="calendar-grid-skeleton">
      {/* ...existing children unchanged... */}
    </View>
  );
}
```

If `CalendarGridSkeleton` is not currently exported, add `export` to its declaration so `calendar-grid.tsx` can import it:

```tsx
export function CalendarGridSkeleton({ cardColor, shimmerColor }: CalendarGridSkeletonProps) {
```

- [ ] **Step 5: Update `components/calendar/calendar-grid.tsx`**

Open `components/calendar/calendar-grid.tsx`. Make four changes:

**Change 1** — remove `ActivityIndicator` from the `react-native` import:

```tsx
// before
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
// after
import { View, Text, Pressable, StyleSheet } from 'react-native';
```

**Change 2** — add the skeleton import:

```tsx
import { CalendarGridSkeleton } from './calendar-skeleton';
```

**Change 3** — find the outermost rendered container in the component (a `<View>` that wraps the month-header + weekday-row + grid). Add `testID="calendar-grid"` to it:

```tsx
return (
  <View style={styles.container} testID="calendar-grid">
    {/* existing children unchanged */}
  </View>
);
```

(If the outermost element isn't a `View` — say, it's the month-header `Pressable` row at the top level — add a wrapping `View` with the testID. Most likely the outermost `View` already exists; just add the testID prop.)

**Change 4** — add the skeleton-gate at the top of the JSX return. Place it BEFORE the existing `return (<View ...>)` block:

```tsx
const colors = Colors[effectiveTheme];

if (isLoading && datesWithReleases.length === 0) {
  return (
    <CalendarGridSkeleton
      cardColor={colors.card}
      shimmerColor={colors.backgroundSecondary}
    />
  );
}

return (
  <View style={styles.container} testID="calendar-grid">
    {/* existing children unchanged */}
  </View>
);
```

**Change 5** — remove the existing `{isLoading && (<ActivityIndicator ...>)}` block from inside the grid's JSX. It's the block we identified in Step 1.

Also drop the `styles.loading` StyleSheet entry if it was only used by the removed `ActivityIndicator`.

- [ ] **Step 6: Run test to verify it passes**

Run:
```bash
npx jest __tests__/components/calendar/calendar-grid.test.tsx
```
Expected: PASS, all 3 assertions green.

- [ ] **Step 7: Run the full test suite to verify no regressions in other consumers**

Run:
```bash
npm test -- --silent
```
Expected: all tests pass (818 baseline + ~18 new from Tasks 2-4 = ~836 total).

- [ ] **Step 8: Run lint and tsc**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors, 0 new warnings. The removed `ActivityIndicator` should no longer appear; `CalendarGridSkeleton` is the only new reference.

- [ ] **Step 9: Commit**

```bash
git add components/calendar/calendar-grid.tsx components/calendar/calendar-skeleton.tsx __tests__/components/calendar/calendar-grid.test.tsx
git commit -m "$(cat <<'EOF'
feat(calendar): swap ActivityIndicator overlay for CalendarGridSkeleton

Skeleton now renders only on true initial load (isLoading + zero dates).
When persisted cache hydrates, the existing grid renders immediately and
background refetch happens silently — eliminating the spinner-overlay
that previously flashed on every mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Persistence filter integration test

**Files:**
- Test: `__tests__/lib/query-persistence.test.tsx` (new)

This test verifies that the dehydrate filter actually keeps non-`release-calendar` queries OUT of AsyncStorage when the library runs end-to-end. Unit testing the filter (Task 2) confirms the function returns the right boolean; this test confirms the library applies that boolean correctly through its dehydration pipeline.

- [ ] **Step 1: Write the integration test**

Create `__tests__/lib/query-persistence.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/lib/release-calendar-service', () => ({
  getReleaseCalendar: jest.fn().mockResolvedValue({
    days: [],
    dates_with_releases: ['2026-04-15'],
    total_results: 1,
  }),
  getWatchlistTmdbIds: jest.fn().mockResolvedValue(new Set()),
}));

// react-native-toast-message has no real test backend; stub it.
jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

import { QueryProvider, RQ_PERSIST_KEY } from '@/lib/query-client';
import { useReleaseCalendar } from '@/hooks/use-release-calendar';

function CalendarConsumer() {
  const { data } = useReleaseCalendar({ month: 4, year: 2026 });
  return <>{data ? 'has-data' : 'no-data'}</>;
}

function NonPersistedConsumer() {
  const { data } = useQuery({
    queryKey: ['userMovies', 'test-user'],
    queryFn: async () => 'sensitive-payload',
  });
  return <>{data ?? 'no-data'}</>;
}

function readPersistedQueryKeys(stored: string | null): string[] {
  if (stored === null) return [];
  const parsed = JSON.parse(stored) as {
    clientState?: { queries?: Array<{ queryKey: unknown[] }> };
  };
  const queries = parsed.clientState?.queries ?? [];
  return queries
    .map((q) => q.queryKey?.[0])
    .filter((k): k is string => typeof k === 'string');
}

describe('query-client persistence integration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists release-calendar query data to AsyncStorage', async () => {
    const { findByText } = render(
      <QueryProvider>
        <CalendarConsumer />
      </QueryProvider>
    );

    await findByText('has-data');

    await waitFor(
      async () => {
        const stored = await AsyncStorage.getItem(RQ_PERSIST_KEY);
        const keys = readPersistedQueryKeys(stored);
        expect(keys).toContain('release-calendar');
      },
      { timeout: 3000 }
    );
  });

  it('does NOT persist non-release-calendar queries (filter whitelist)', async () => {
    const { findByText } = render(
      <QueryProvider>
        <CalendarConsumer />
        <NonPersistedConsumer />
      </QueryProvider>
    );

    await findByText('has-data');
    await findByText('sensitive-payload');

    await waitFor(
      async () => {
        const stored = await AsyncStorage.getItem(RQ_PERSIST_KEY);
        const keys = readPersistedQueryKeys(stored);
        expect(keys).toContain('release-calendar');
        expect(keys).not.toContain('userMovies');
      },
      { timeout: 3000 }
    );
  });
});
```

**Why the timeout:** `PersistQueryClientProvider` throttles dehydrate writes (default ~1 second). The `waitFor` polls every 50ms by default, so 3000ms is comfortably above the dehydrate cadence.

**Why `readPersistedQueryKeys` parses defensively:** the library's persisted JSON shape is `{ buster, timestamp, clientState: { queries: [...] } }`. Extracting just the `queryKey[0]` strings sidesteps brittle deep-shape assertions.

- [ ] **Step 2: Run test to verify it passes**

Run:
```bash
npx jest __tests__/lib/query-persistence.test.tsx
```

Expected: PASS, both assertions green within ~3 seconds.

If the test times out, the most likely cause is the `PersistQueryClientProvider` not flushing dehydrates within the test window. Diagnose by adding a `console.log` inside the `waitFor` callback to see what's in AsyncStorage. If the library's default throttle is too slow, you can pass `persistOptions.persister` a custom `throttleTime: 100` config — but try the default first.

- [ ] **Step 3: Run lint and tsc**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add __tests__/lib/query-persistence.test.tsx
git commit -m "$(cat <<'EOF'
test(calendar): integration test confirms filter blocks non-release-calendar persistence

Mounts QueryProvider with two consumers (release-calendar via the hook,
userMovies via inline useQuery) and asserts only the release-calendar
query lands in AsyncStorage. This verifies the dehydrateOptions filter
is correctly applied end-to-end through the persist library's pipeline,
not just in isolation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pre-PR verification gate (full clean run)

**Files:** None (verification only)

- [ ] **Step 1: Run lint, typecheck, and full test suite together**

Run:
```bash
npm run lint && npx tsc --noEmit && npm test -- --silent
```

Expected output:
- Lint: 0 errors. Pre-existing warnings in unrelated files (e.g. `components/ads/native-feed-ad.tsx`) are OK — they were there before SP2.
- TSC: zero output (clean).
- Test: all green, ~836 tests passing.

- [ ] **Step 2: If anything fails, do NOT proceed**

Diagnose the failure. Common issues:
- Missing import in `lib/query-client.tsx` for `Query` type → add `import type { Query } from '@tanstack/react-query';`
- Test file uses `.tsx` but imports a `.ts` source — fine; check the path uses `@/` alias correctly.
- Skeleton testID mismatch — re-read Task 4 Step 4 carefully.

Fix and re-run until all three commands pass.

- [ ] **Step 3: Confirm git status is clean (only the expected commits)**

Run:
```bash
git status && git log --oneline origin/main..HEAD
```

Expected commit list (in order):
1. `docs: SP2 release calendar client cache hierarchy design spec`
2. `chore(deps): add react-query persist-client + async-storage persister`
3. `feat(calendar): persist release-calendar queries via AsyncStorage`
4. `feat(calendar): prefetch adjacent months for instant navigation`
5. `feat(calendar): swap ActivityIndicator overlay for CalendarGridSkeleton`
6. `test(calendar): integration test confirms filter blocks non-release-calendar persistence`

Plus the plan document commit (added before Task 1 as part of brainstorming → writing-plans handoff).

---

## Task 7: Web bundle leak smoke test

**Files:** None (smoke test only)

- [ ] **Step 1: Build the web bundle**

Run:
```bash
npx expo export --platform web 2>&1 | tail -10
```

Expected: build completes with no errors. Output ends with something like `Web Bundling complete in Xs`.

- [ ] **Step 2: Confirm AsyncStorage shim is the only AsyncStorage reference in the web bundle**

Run:
```bash
grep -rl "react-native-async-storage" dist/ | head -5
```

Expected: only the AsyncStorage shim chunk (a single `.js` file). The shim falls back to `localStorage` on web — that's intentional.

If you see references in unexpected files (e.g. native-only modules being pulled into the web bundle), investigate. The persist library should resolve to AsyncStorage's web shim transparently.

- [ ] **Step 3: Confirm React Query persist library is in the web bundle**

Run:
```bash
grep -rl "react-query-persist-client\|query-async-storage-persister" dist/ | head -5
```

Expected: present in the web bundle (the libraries don't have native-only dependencies).

- [ ] **Step 4: Clean up the dist directory (do not commit it)**

Run:
```bash
rm -rf dist/
git status
```

Expected: `git status` shows no `dist/` artifacts. (`dist/` should already be gitignored — confirm by running `git check-ignore dist`. If not gitignored, that's pre-existing and out of scope.)

- [ ] **Step 5: No commit needed for this task**

Web bundle smoke is purely diagnostic. Move on.

---

## Task 8: Device validation checklist (manual — Tyshane runs these)

**Files:** None (manual verification)

This task is performed by Tyshane on a physical iPhone or iOS Simulator with a debug build. The agent should produce this checklist as a hand-off document and not attempt to run device validation.

- [ ] **Cold launch with cache** — Open app once on a logged-in account, scroll the calendar, kill the app from the app-switcher, reopen.
  - **Expected:** calendar renders filled with previous data instantly, no skeleton. Within ~300ms, fresh data from PostgREST silently swaps in (visible by adding `console.log` to `getReleaseCalendar` for the test).

- [ ] **Cold launch fresh install** — Wipe app data (Settings → CineTrak → Delete Data, or full reinstall). Open app.
  - **Expected:** `CalendarGridSkeleton` renders briefly (visible pulse animation), real data swaps in after the first PostgREST query lands.

- [ ] **Month flip instant** — Land on the current month. Tap the next-month chevron.
  - **Expected:** next month renders instantly, no skeleton, no `ActivityIndicator`. Tap next again — should still be instant if the prefetch had time to fire (typically does within the first month's render). On a third forward tap, the new month may briefly skeleton if the prefetch hasn't completed; this is fine.

- [ ] **Year-boundary flip** — Navigate to December (or set device clock to mid-November so December is "next" for testing). Tap next chevron.
  - **Expected:** January of next year renders. Subsequent prev should be instant (December is now cached); next should prefetch February.

- [ ] **Offline >7d simulation** — Set device clock forward 8 days from the last open. Reopen app.
  - **Expected:** Skeleton on cold launch (cache expired by `maxAge`), fresh fetch lands, data populates. Reset clock to current time after testing.

- [ ] **Hydration time** — On a TestFlight build or release configuration (not dev), measure time from launch tap to first calendar render.
  - **Expected:** <300ms p50 (hydration ~50–100ms + first React paint). Subjectively "instant."

- [ ] **Background refetch** — With cached data displayed, pull-to-refresh (if implemented) or simply leave the screen open for >30 minutes.
  - **Expected:** silent refetch, no spinner, data updates in place if anything changed.

If any of these fail, file a follow-up bug and gate PR merge on the fix.

---

## Task 9: PR prep + push

**Files:** None (git operations only)

- [ ] **Step 1: Confirm clean state**

Run:
```bash
git status && git log --oneline origin/main..HEAD
```

Expected: clean working tree, 5+ commits ahead of `origin/main`.

- [ ] **Step 2: Push the branch**

Run:
```bash
git push -u origin feat/release-calendar-sp2-cache-hierarchy
```

Expected: branch pushed, upstream tracking set.

- [ ] **Step 3: Open PR via gh CLI**

Run:
```bash
gh pr create --title "feat(calendar): SP2 client cache hierarchy (persist + prefetch + skeleton)" --body "$(cat <<'EOF'
## Summary
- Persist `release-calendar` queries to AsyncStorage with 7-day TTL via `@tanstack/react-query-persist-client`. Whitelist filter prevents accidental persistence of PII or volatile state.
- Prefetch month-1 and month+1 in parallel on every mount and `(year, month, region)` change. Year boundaries handled. PostgREST queries against the denormalized `release_calendar` table are ~150-300ms — three parallel = same wall time, instant month-flip UX.
- Replace `ActivityIndicator` overlay in `calendar-grid.tsx` with the existing `CalendarGridSkeleton`, gated on true initial load (`isLoading && datesWithReleases.length === 0`). Hydrated cache renders immediately; background refetch happens silently.

Builds on SP1 (PR #397). Spec: `docs/superpowers/specs/2026-04-26-release-calendar-sp2-cache-hierarchy-design.md`. Plan: `docs/superpowers/plans/2026-04-26-release-calendar-sp2-cache-hierarchy.md`.

## Test plan
- [x] `npm run lint && npx tsc --noEmit && npm test` — all green (~836 tests, 0 errors)
- [x] Web bundle smoke test — `expo export --platform web` produces clean bundle, AsyncStorage falls back to localStorage shim, no native module leak
- [ ] iOS device — cold launch with cache (instant), cold launch fresh (skeleton), month flip ±1 (instant), year-boundary flip (Dec→Jan), offline >7d (skeleton + refetch), hydration <300ms p50
- [ ] iOS Simulator parity check — same checklist on simulator

## Out of scope
- SP3 (virtualization, transitions), SP4 (notifications, widget, multi-region, iCal)
- Persisting other queries beyond `release-calendar` (one-line filter expansion when needed)
- Orphan `get-release-calendar` edge function deletion (deferred per 2026-04-26 daily note)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: returns PR URL.

- [ ] **Step 4: Capture the PR URL for the daily note**

Note the URL printed by `gh pr create`. It'll be of the form `https://github.com/TyShaneONeill/movie-tracker/pull/<N>`. Save this for the next session's daily note update.

- [ ] **Step 5: Hand off to Tyshane for device validation + final code review + merge**

The PR is now open. Tyshane:
1. Runs the device validation checklist from Task 7
2. Triggers a final code-review agent (Opus) on the PR
3. Merges if green

---

## Self-review notes

The plan covers:
- All 5 spec sections (deps, query-client wiring, hook prefetch, skeleton, integration testing)
- Year boundaries (Jan/Dec) — explicit test cases
- Web platform (smoke test in Task 6)
- Device validation (manual checklist in Task 7)
- PR prep (Task 8)

Each task is a single coherent commit. Tasks 1-4 follow strict TDD (failing test → impl → passing test → commit). Tasks 5-8 are verification/handoff.

No placeholders — every code block contains the actual code an engineer would write. No "similar to Task N" references. No "add error handling" hand-waves.

If a future contributor changes `ReleaseCalendarResponse` shape, they need to bump `RQ_PERSIST_BUSTER` in `lib/query-client.tsx`. That's documented in the buster's JSDoc and reinforced in PR review.
