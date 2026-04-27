# SP4-A: My-Releases Filter — Design Spec

**Date:** 2026-04-26
**Status:** Ready for plan
**Feature:** Toggle switch in the existing calendar filter sheet that limits the calendar (both grid dots and day-list cards) to only releases the user has added to their watchlist.
**Parent initiative:** "Enterprise-grade release calendar" (SP4 of 4 — first slice)
**Builds on:** [SP1 — Release Calendar Foundation](./2026-04-23-release-calendar-foundation-design.md), [SP2 — Client Cache Hierarchy](./2026-04-26-release-calendar-sp2-cache-hierarchy-design.md), [SP3 — UX Polish](./2026-04-26-release-calendar-sp3-ux-polish-design.md)

## Context

After SP3, the calendar is fast, instant, and animates smoothly. But it shows **every** release for the user's region — generic feed, not personal. Users with full watchlists see them as gold dots among many red dots; the calendar isn't yet "their" calendar.

SP4 was originally scoped as 7 features (notifications, trailers, my-releases, multi-region, iCal, widget, "coming this week"). Each is its own PR. **This spec covers only "my-releases filter"** — the highest-leverage-per-hour slice. Other SP4 features deferred to separate specs.

What this adds:
- A `<Switch>` row at the top of the existing filter sheet labeled "Show only my watchlist"
- When ON: calendar grid dots and day-list cards show only releases for movies in the user's watchlist (`user_movies` with `status='watchlist'`)
- When OFF: current behavior (all releases for region)
- Persisted alongside existing type-filter preferences in `profiles.calendar_default_filters`
- Hidden entirely for guest users (no watchlist concept)
- Special empty state when user has zero watchlist items globally and the filter is on

## Design decisions (resolved during brainstorm)

| Decision | Value |
|---|---|
| UX placement | Switch at top of existing filter sheet, above type chips (Q1 Option A) |
| Filter scope | Both grid dots AND day-list cards (Q2 Option A) |
| Default for new authed users | OFF (Q3a) |
| Guest mode | Switch hidden entirely (Q3b) |
| Empty watchlist + filter ON | Special helper message in day list: "Your watchlist is empty. Add movies to your watchlist to see them here." (Q3c) |
| Persistence | Existing `profiles.calendar_default_filters` JSON column, new field `my_watchlist_only: boolean` |
| Filter combination | `watchlistOnly` AND type filters apply together (e.g. "watchlist items that are theatrical") |
| Personalized (taste-matched) dots when filter ON | Show only on days where a watchlist+taste-matched intersection exists |
| Hook abstraction | None — derive filtered views via inline `useMemo`s in the screen. Extracting a hook would be premature. |
| New components | None — the Switch + filter logic fit inside `app/release-calendar.tsx`. The day-list empty-state message gets a new prop. |

## Scope

### 1. `app/release-calendar.tsx` — state + filter logic + UI

**State additions:**
```tsx
const [watchlistOnly, setWatchlistOnly] = useState(false);
```

**Hydration from profile** (extend the existing `useEffect` that loads `calendar_default_filters`):

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

