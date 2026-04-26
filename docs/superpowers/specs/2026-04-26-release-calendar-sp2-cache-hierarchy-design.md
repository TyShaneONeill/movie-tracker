# Release Calendar SP2: Client Cache Hierarchy — Design Spec

**Date:** 2026-04-26
**Status:** Ready for plan
**Feature:** Make the calendar feel instant — persist React Query cache to AsyncStorage, prefetch adjacent months, wire skeleton loaders
**Parent initiative:** "Enterprise-grade release calendar" (SP2 of 4)
**Companion follow-ups:** SP3 (UX polish — virtualization, transitions), SP4 (notifications, trailers, widget, multi-region) — out of scope for this spec
**Builds on:** [SP1 — Release Calendar Foundation](./2026-04-23-release-calendar-foundation-design.md) (PR #397)

## Context

SP1 shipped the foundation: `release_calendar` denormalized table read via direct PostgREST, daily pg_cron warming, RLS enabled. Read latency dropped from 10–30s cold / 500ms–1s warm to <300ms warm. Foundation is solid.

What SP1 explicitly deferred to SP2:

- **Cold-launch hydration** — every cold launch hits the network; the calendar shows a blank state until PostgREST returns. Even <300ms feels worse than instant.
- **Adjacent-month prefetch** — navigating from April to May fires a fresh query, blocking the user behind a 200ms loader. The user knows what month is next; we should already have it.
- **Skeleton loaders** — `calendar-grid.tsx` currently overlays `ActivityIndicator` on `isLoading`. A skeleton component (`CalendarGridSkeleton`) already exists in the codebase from SP1's component scaffolding but isn't wired up. Day list (`ReleaseDayListSkeleton`) is wired.
- **React Query tuning** — `staleTime: 30min`, `gcTime: 1hr` were set without persistence in mind.

Goal: calendar opens **instantly** with last-known data on cold launch, navigates between months **without a loader**, and never shows a blank screen.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| Persistence approach | Official `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`, scoped via `dehydrateOptions.shouldDehydrateQuery` to `release-calendar` keys only |
| Persisted cache TTL | 7 days (`maxAge`) |
| Cache version buster | `'1'` initially; bump on `ReleaseCalendarResponse` shape changes |
| AsyncStorage key | `cinetrak-rq-cache-v1` (library-managed; this is the persister key, not a per-query key) |
| Prefetch trigger | Inside `useReleaseCalendar` hook — fires `month-1` and `month+1` in parallel on every mount and month change |
| Year-boundary handling | Jan (m=1): prev = (m=12, year-1). Dec (m=12): next = (m=1, year+1) |
| Loading UI | `CalendarGridSkeleton` + `ReleaseDayListSkeleton` when `isPending` (no data anywhere). Silent background refetch when `isFetching` only — no spinner, no overlay. |
| `staleTime` / `gcTime` | Unchanged (30 min / 1 hr respectively) |
| Provider variant | `PersistQueryClientProvider` (blocking — children render only after hydration completes; ~50–100ms) |
| Filter scope | Whitelist `release-calendar` keys only. Future expansion is a one-line OR change. |

## Scope

### 1. Add persistence dependencies

```bash
npm install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister
```

Both are first-party TanStack packages. AsyncStorage backend (`@react-native-async-storage/async-storage` ^2.2.0) is already installed.

### 2. Update `lib/query-client.tsx`

Replace `QueryClientProvider` with `PersistQueryClientProvider`. Configure persister with AsyncStorage backend, 7d maxAge, version buster, and dehydrate filter.

**Skeleton of the change:**

```tsx
import { QueryClient, MutationCache } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import type { ReactNode } from 'react';

const RQ_PERSIST_BUSTER = '1'; // bump on ReleaseCalendarResponse shape change
const RQ_PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'cinetrak-rq-cache-v1',
  // Throttle defaults to 1000ms — fine. Library debounces dehydrate writes.
});

const mutationCache = new MutationCache({
  // ... existing toast handler unchanged
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      // ... rest unchanged
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
          shouldDehydrateQuery: (query) =>
            query.queryKey[0] === 'release-calendar',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

**Why a whitelist filter, not blacklist:** we explicitly opt-in queries to persistence. Avoids accidentally writing PII (auth tokens, profile data) or volatile state (mutation results, paginated infinite queries) to disk. Future expansion (e.g. SP4 might want `watchlist-tmdb-ids` persisted for instant calendar dot rendering) is a one-line change.

**Why bumping the buster discards old cache:** when `ReleaseCalendarResponse` shape changes (e.g. SP4 adds a new `release_type`), old cached data deserializes into stale shapes that could crash render. Bump the buster, library drops old cache automatically. Comment must point to the response type to make this discoverable.

### 3. Update `hooks/use-release-calendar.ts`

Add prefetch effect that fires on mount and on `(year, month, region)` change.

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

const RC_STALE_TIME = 1000 * 60 * 30; // 30 min
const RC_GC_TIME = 1000 * 60 * 60;    // 1 hr

/**
 * Compute the previous (year, month) tuple, handling January wraparound.
 */
function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Compute the next (year, month) tuple, handling December wraparound.
 */
function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function useReleaseCalendar({
  month,
  year,
  region = 'US',
  enabled = true,
}: UseReleaseCalendarOptions) {
  const queryClient = useQueryClient();

  // Prefetch adjacent months in parallel so month navigation is instant.
  // Fires on mount and whenever (year, month, region) changes.
  // Each prefetch is independent — failures don't affect the current month.
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
    staleTime: 1000 * 60 * 5,
  });
}
```

**Why the hook owns prefetch, not the screen:** encapsulation. `useReleaseCalendar` becomes "the thing that fetches a month and is ready for the user to flip ±1 months instantly." Future consumers (e.g. a "coming this week" carousel in SP4 that wants the same prefetch behavior) get it for free.

**Why parallel, not sequential:** PostgREST queries against the denormalized table are ~150–300ms each. Three parallel = same wall time as one sequential. pg_cron has already done the expensive TMDB roundtrips overnight; the cost of three concurrent SELECTs is negligible. The user's perceived navigation latency drops to zero.

**Why `prefetchQuery` instead of additional `useQuery` calls:** prefetch hydrates the cache without subscribing the component to the query. We don't want to render the prev/next month — we just want their data ready. Three subscriptions would also cause re-renders when prev/next change.

### 4. Update `components/calendar/calendar-grid.tsx`

Replace the `ActivityIndicator` overlay with `CalendarGridSkeleton` rendered in place of the grid when there's no data.

**Current behavior:**
```tsx
{isLoading && (
  <ActivityIndicator size="large" color={colors.tint} style={styles.loading} />
)}
```

This overlays a spinner on top of the existing grid even when data is hydrated and only a background refetch is happening — defeats the "instant" goal.

**New behavior:**

```tsx
import { CalendarGridSkeleton } from './calendar-skeleton';

// inside CalendarGrid, before the existing return:
if (isLoading && datesWithReleases.length === 0) {
  return <CalendarGridSkeleton cardColor={colors.card} shimmerColor={colors.backgroundSecondary} />;
}

// existing JSX renders unchanged below
```

The gate `isLoading && datesWithReleases.length === 0` ensures the skeleton only shows on **true initial load** (no data anywhere). When persisted cache hydrates, `datesWithReleases` is non-empty even if `isLoading` is briefly true → existing grid renders → background refetch happens silently → data updates in place.

Drop the `ActivityIndicator` import since it's the only consumer.

`ReleaseDayListSkeleton` is already wired in `release-day-list.tsx` and works correctly with `isPending` semantics — no change needed there.

### 5. App layout integration

`lib/query-client.tsx`'s `QueryProvider` is the only consumer touched. The provider tree in `app/_layout.tsx` doesn't need changes — `QueryProvider` already wraps the app, and swapping its internals is transparent to callers.

## Data flow

### Cold-launch (the marquee scenario)

```
1. App launches. lib/query-client.tsx mounts PersistQueryClientProvider.
2. Persister reads AsyncStorage["cinetrak-rq-cache-v1"]. ~50-100ms warm.
3. Validates buster string and maxAge (7d).
   - buster mismatch OR cache > 7d old → drop, treat as fresh install
   - both valid → restore cache into in-memory QueryClient
4. Children render. release-calendar.tsx mounts.
5. useReleaseCalendar fires useQuery for current month.
   - Cache hit (data restored): isPending: false. Calendar renders immediately
     with last-known data.
   - Cache miss (first install / >7d): isPending: true. CalendarGridSkeleton
     and ReleaseDayListSkeleton render.
6. Hook's prefetch effect fires for month-1 and month+1.
   Each prefetch independently hits cache or fetches network.
7. Anything stale (>30min) triggers silent background refetch.
   When fresh data lands, RQ swaps it in; React re-renders.
```

### Month navigation

Concrete example: user is on April 2026; taps next chevron.

```
1. handleMonthChange(2026, 5) fires.
2. Screen state updates: month=5, year=2026. useReleaseCalendar re-runs.
3. useQuery checks key ['release-calendar', 2026, 5, 'US']:
   - HIT (May was prefetched as April's neighbor): instant render, no
     skeleton.
   - MISS (rare — user jumped multiple months via picker): skeleton
     until fetch lands.
4. Hook's prefetch effect re-fires for May's neighbors:
   - April (2026, 4): cache HIT (was the previous current month).
   - June (2026, 6): cache MISS → PostgREST fetch fires silently.
5. Background refetch on the current month if its data is stale.
```

### App background → reopen

```
1. App backgrounded. PersistQueryClientProvider's internal throttled
   dehydrate handler flushes filtered cache to AsyncStorage. Library
   manages this — we don't write code for it.
2. User reopens within minutes: in-memory cache still warm, no hydration.
3. User reopens hours/days later: process killed, in-memory cache gone.
   Re-runs cold-launch flow above.
```

## Error handling

| Failure mode | Behavior |
|---|---|
| AsyncStorage read fails (permissions, corruption) | Persister returns null. App behaves as fresh install. Skeleton on launch. No user-visible error. |
| AsyncStorage write fails (full disk) | Library logs internally. App keeps working from in-memory cache. Next session is a fresh install. Silent. |
| Persisted JSON corrupted | Parse fails inside library; treated as cache miss. Silent. |
| Buster bump (shape change) | Old cache discarded automatically. Fresh fetch. Skeleton on first launch post-bump. |
| Cache > 7d maxAge | Discarded automatically by library. Fresh fetch. Skeleton. |
| Prefetch query fails (network, server) | Silent. Affects only the neighbor; current month is unaffected. RQ retries on next mount per default `retry: 3`. |
| Current-month fetch fails AFTER hydrated data shown | Stale data stays on screen. RQ's default retry behavior kicks in. No user-facing error toast (queries fail silently in this app — fine for read-only data). |
| Web platform compatibility | `@react-native-async-storage/async-storage` falls back to localStorage on web. Persister works on web identically. Bundle smoke test confirms no native-module leak. |

## Testing

### Unit — hook prefetch behavior

`__tests__/hooks/use-release-calendar.test.tsx` (new):

- Mounts hook with `(month=4, year=2026)`, asserts `queryClient.prefetchQuery` called with keys `['release-calendar', 2026, 3, 'US']` and `['release-calendar', 2026, 5, 'US']`.
- Updates props to `(month=5, year=2026)`, asserts new prefetches fire for keys `['release-calendar', 2026, 4, 'US']` and `['release-calendar', 2026, 6, 'US']`.
- Year-boundary January: `(month=1, year=2026)` → prefetches `(month=12, year=2025)` and `(month=2, year=2026)`.
- Year-boundary December: `(month=12, year=2026)` → prefetches `(month=11, year=2026)` and `(month=1, year=2027)`.
- Disabled hook (`enabled: false`): no prefetches fire.
- Mock `getReleaseCalendar` so we don't hit network in unit tests. Use `QueryClient` test helper from `@tanstack/react-query`.

### Unit — persister config

Extend `__tests__/lib/query-client.test.ts` (or create if absent):

- Asserts `dehydrateOptions.shouldDehydrateQuery` returns `true` for `{ queryKey: ['release-calendar', 2026, 4, 'US'] }`.
- Asserts it returns `false` for `{ queryKey: ['watchlist-tmdb-ids'] }`, `{ queryKey: ['userMovies'] }`, etc.
- Asserts buster constant is `'1'` and maxAge is `7 * 24 * 60 * 60 * 1000`.

### Unit — calendar-grid skeleton wiring

`__tests__/components/calendar/calendar-grid.test.tsx` (new or extend):

- Renders with `isLoading: true, datesWithReleases: []` → asserts `CalendarGridSkeleton` is in the tree, the actual grid is not.
- Renders with `isLoading: true, datesWithReleases: ['2026-04-15']` → asserts the actual grid renders, `CalendarGridSkeleton` is not. (Background refetch case: hydrated data wins.)
- Renders with `isLoading: false, datesWithReleases: []` → asserts the actual grid renders (empty month state).
- Confirms no `ActivityIndicator` import remains.

### Integration — cache lifecycle

`__tests__/lib/query-persistence.test.tsx` (new):

- Mock AsyncStorage with `@react-native-async-storage/async-storage/jest/async-storage-mock`.
- Mount `QueryProvider` wrapping a test component that uses `useReleaseCalendar({ month: 4, year: 2026 })`.
- Resolve query with mock data, then dehydrate. Assert AsyncStorage now has data under `cinetrak-rq-cache-v1`.
- Unmount and remount provider. Assert hydration restored the cached data without a fresh fetch (queryClient state has the data immediately).
- Asserts non-`release-calendar` queries (e.g. mock a `userMovies` query) are NOT persisted.

### Device validation

| Scenario | Steps | Expected |
|---|---|---|
| Cold launch with cache | Open app, scroll calendar, kill app from app-switcher, reopen. | Calendar renders filled instantly, no skeleton. Background refetch logs visible in dev console. |
| Cold launch fresh install | Wipe app data / fresh install. Open app. | Skeleton renders briefly, then real data swaps in. |
| Month flip instant | Land on April. Tap next chevron. | May renders instantly (no skeleton, no spinner). Tap next again to June — skeleton briefly, since June was not yet a neighbor of April. |
| Year-boundary flip | Navigate to Dec 2026. Tap next chevron. | Jan 2027 renders. Then prev = Dec 2026 (cached), next = Feb 2027 (prefetched). |
| Offline >7d simulation | Set device clock forward 8 days from last open. Reopen app. | Skeleton (cache expired), fresh fetch. |
| Web bundle leak | `npx expo export --platform web && grep -r 'react-native-async-storage' dist/ \| head` | Only the AsyncStorage shim in the bundle, no native modules leak. |
| Hydration time | Open app, observe time-to-first-render of calendar. | <300ms p50 (hydration ~50-100ms + first React paint). |

### Pre-PR gate

```bash
npm run lint && npx tsc --noEmit && npm test
```

All three must pass. Existing baseline before SP2 changes: 818 tests, 0 lint errors, 0 TSC errors.

## Out of scope

- **SP3** — virtualized release-day list, smoother month-transition animations, gesture-based month swipe
- **SP4** — release notifications, trailer thumbnails, my-releases filter, multi-region user preferences, iCal export, home-screen widget integration, "coming this week" carousel
- **Persisting other queries beyond `release-calendar`** — `watchlist-tmdb-ids`, `taste-profile`, `userMovies`, etc. The dehydrate filter is intentionally narrow. Future expansion is a one-line OR change.
- **Orphan `get-release-calendar` edge function deletion** — deferred per 2026-04-26 daily note. Stays deployed at zero cost; deletion requires either 7+ days of 0 invocations or confirmed post-#397 App Store rollout.
- **Web-only persistence using IndexedDB** — AsyncStorage's localStorage shim is sufficient for the calendar's data sizes (~10-50KB per month). If we ever want offline-first with larger datasets, that's a future concern.
- **Cache invalidation push from server** — no Supabase realtime channel for `release_calendar` table changes. Daily refetch + 30min staleTime is sufficient.
- **Cross-device cache sync** — each install has its own AsyncStorage. No cloud-sync of persisted React Query cache.
- **Tuning `staleTime` / `gcTime`** — current values (30 min / 1 hr) work correctly with persistence. Hydrated data carries its `dataUpdatedAt`; if >30min old, RQ marks stale and silently refetches. Tuning would save at most 1-2 PostgREST queries per user per day — not material.
- **Per-month TTLs** — uniform 7d maxAge across all persisted release-calendar queries. Per-month logic adds complexity without measurable user benefit.
- **Skeleton design changes** — both `CalendarGridSkeleton` and `ReleaseDayListSkeleton` already exist with appropriate visual treatment. Wiring only.

## Risks

- **Hydration time** — if AsyncStorage read takes >300ms on a slow device, app launch feels slower than the current "render-then-fetch" pattern. Mitigation: measure on device. If problematic, fall back to non-blocking `persistQueryClient` (children render with empty cache, hydration races the fetch). Likely a non-issue (sub-100ms in normal conditions on iPhone 12+).
- **Buster bump discipline** — if a future contributor changes `ReleaseCalendarResponse` shape without bumping the buster, hydrated cache could deserialize into an inconsistent shape and crash render. Mitigation: comment on the buster constant pointing at the response type. Code review catch in PR template.
- **AsyncStorage capacity** — iOS has a 6MB cap per app. Persisted cache is ~10-50KB per month × 4-5 months max = ~250KB worst case. Far under cap. No risk.
- **Library compatibility** — `@tanstack/react-query-persist-client` requires `@tanstack/react-query` ^5.x. Already on ^5.90.16. Compatible.
- **Web platform** — AsyncStorage falls back to localStorage on web, which has a 5-10MB cap and synchronous semantics. Library handles this transparently. Bundle smoke test confirms no native module leak.

## Dependencies / sequencing

Depends on:
- SP1 shipped (PR #397) ✓ — `release_calendar` table exists with denormalized columns, client reads via PostgREST
- `@tanstack/react-query` ^5.x ✓ already on 5.90.16
- `@react-native-async-storage/async-storage` ^2.x ✓ already on 2.2.0

Unblocks:
- SP3 month-transition animations can rely on prefetched neighbor data
- SP4 home-screen widget can reuse the persisted cache for its read path (one-line filter expansion)
- SP4 "coming this week" carousel can reuse `useReleaseCalendar` hook directly

## References

- [SP1 Release Calendar Foundation Design](./2026-04-23-release-calendar-foundation-design.md) — `docs/superpowers/specs/2026-04-23-release-calendar-foundation-design.md`
- PR #397 — https://github.com/TyShaneONeill/movie-tracker/pull/397
- TanStack persist-client docs — https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- AsyncStorage 2.x — https://react-native-async-storage.github.io/async-storage/
- Existing AsyncStorage pattern reference — `lib/widget-cache.ts` (defensive parse, silent fail)