**Persistence on Apply** (extend the existing supabase update in the filter sheet's apply button):

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

**Filter logic — three new derived values via `useMemo`:**

```tsx
// Dates that have at least one release in the user's watchlist
const filteredDatesWithReleases = useMemo(() => {
  if (!data) return [];
  if (!watchlistOnly) return data.dates_with_releases;
  if (!watchlistIds) return [];
  return data.days
    .filter((d) => d.releases.some((r) => watchlistIds.has(r.tmdb_id)))
    .map((d) => d.date);
}, [data, watchlistOnly, watchlistIds]);

// Personalized dots respect the filter — only days with watchlist+taste-matched releases
const filteredPersonalizedDates = useMemo(() => {
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

The existing `selectedDayReleases` `useMemo` gets one more filter clause:

```tsx
const selectedDayReleases = useMemo(() => {
  if (!data || !selectedDate) return [];
  const day = data.days.find((d) => d.date === selectedDate);
  if (!day) return [];
  return day.releases.filter((r) => {
    if (!filterTypes.has(r.release_type)) return false;
    if (watchlistOnly && !(watchlistIds?.has(r.tmdb_id) ?? false)) return false;
    return true;
  });
}, [data, selectedDate, filterTypes, watchlistOnly, watchlistIds]);
```

The existing `watchlistDates` `useMemo` is unchanged — already filters to watchlist days; doubles as the "gold dot" data source. When `watchlistOnly` is true, the visual difference between `datesWithReleases` and `watchlistDates` collapses (both = only watchlist days), but we keep both: `datesWithReleases` drives the red dot, `watchlistDates` drives the gold dot. The grid will show two-color overlap on watchlist days — visually consistent with the un-filtered state.

**`CalendarGrid` props:**

The screen passes the new filtered values:
```tsx
<CalendarGrid
  // ... unchanged props ...
  datesWithReleases={filteredDatesWithReleases}
  watchlistDates={watchlistDates}             // unchanged — already watchlist-only
  personalizedDates={filteredPersonalizedDates}
  // ... unchanged props ...
/>
```

**`CalendarGrid` internals: zero changes.** The component continues to render dots based on the date arrays it receives. We're just changing which dates we pass in.

**Filter sheet UI** — add a `Switch` row above the existing type chips:

```tsx
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
```

Import `Switch` from `react-native`. The `{user &&` gate ensures guest users don't see the row at all.

### 2. `components/calendar/release-day-list.tsx` — empty-state variant

Add a new optional prop `watchlistOnlyEmpty?: boolean`. When true, the existing empty-state message changes:

```tsx
// existing default
<Text>No releases on this date</Text>
<Text>Check another day or adjust your filters</Text>

// when watchlistOnlyEmpty:
<Text>Your watchlist is empty</Text>
<Text>Add movies to your watchlist to see them here</Text>
```

The screen computes and passes `watchlistOnlyEmpty`:

```tsx
const watchlistOnlyEmpty =
  watchlistOnly && (watchlistIds?.size ?? 0) === 0;

<ReleaseDayList
  // ... existing props ...
  watchlistOnlyEmpty={watchlistOnlyEmpty}
/>
```

The empty-state branch in `ReleaseDayList` already exists; this just toggles the message text.

### 3. Database — no migration needed

`profiles.calendar_default_filters` is a `jsonb` column. Adding a new key `my_watchlist_only` is a no-op at the schema level. Existing rows without the key default to `undefined` → handled by the hydration logic (only sets state if key is present).

### 4. Types — `lib/database.types.ts`

The `calendar_default_filters` field is typed loosely (likely `Json | null`). No type-level change needed. The screen casts it to `{ release_types?: number[]; my_watchlist_only?: boolean }` at the read site (already does this for `release_types`).

## Data flow

### Filter ON, watchlist has items

```
1. User opens filter sheet → toggles "Show only my watchlist" ON → taps Apply
2. handleApplyFilters fires:
   - persists { release_types, my_watchlist_only: true } to profiles
   - closes sheet
3. Screen re-renders. The three filter useMemo's recompute:
   - filteredDatesWithReleases: dates where at least one release.tmdb_id is in watchlistIds
   - filteredPersonalizedDates: dates with watchlist+taste-matched intersection
   - selectedDayReleases: only releases that match BOTH type filter AND watchlist
4. CalendarGrid receives the filtered arrays; renders dots only on watchlist days.
5. ReleaseDayList shows only watchlist cards for the selected day; empty state if zero.
```

### Filter ON, watchlist is empty

```
1. Same toggle path; state updates.
2. filteredDatesWithReleases: [] (no watchlist items → no days match)
3. filteredPersonalizedDates: []
4. selectedDayReleases: []
5. watchlistOnlyEmpty = true (passed to ReleaseDayList)
6. CalendarGrid renders no dots on any day.
7. ReleaseDayList shows: "Your watchlist is empty / Add movies to your watchlist to see them here."
```

### Filter ON, guest user

This flow doesn't happen. The filter sheet's switch row is gated on `user` truthy. Guests don't see the switch and can't toggle it. Even if `watchlistOnly` somehow became true, `useWatchlistIds(!!user)` returns an empty Set when `!user`, so the filter would just blank everything out — same as empty-watchlist case. Defensive but not relied on.

### Cold launch hydration

```
1. App launches; SP2's PersistQueryClientProvider hydrates the release-calendar cache
2. release-calendar.tsx mounts; hydrates filterTypes AND watchlistOnly from profiles.calendar_default_filters
3. With watchlistOnly true and watchlistIds available (also hydrated by useWatchlistIds), the filter takes effect immediately on first render — no loading flash.
```

## Error handling

| Failure mode | Behavior |
|---|---|
| `profiles.calendar_default_filters` missing or null | watchlistOnly defaults to false; existing behavior |
| Watchlist query fails (`useWatchlistIds`) | Returns undefined; filter logic treats `watchlistIds?.has(...) ?? false` as "no watchlist" → all releases filtered out when filter is on. Acceptable degradation. |
| Profile update fails when applying filter | Toast (existing MutationCache pattern) — but the persistence call is fire-and-forget here, not a mutation. If we want toast on failure, wrap it in `useMutation`. **For SP4-A: keep parity with the existing type-filter persistence (fire-and-forget). Failure means the next session won't have the saved state, which is acceptable.** |
| User's watchlist changes mid-session (e.g. they add a movie via search) | The `useWatchlistIds` query has `staleTime: 5min`. After 5min or on next mount, the filter reflects the new watchlist. Manual invalidation via the existing watchlist mutation handler also works (`queryClient.invalidateQueries({ queryKey: ['watchlist-tmdb-ids'] })`). |
| User signs out while filter is ON | `useAuth` returns `user: null` → switch hidden, but the state itself isn't cleared. On next sign-in, the saved profile state hydrates (could be the same user or a different one). **Acceptable**: each user's profile has their own filter prefs; sign-out doesn't need to wipe local screen state. |

## Testing

### Unit/integration — screen-level filter logic

Create or extend `__tests__/app/release-calendar.test.tsx`:

```tsx
describe('ReleaseCalendarScreen — my-releases filter', () => {
  it('filters selectedDayReleases to watchlist when watchlistOnly is ON', () => {
    // Render screen with mocked useReleaseCalendar returning 2 releases (tmdb_id 10, 20)
    // and useWatchlistIds returning Set([10])
    // and watchlistOnly state set to true
    // Assert only the release with tmdb_id 10 appears in the day list
  });

  it('passes filtered datesWithReleases to CalendarGrid when filter is ON', () => {
    // Mock data with releases on 4-15 (id 10) and 4-20 (id 30)
    // watchlistIds = Set([10])
    // watchlistOnly = true
    // Assert CalendarGrid receives datesWithReleases=['2026-04-15'] (not '4-20')
  });

  it('passes unfiltered datesWithReleases when watchlistOnly is OFF', () => {
    // Same mock data; watchlistOnly = false
    // Assert CalendarGrid receives both '2026-04-15' and '2026-04-20'
  });

  it('shows watchlist-empty message when filter is ON and watchlistIds is empty', () => {
    // watchlistIds = Set() (empty), watchlistOnly = true
    // Assert ReleaseDayList receives watchlistOnlyEmpty=true
    // Assert text "Your watchlist is empty" is in the tree
  });

  it('hides the watchlist switch for guest users', () => {
    // Render with useAuth returning { user: null }
    // Open filter sheet
    // Assert the watchlist switch is NOT in the tree
  });

  it('persists watchlistOnly to profile on Apply', () => {
    // Mock supabase.from('profiles').update() spy
    // Toggle switch, tap Apply
    // Assert update called with { calendar_default_filters: { release_types: [...], my_watchlist_only: true } }
  });

  it('hydrates watchlistOnly from profile on mount', () => {
    // Mock profile.select() to return { calendar_default_filters: { my_watchlist_only: true } }
    // Render screen
    // Assert switch is initially ON
  });
});
```

### Component — `release-day-list.tsx` empty-state variant

Extend `__tests__/components/calendar/release-day-list.test.tsx` (or create if absent):

- Render with `releases=[], isLoading=false, watchlistOnlyEmpty=true` → assert "Your watchlist is empty" text
- Render with `releases=[], isLoading=false, watchlistOnlyEmpty=false` → assert default "No releases on this date" text
- Render with `releases=[{...}], watchlistOnlyEmpty=true` → assert release cards render (filter doesn't override non-empty state)

### Device validation (manual)

| Scenario | Expected |
|---|---|
| Toggle switch ON, watchlist has items | Calendar shows dots only on watchlist-release days; day list shows only watchlist cards |
| Toggle switch OFF | Calendar reverts to all-releases view |
| Filter persists across app restart | Kill app, reopen — switch state is preserved |
| Sign out + sign in different account | Switch reflects the second account's saved preference |
| Empty watchlist + filter ON | Calendar is blank; day list shows "Your watchlist is empty" message |
| Sign out (guest mode) | Filter sheet's switch row is hidden entirely |
| Combine watchlist filter + type chips | Filtering works AND-style: e.g. "watchlist items that are theatrical" |
| Add movie to watchlist while filter is on | Within ~5 min (staleTime) or after manual refresh, the new movie appears |

### Pre-PR gate

```bash
npm run lint && npx tsc --noEmit && npm test
```

All green. Baseline before SP4-A: 851 tests, 0 lint errors, 0 TSC errors.

## Out of scope

- **SP4 — release notifications** (separate spec; needs scheduling, time zones, opt-in flow)
- **SP4 — trailer thumbnails** (separate spec; TMDB videos endpoint integration)
- **SP4 — "Coming this week" carousel** (separate spec; new home-screen module)
- **SP4 — multi-region preferences** (separate spec; profile column + warming changes)
- **SP4 — iCal export** (separate spec; edge function + auth-signed URL)
- **SP4 — home-screen widget integration** (separate spec; native iOS work)
- **`useFilteredReleases` hook abstraction** — premature; logic is small enough for inline `useMemo`s
- **"Smart suggestions" mode** — combining watchlist + recently added + taste-matched into a meta-filter
- **Filter chip in the calendar header** (alternative UX from Q1 Option B/C) — discarded
- **Database migration** — `calendar_default_filters` is jsonb, no schema change needed
- **Mutation/toast on persistence failure** — fire-and-forget matches existing type-filter pattern
- **Watchlist invalidation hook** — existing 5min staleTime + cross-screen invalidations are sufficient
- **Per-region filter scope** — region is determined by SP1's region prop, separate from this filter

## Risks

- **`app/release-calendar.tsx` is already a large file (~400 lines)** — adding more state and useMemo's risks pushing it past readability. Mitigation: keep additions tightly scoped; if file passes 500 lines after this PR, file a follow-up to extract filter state into a custom hook.
- **`useMemo` dep array correctness** — three new useMemo's depend on `watchlistIds` (a Set object). React Query returns a new Set instance on every refetch. The dep tracking will rerun the memos on every refetch, which is fine but slightly wasteful. Acceptable for SP4-A scope.
- **Profile update is fire-and-forget** — if the network drops while the user is applying filters, the persistence silently fails and the next session won't have the state. Matches existing type-filter behavior. If users complain, wrap in `useMutation` later.
- **Empty-state message change is in `ReleaseDayList`** — touches a stable component shipped in SP1. The new prop is optional and defaults to false (no behavior change for existing callers). Low regression risk.

## Dependencies / sequencing

Depends on:
- SP1 (PR #397) ✓ — denormalized release_calendar table, watchlist hook
- SP2 (PR #401) ✓ — persistence + prefetch + skeleton (this filter operates over hydrated data)
- SP3 (PR #402) ✓ — slide animation (orthogonal; filter doesn't interact with the animation)
- React Native `Switch` component — built-in
- `profiles.calendar_default_filters` jsonb column — exists from before SP1

Unblocks:
- Future SP4 features that filter releases (e.g. "Coming this week" carousel can reuse the watchlist-only logic)
- Multi-region preferences (could combine: "show only my watchlist in my preferred region")

## References

- [SP1 Release Calendar Foundation Design](./2026-04-23-release-calendar-foundation-design.md)
- [SP2 Client Cache Hierarchy Design](./2026-04-26-release-calendar-sp2-cache-hierarchy-design.md)
- [SP3 UX Polish Design](./2026-04-26-release-calendar-sp3-ux-polish-design.md)
- PR #397 (SP1) — https://github.com/TyShaneONeill/movie-tracker/pull/397
- PR #401 (SP2) — https://github.com/TyShaneONeill/movie-tracker/pull/401
- PR #402 (SP3) — https://github.com/TyShaneONeill/movie-tracker/pull/402
- React Native Switch — https://reactnative.dev/docs/switch
