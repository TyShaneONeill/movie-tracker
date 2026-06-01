# Your Year at the Movies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, shareable ticket-stub "Year at the Movies" recap that ships to production dormant (hidden behind a default-OFF feature flag) and is fully testable by the founder until the December 2026 launch.

**Architecture:** A new timezone-correct Postgres RPC aggregates a user's year of watch history into one JSON payload; a react-query hook maps it to typed camelCase; a presentational ticket-stub poster renders it (adaptive to sparse data) and is captured/shared via the existing share-service. A visibility hook (`useRecapVisible`) keeps the Analytics-tab entry point hidden from users while leaving the `/recap/[year]` route directly testable.

**Tech Stack:** Postgres (plpgsql, SECURITY DEFINER), Supabase RPC, React Native (Expo SDK 54), expo-router, @tanstack/react-query, react-native-view-shot, PostHog feature flags, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-05-30-year-at-the-movies-recap-design.md`

---

## Conventions for the implementing engineer

- **Branch:** all work on `feature/year-at-the-movies-recap`. Never commit to `main`.
- **Verification gate (must pass before the final commit of each code task):** `npm run lint && npx tsc --noEmit && npm test`.
- **Brand palette (poster only — fixed regardless of app theme):** matte black `#1A1A1A`, cinema red `#C41E3A`, cream `#F5EBD9`, gold `#D4AF37`.
- **Do NOT** modify the existing `get_user_stats_summary` / `get_user_monthly_activity` RPCs or the Analytics screen's existing stat cards.
- SECURITY DEFINER functions in this codebase use `SET search_path = ''` and **fully schema-qualify** every table (`public.user_movies`, `auth.uid()`).

---

## File Structure

**New:**
- `supabase/migrations/<timestamp>_create_get_user_year_recap.sql` — the RPC
- `supabase/tests/get_user_year_recap_test.sql` — seeded SQL correctness harness
- `hooks/use-year-recap.ts` — RPC hook + `YearRecap` types + genre mapping
- `hooks/use-recap-visible.ts` — visibility gate (flag + dev id + `__DEV__`)
- `components/recap/year-recap-poster.tsx` — presentational ticket-stub poster
- `app/recap/[year].tsx` — recap screen (wires hook + poster + share + archive + dev preview)
- `__tests__/hooks/use-year-recap.test.ts`
- `__tests__/hooks/use-recap-visible.test.ts`
- `__tests__/components/year-recap-poster.test.tsx`

**Modified:**
- `lib/share-service.ts` — add `shareRecap()`
- `lib/database.types.ts` — hand-add the `get_user_year_recap` function signature (Task 2 Step 4)
- `app/(tabs)/analytics.tsx` — add recap entry card gated by `useRecapVisible()`

---

## Task 1: Year-recap RPC + SQL correctness harness

**Files:**
- Create: `supabase/migrations/<timestamp>_create_get_user_year_recap.sql`
- Create/Test: `supabase/tests/get_user_year_recap_test.sql`

The RPC returns one `jsonb` object scoped to `auth.uid()` for `p_year`, bucketing dates in `p_timezone` (validated, UTC fallback).

- [ ] **Step 1: Confirm `theater_visits.show_date` column type**

Run: `grep -iA1 'show_date' supabase/migrations/20260525063629_remote_schema.sql | head`
Expected: a line like `"show_date" date` or `"show_date" timestamp with time zone`.
- If `date`: in the SQL below, year-filter theaters with `EXTRACT(YEAR FROM tv.show_date) = p_year` (no `AT TIME ZONE`).
- If `timestamp with time zone`: use `EXTRACT(YEAR FROM (tv.show_date AT TIME ZONE v_tz)) = p_year`.
The SQL below assumes **`date`**; adjust that one line if Step 1 says otherwise.

- [ ] **Step 2: Write the failing SQL test harness**

Create `supabase/tests/get_user_year_recap_test.sql`:

```sql
-- Correctness harness for public.get_user_year_recap.
-- Run against a local DB that has the migration applied:
--   supabase db reset && psql "$LOCAL_DB_URL" -f supabase/tests/get_user_year_recap_test.sql
-- Exits non-zero (RAISE EXCEPTION) on the first failed assertion; prints "ALL RECAP TESTS PASSED" on success.

DO $$
DECLARE
  v_user uuid := '00000000-0000-0000-0000-0000000000aa';
  v_recap jsonb;
BEGIN
  -- Clean slate
  DELETE FROM public.user_movies WHERE user_id = v_user;
  DELETE FROM public.user_episode_watches WHERE user_id = v_user;
  DELETE FROM public.theater_visits WHERE user_id = v_user;

  -- 2025 films: 3 watched. One with NULL watched_at (COALESCE→added_at).
  -- One watched 2025-12-31 23:30 America/New_York (= 2026-01-01 04:30 UTC) — MUST count as 2025.
  INSERT INTO public.user_movies (user_id, tmdb_id, title, status, genre_ids, runtime_minutes, watch_format, theater_chain, added_at, watched_at) VALUES
    (v_user, 1, 'Alpha',  'watched', ARRAY[878], 120, 'imax',     'AMC',     '2025-03-01T00:00:00Z', '2025-03-01T00:00:00Z'),
    (v_user, 2, 'Beta',   'watched', ARRAY[878,28], 100, NULL,     NULL,      '2025-06-01T00:00:00Z', NULL),
    (v_user, 3, 'NYE',    'watched', ARRAY[18], 90,  'dolby',     'Regal',   '2026-01-01T04:30:00Z', '2026-01-01T04:30:00Z'),
    (v_user, 4, 'NextYr', 'watched', ARRAY[35], 95,  'standard',  NULL,      '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    (v_user, 5, 'OnList', 'watchlist', ARRAY[35], 95, NULL,       NULL,      '2025-05-01T00:00:00Z', NULL);

  -- 2025 episodes: 2 watched, 30 min each.
  INSERT INTO public.user_episode_watches (user_id, tmdb_show_id, season_number, episode_number, episode_runtime, watched_at) VALUES
    (v_user, 100, 1, 1, 30, '2025-04-01T00:00:00Z'),
    (v_user, 100, 1, 2, 30, '2025-04-02T00:00:00Z');

  -- ---- Assert: 2025 in America/New_York ----
  v_recap := public.get_user_year_recap(2025, 'America/New_York');

  ASSERT (v_recap->>'films_seen')::int = 3,
    format('films_seen expected 3, got %s', v_recap->>'films_seen');          -- Alpha, Beta, NYE
  ASSERT (v_recap->>'hours_watched')::numeric = 310,
    format('hours_watched(min) expected 310, got %s', v_recap->>'hours_watched'); -- 120+100+90
  ASSERT (v_recap->>'episodes_watched')::int = 2,
    format('episodes expected 2, got %s', v_recap->>'episodes_watched');
  ASSERT (v_recap->'first_film'->>'title') = 'Alpha',
    format('first_film expected Alpha, got %s', v_recap->'first_film'->>'title');
  ASSERT (v_recap->'last_film'->>'title') = 'NYE',
    format('last_film expected NYE, got %s', v_recap->'last_film'->>'title');
  -- formats: imax(1) + dolby(1); 'standard' excluded
  ASSERT jsonb_array_length(v_recap->'formats') = 2,
    format('formats expected 2 entries, got %s', v_recap->'formats');
  ASSERT (v_recap->>'available_years') LIKE '%2025%' AND (v_recap->>'available_years') LIKE '%2026%',
    format('available_years should include 2025 and 2026, got %s', v_recap->>'available_years');

  -- ---- Assert: invalid timezone falls back to UTC (NYE film now counts as 2026, not 2025) ----
  v_recap := public.get_user_year_recap(2025, 'Not/AZone');
  ASSERT (v_recap->>'films_seen')::int = 2,
    format('UTC-fallback 2025 films expected 2 (Alpha,Beta), got %s', v_recap->>'films_seen');

  -- ---- Assert: empty year ----
  v_recap := public.get_user_year_recap(2030, 'UTC');
  ASSERT (v_recap->>'films_seen')::int = 0,
    format('empty year films expected 0, got %s', v_recap->>'films_seen');
  ASSERT (v_recap->'first_film') = 'null'::jsonb,
    format('empty year first_film expected null, got %s', v_recap->'first_film');

  -- Cleanup
  DELETE FROM public.user_movies WHERE user_id = v_user;
  DELETE FROM public.user_episode_watches WHERE user_id = v_user;
  DELETE FROM public.theater_visits WHERE user_id = v_user;

  RAISE NOTICE 'ALL RECAP TESTS PASSED';
END $$;
```

- [ ] **Step 3: Run the harness to verify it fails (function does not exist yet)**

Run: `supabase db reset && psql "$LOCAL_DB_URL" -f supabase/tests/get_user_year_recap_test.sql`
(`$LOCAL_DB_URL` is the local Supabase connection string from `supabase status`.)
Expected: FAIL — `ERROR: function public.get_user_year_recap(integer, text) does not exist`.

- [ ] **Step 4: Write the migration (the RPC)**

Create `supabase/migrations/<timestamp>_create_get_user_year_recap.sql` (use a timestamp newer than `20260525071606`):

```sql
-- "Your Year at the Movies" recap aggregation.
-- One JSON payload per (user, year), bucketed in the caller's local timezone.
-- SECURITY DEFINER + search_path='' per project convention; filters on auth.uid()
-- so a client can never read another user's recap.

CREATE OR REPLACE FUNCTION public.get_user_year_recap(
  p_year int,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tz  text := p_timezone;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_user_year_recap: not authenticated';
  END IF;

  -- Validate timezone; fall back to UTC on anything Postgres doesn't recognize.
  IF v_tz IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'UTC';
  END IF;

  WITH movies AS (
    SELECT um.tmdb_id, um.title, um.genre_ids, um.runtime_minutes, um.watch_format,
           um.theater_chain,
           (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz) AS local_ts
    FROM public.user_movies um
    WHERE um.user_id = v_uid
      AND um.status = 'watched'
      AND EXTRACT(YEAR FROM (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz)) = p_year
  ),
  genre_counts AS (
    SELECT gid AS genre_id, COUNT(*)::int AS count
    FROM movies m, LATERAL unnest(COALESCE(m.genre_ids, ARRAY[]::integer[])) AS gid
    GROUP BY gid
    ORDER BY count DESC, genre_id ASC
    LIMIT 5
  ),
  episodes AS (
    SELECT ew.episode_runtime
    FROM public.user_episode_watches ew
    WHERE ew.user_id = v_uid
      AND ew.watched_at IS NOT NULL
      AND EXTRACT(YEAR FROM (ew.watched_at AT TIME ZONE v_tz)) = p_year
  ),
  movie_formats AS (
    SELECT lower(m.watch_format) AS format
    FROM movies m
    WHERE m.watch_format IS NOT NULL AND lower(m.watch_format) <> 'standard'
  ),
  theater_rows AS (
    SELECT tv.theater_name, tv.theater_chain, lower(tv.format) AS format
    FROM public.theater_visits tv
    WHERE tv.user_id = v_uid
      AND tv.show_date IS NOT NULL
      AND EXTRACT(YEAR FROM tv.show_date) = p_year   -- assumes show_date is type `date` (see Task 1 Step 1)
  ),
  theater_formats AS (
    SELECT format FROM theater_rows
    WHERE format IS NOT NULL AND format <> 'standard'
  ),
  all_formats AS (
    SELECT format, COUNT(*)::int AS count
    FROM (SELECT format FROM movie_formats UNION ALL SELECT format FROM theater_formats) f
    GROUP BY format
    ORDER BY count DESC, format ASC
  ),
  bookends AS (
    SELECT
      (SELECT to_jsonb(j) FROM (
         SELECT title, local_ts::date AS date FROM movies ORDER BY local_ts ASC, title ASC LIMIT 1
       ) j) AS first_film,
      (SELECT to_jsonb(j) FROM (
         SELECT title, local_ts::date AS date FROM movies ORDER BY local_ts DESC, title ASC LIMIT 1
       ) j) AS last_film
  ),
  years AS (
    SELECT DISTINCT EXTRACT(YEAR FROM (COALESCE(um.watched_at, um.added_at) AT TIME ZONE v_tz))::int AS y
    FROM public.user_movies um
    WHERE um.user_id = v_uid AND um.status = 'watched'
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'films_seen', (SELECT COUNT(*)::int FROM movies),
    'hours_watched', (SELECT COALESCE(SUM(runtime_minutes), 0)::numeric FROM movies),
    'genres', (SELECT COALESCE(jsonb_agg(jsonb_build_object('genre_id', genre_id, 'count', count)), '[]'::jsonb) FROM genre_counts),
    'tv_shows', (
      SELECT COUNT(DISTINCT ew.tmdb_show_id)::int
      FROM public.user_episode_watches ew
      WHERE ew.user_id = v_uid AND ew.watched_at IS NOT NULL
        AND EXTRACT(YEAR FROM (ew.watched_at AT TIME ZONE v_tz)) = p_year
    ),
    'episodes_watched', (SELECT COUNT(*)::int FROM episodes),
    'tv_hours', (SELECT COALESCE(SUM(episode_runtime), 0)::numeric FROM episodes),
    'formats', (SELECT COALESCE(jsonb_agg(jsonb_build_object('format', format, 'count', count)), '[]'::jsonb) FROM all_formats),
    'theaters_count', (SELECT COUNT(DISTINCT theater_name)::int FROM theater_rows WHERE theater_name IS NOT NULL),
    'chains_count', (SELECT COUNT(DISTINCT theater_chain)::int FROM theater_rows WHERE theater_chain IS NOT NULL),
    'first_film', (SELECT COALESCE(first_film, 'null'::jsonb) FROM bookends),
    'last_film', (SELECT COALESCE(last_film, 'null'::jsonb) FROM bookends),
    'available_years', (SELECT COALESCE(jsonb_agg(y ORDER BY y DESC), '[]'::jsonb) FROM years)
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_user_year_recap(int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_year_recap(int, text) TO authenticated;
COMMENT ON FUNCTION public.get_user_year_recap(int, text) IS
  'Year-in-review aggregation for the Year at the Movies recap. Scoped to auth.uid(); buckets dates in p_timezone (UTC fallback).';
```

- [ ] **Step 5: Apply + run the harness to verify it passes**

Run: `supabase db reset && psql "$LOCAL_DB_URL" -f supabase/tests/get_user_year_recap_test.sql`
Expected: `NOTICE: ALL RECAP TESTS PASSED` and exit code 0.

- [ ] **Step 6: Sanity-check the query plan**

Run: `psql "$LOCAL_DB_URL" -c "EXPLAIN SELECT public.get_user_year_recap(2025,'UTC');"`
Expected: no error. If a later real-data check shows a seq scan on `user_movies` at scale, add `CREATE INDEX IF NOT EXISTS idx_user_movies_user_status ON public.user_movies (user_id, status);` in the same migration — otherwise leave as-is (YAGNI).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_create_get_user_year_recap.sql supabase/tests/get_user_year_recap_test.sql
git commit -m "feat(recap): add get_user_year_recap RPC + SQL correctness harness"
```

---

## Task 2: `useYearRecap` hook + types

**Files:**
- Create: `hooks/use-year-recap.ts`
- Test: `__tests__/hooks/use-year-recap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/use-year-recap.test.ts`:

```ts
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useYearRecap } from '@/hooks/use-year-recap';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useYearRecap', () => {
  beforeEach(() => mockRpc.mockReset());

  it('maps the RPC payload to typed camelCase with genre names', async () => {
    mockRpc.mockResolvedValue({
      data: {
        year: 2025, films_seen: 3, hours_watched: 310,
        genres: [{ genre_id: 878, count: 2 }],
        tv_shows: 1, episodes_watched: 2, tv_hours: 60,
        formats: [{ format: 'imax', count: 1 }],
        theaters_count: 2, chains_count: 1,
        first_film: { title: 'Alpha', date: '2025-03-01' },
        last_film: { title: 'NYE', date: '2025-12-31' },
        available_years: [2026, 2025],
      },
      error: null,
    });

    const { result } = renderHook(() => useYearRecap(2025), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const r = result.current.data!;
    expect(r.filmsSeen).toBe(3);
    expect(r.hoursWatched).toBe(310);
    expect(r.genres[0].genreName).toBe('Science Fiction'); // 878 via TMDB_GENRE_MAP
    expect(r.formats[0].format).toBe('imax');
    expect(r.firstFilm?.title).toBe('Alpha');
    expect(r.availableYears).toEqual([2026, 2025]);
    expect(mockRpc).toHaveBeenCalledWith('get_user_year_recap', expect.objectContaining({ p_year: 2025 }));
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useYearRecap(2025), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/hooks/use-year-recap.test.ts`
Expected: FAIL — cannot find module `@/hooks/use-year-recap`.

- [ ] **Step 3: Implement the hook**

Create `hooks/use-year-recap.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TMDB_GENRE_MAP } from '@/lib/tmdb.types';

export interface RecapGenre { genreId: number; genreName: string; count: number; }
export interface RecapFormat { format: string; count: number; }
export interface RecapFilmRef { title: string; date: string; }

export interface YearRecap {
  year: number;
  filmsSeen: number;
  hoursWatched: number;     // minutes (movies)
  genres: RecapGenre[];
  tvShows: number;
  episodesWatched: number;
  tvHours: number;          // minutes
  formats: RecapFormat[];
  theatersCount: number;
  chainsCount: number;
  firstFilm: RecapFilmRef | null;
  lastFilm: RecapFilmRef | null;
  availableYears: number[];
}

interface RawYearRecap {
  year: number;
  films_seen: number;
  hours_watched: number;
  genres: Array<{ genre_id: number; count: number }>;
  tv_shows: number;
  episodes_watched: number;
  tv_hours: number;
  formats: Array<{ format: string; count: number }>;
  theaters_count: number;
  chains_count: number;
  first_film: RecapFilmRef | null;
  last_film: RecapFilmRef | null;
  available_years: number[];
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function mapRecap(raw: RawYearRecap): YearRecap {
  return {
    year: raw.year,
    filmsSeen: raw.films_seen,
    hoursWatched: raw.hours_watched,
    genres: (raw.genres ?? []).map((g) => ({
      genreId: g.genre_id,
      genreName: TMDB_GENRE_MAP[g.genre_id] || 'Other',
      count: g.count,
    })),
    tvShows: raw.tv_shows,
    episodesWatched: raw.episodes_watched,
    tvHours: raw.tv_hours,
    formats: raw.formats ?? [],
    theatersCount: raw.theaters_count,
    chainsCount: raw.chains_count,
    firstFilm: raw.first_film,
    lastFilm: raw.last_film,
    availableYears: raw.available_years ?? [],
  };
}

async function fetchYearRecap(year: number): Promise<YearRecap> {
  const { data, error } = await supabase.rpc('get_user_year_recap', {
    p_year: year,
    p_timezone: getDeviceTimezone(),
  });
  if (error) throw new Error(error.message || 'Failed to load year recap');
  if (!data) throw new Error('No recap data returned');
  return mapRecap(data as unknown as RawYearRecap);
}

export function useYearRecap(year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['yearRecap', user?.id, year],
    queryFn: () => fetchYearRecap(year),
    enabled: !!user && Number.isFinite(year),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Register the RPC in `database.types.ts` (hand-edit — do NOT regenerate)**

The typed Supabase client rejects `.rpc('get_user_year_recap', …)` until the function is in the generated types. This project **hand-edits** `lib/database.types.ts` (regeneration wipes custom aliases). Add this entry under `Database['public']['Functions']` (alongside the existing `get_user_stats_summary` etc.):

```ts
      get_user_year_recap: {
        Args: { p_year: number; p_timezone?: string };
        Returns: Json;
      };
```

(`Json` is already exported at the top of `database.types.ts`. If TS still complains at the call site, the hook already casts via `data as unknown as RawYearRecap`, so no `any` is needed.)

- [ ] **Step 5: Run the test + type-check to verify both pass**

Run: `npx jest __tests__/hooks/use-year-recap.test.ts && npx tsc --noEmit`
Expected: jest PASS (both tests) and tsc clean.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-year-recap.ts __tests__/hooks/use-year-recap.test.ts lib/database.types.ts
git commit -m "feat(recap): add useYearRecap hook with typed mapping"
```

---

## Task 3: `useRecapVisible` — dark-launch visibility gate

**Files:**
- Create: `hooks/use-recap-visible.ts`
- Test: `__tests__/hooks/use-recap-visible.test.ts`

Visible when: PostHog flag `year_recap_enabled` ON **OR** current user ∈ `EXPO_PUBLIC_DEV_USER_IDS` **OR** `__DEV__`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/hooks/use-recap-visible.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native';

const mockFlag = jest.fn();
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => mockFlag(name),
}));
let mockUserId: string | undefined = 'normal-user';
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}));

import { useRecapVisible } from '@/hooks/use-recap-visible';

describe('useRecapVisible', () => {
  const ORIGINAL_DEV = (global as any).__DEV__;
  beforeEach(() => {
    mockFlag.mockReturnValue({ enabled: false, value: false, reload: jest.fn() });
    mockUserId = 'normal-user';
    process.env.EXPO_PUBLIC_DEV_USER_IDS = 'dev-1,dev-2';
    (global as any).__DEV__ = false;
  });
  afterAll(() => { (global as any).__DEV__ = ORIGINAL_DEV; });

  it('hidden for a normal user with flag OFF in production', () => {
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(false);
  });

  it('visible when the flag is ON', () => {
    mockFlag.mockReturnValue({ enabled: true, value: true, reload: jest.fn() });
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });

  it('visible for a dev user id even with flag OFF', () => {
    mockUserId = 'dev-2';
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });

  it('visible in __DEV__ builds regardless of flag/user', () => {
    (global as any).__DEV__ = true;
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/hooks/use-recap-visible.test.ts`
Expected: FAIL — cannot find module `@/hooks/use-recap-visible`.

- [ ] **Step 3: Implement the hook**

Create `hooks/use-recap-visible.ts`:

```ts
import { useMemo } from 'react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useAuth } from '@/lib/auth-context';

/**
 * Dark-launch gate for the Year-at-the-Movies entry point.
 * Hidden from production users until `year_recap_enabled` is flipped ON in PostHog.
 * Always visible to dev users (EXPO_PUBLIC_DEV_USER_IDS) and in __DEV__ builds so
 * the founder can QA without exposing it. The /recap/[year] route itself is NOT
 * gated by this — only the discoverable entry card is.
 */
export function useRecapVisible(): boolean {
  const { enabled: flagOn } = useFeatureFlag('year_recap_enabled');
  const { user } = useAuth();

  return useMemo(() => {
    if (__DEV__) return true;
    if (flagOn) return true;
    const devIds = (process.env.EXPO_PUBLIC_DEV_USER_IDS ?? '')
      .split(',').map((id) => id.trim()).filter(Boolean);
    return !!user?.id && devIds.includes(user.id);
  }, [flagOn, user?.id]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/hooks/use-recap-visible.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add hooks/use-recap-visible.ts __tests__/hooks/use-recap-visible.test.ts
git commit -m "feat(recap): add useRecapVisible dark-launch gate"
```

---

## Task 4: `shareRecap` in the share service

**Files:**
- Modify: `lib/share-service.ts` (add export; reuse existing `captureCard` + `copyToClipboard` + Sharing)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/share-recap.test.ts`:

```ts
const mockCapture = jest.fn().mockResolvedValue('file:///tmp/recap.png');
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('react-native-view-shot', () => ({}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: '/tmp/', writeAsStringAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

import { shareRecap } from '@/lib/share-service';

describe('shareRecap (web)', () => {
  const originalShare = (global as any).navigator;
  afterEach(() => { (global as any).navigator = originalShare; });

  it('uses navigator.share on web when available', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    (global as any).navigator = { share };
    const ref = { current: { capture: jest.fn() } } as any;
    await shareRecap(ref, 2025);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('2025'), url: expect.stringContaining('pocketstubs.com') })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/share-recap.test.ts`
Expected: FAIL — `shareRecap` is not exported.

- [ ] **Step 3: Implement `shareRecap` (append to `lib/share-service.ts`)**

Add at the end of `lib/share-service.ts`:

```ts
const RECAP_URL = `${WEB_BASE}/year`;

/**
 * Share the Year-at-the-Movies recap card.
 * Web: navigator.share (title + recap URL), clipboard fallback.
 * Native: capture the poster ViewShot → PNG, copy the URL to clipboard so it can
 * be pasted alongside the image, then open the native share sheet. Mirrors
 * `shareDiscovery` — the only differences are the URL and the dialog title.
 */
export async function shareRecap(
  viewShotRef: RefObject<ViewShot | null>,
  year: number
): Promise<void> {
  const title = `My ${year} at the movies — PocketStubs`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url: RECAP_URL });
        return;
      } catch {
        // user cancelled / unsupported — fall through to clipboard
      }
    }
    await copyToClipboard(RECAP_URL);
    return;
  }

  try {
    await Clipboard.setStringAsync(RECAP_URL);
  } catch {
    // clipboard failures shouldn't block the share
  }

  const imageUri = await captureCard(viewShotRef);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle: title,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/share-recap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/share-service.ts __tests__/lib/share-recap.test.ts
git commit -m "feat(recap): add shareRecap to share-service"
```

---

## Task 5: Ticket-stub poster component

**Files:**
- Create: `components/recap/year-recap-poster.tsx`
- Test: `__tests__/components/year-recap-poster.test.tsx`

Presentational + deterministic: takes a `YearRecap` + a forwarded `ViewShot` ref, uses the fixed brand palette, renders the hero numeral + always-on stats + adaptive moat slots. No theme/context dependency (keeps it testable and brand-consistent regardless of app theme).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/year-recap-poster.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
jest.mock('react-native-view-shot', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef((props: any, _ref: any) => React.createElement('View', props, props.children)) };
});

import { YearRecapPoster } from '@/components/recap/year-recap-poster';
import type { YearRecap } from '@/hooks/use-year-recap';

const base: YearRecap = {
  year: 2025, filmsSeen: 47, hoursWatched: 5640, // 94h
  genres: [{ genreId: 878, genreName: 'Science Fiction', count: 12 }],
  tvShows: 8, episodesWatched: 112, tvHours: 3360,
  formats: [{ format: 'imax', count: 12 }], theatersCount: 7, chainsCount: 3,
  firstFilm: { title: 'Oppenheimer', date: '2025-01-03' },
  lastFilm: { title: 'Nosferatu', date: '2025-12-29' },
  availableYears: [2025],
};

describe('YearRecapPoster', () => {
  it('renders the hero film count and core stats', () => {
    const ref = React.createRef<any>();
    const { getByText } = render(<YearRecapPoster recap={base} viewShotRef={ref} />);
    expect(getByText('47')).toBeTruthy();
    expect(getByText(/94/)).toBeTruthy();           // hours (5640 min → 94h)
    expect(getByText('Science Fiction')).toBeTruthy();
  });

  it('hides moat stats when absent (no "0 IMAX" / "0 theaters")', () => {
    const sparse: YearRecap = { ...base, formats: [], theatersCount: 0, chainsCount: 0 };
    const ref = React.createRef<any>();
    const { queryByText } = render(<YearRecapPoster recap={sparse} viewShotRef={ref} />);
    expect(queryByText(/IMAX/i)).toBeNull();
    expect(queryByText(/theater/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/components/year-recap-poster.test.tsx`
Expected: FAIL — cannot find module `@/components/recap/year-recap-poster`.

- [ ] **Step 3: Implement the component**

Create `components/recap/year-recap-poster.tsx`:

```tsx
import React, { RefObject } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { YearRecap } from '@/hooks/use-year-recap';

const PALETTE = { black: '#1A1A1A', red: '#C41E3A', cream: '#F5EBD9', gold: '#D4AF37' };

interface StatCell { value: string; label: string; }

function buildCells(recap: YearRecap): StatCell[] {
  const cells: StatCell[] = [];
  // Always-on
  cells.push({ value: `${Math.round(recap.hoursWatched / 60)}h`, label: 'in the dark' });
  if (recap.genres[0]) cells.push({ value: recap.genres[0].genreName, label: 'top genre' });
  if (recap.tvShows > 0 || recap.episodesWatched > 0) {
    cells.push({ value: `${recap.episodesWatched}`, label: `episodes · ${recap.tvShows} shows` });
  }
  // Adaptive moat
  const imax = recap.formats.find((f) => f.format === 'imax');
  const premiumTotal = recap.formats.reduce((s, f) => s + f.count, 0);
  if (premiumTotal > 0) {
    cells.push({ value: `${imax?.count ?? premiumTotal}`, label: imax ? 'in IMAX' : 'premium fmt' });
  }
  if (recap.theatersCount > 0) {
    cells.push({ value: `${recap.theatersCount}`, label: 'theaters' });
  }
  return cells;
}

export function YearRecapPoster({
  recap, viewShotRef,
}: {
  recap: YearRecap;
  viewShotRef: RefObject<ViewShot | null>;
}) {
  const cells = buildCells(recap);
  const yy = `’${String(recap.year).slice(-2)}`;

  return (
    <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
      <View style={styles.stub}>
        <View style={styles.header}>
          <Text style={styles.admit}>ADMIT ONE · POCKETSTUBS</Text>
          <Text style={styles.yy}>{yy}</Text>
        </View>
        <View style={styles.perforation} />
        <View style={styles.body}>
          <Text style={styles.hero}>{recap.filmsSeen}</Text>
          <Text style={styles.heroLabel}>FILMS SEEN THIS YEAR</Text>
          <View style={styles.grid}>
            {cells.map((c, i) => (
              <View key={i} style={styles.cell}>
                <Text style={styles.cellValue} numberOfLines={1}>{c.value}</Text>
                <Text style={styles.cellLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footer}>Your {recap.year} at the movies</Text>
        </View>
      </View>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  stub: { backgroundColor: PALETTE.cream, borderRadius: 16, overflow: 'hidden', width: 320 },
  header: { backgroundColor: PALETTE.black, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  admit: { color: PALETTE.cream, fontSize: 10, letterSpacing: 2 },
  yy: { color: PALETTE.red, fontSize: 24, fontWeight: '800' },
  perforation: { borderTopWidth: 2, borderTopColor: PALETTE.red, borderStyle: 'dashed', marginHorizontal: 12 },
  body: { padding: 20 },
  hero: { color: PALETTE.black, fontSize: 64, fontWeight: '800', lineHeight: 64 },
  heroLabel: { color: PALETTE.black, opacity: 0.6, fontSize: 11, letterSpacing: 2, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 12 },
  cellValue: { color: PALETTE.black, fontSize: 20, fontWeight: '800' },
  cellLabel: { color: PALETTE.black, opacity: 0.55, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  footer: { color: PALETTE.black, opacity: 0.5, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.15)', paddingTop: 10, marginTop: 4 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/components/year-recap-poster.test.tsx`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add components/recap/year-recap-poster.tsx __tests__/components/year-recap-poster.test.tsx
git commit -m "feat(recap): add adaptive ticket-stub poster component"
```

---

## Task 6: Recap screen with dev preview mode + year archive

**Files:**
- Create: `app/recap/[year].tsx`

Wires `useYearRecap` → `YearRecapPoster` → `shareRecap`, renders the archive year-chips from `availableYears`, and supports a dev-only `?preview=full|sparse|empty` override using fixtures. Loading/error/thin-year states.

- [ ] **Step 1: Implement the screen**

Create `app/recap/[year].tsx`:

```tsx
import { useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import ViewShot from 'react-native-view-shot';

import { useYearRecap, type YearRecap } from '@/hooks/use-year-recap';
import { YearRecapPoster } from '@/components/recap/year-recap-poster';
import { shareRecap } from '@/lib/share-service';

const THIN_YEAR_MIN_FILMS = 5;

// Dev-only fixtures for forced-state QA (?preview=full|sparse|empty).
const PREVIEW_FIXTURES: Record<string, YearRecap> = {
  full: {
    year: 2025, filmsSeen: 47, hoursWatched: 5640,
    genres: [{ genreId: 878, genreName: 'Science Fiction', count: 12 }],
    tvShows: 8, episodesWatched: 112, tvHours: 3360,
    formats: [{ format: 'imax', count: 12 }, { format: 'dolby', count: 4 }],
    theatersCount: 7, chainsCount: 3,
    firstFilm: { title: 'Oppenheimer', date: '2025-01-03' },
    lastFilm: { title: 'Nosferatu', date: '2025-12-29' },
    availableYears: [2025, 2024],
  },
  sparse: {
    year: 2025, filmsSeen: 23, hoursWatched: 2700,
    genres: [{ genreId: 18, genreName: 'Drama', count: 6 }],
    tvShows: 0, episodesWatched: 0, tvHours: 0,
    formats: [], theatersCount: 0, chainsCount: 0,
    firstFilm: { title: 'Past Lives', date: '2025-02-10' },
    lastFilm: { title: 'The Brutalist', date: '2025-11-20' },
    availableYears: [2025],
  },
  empty: {
    year: 2025, filmsSeen: 0, hoursWatched: 0, genres: [],
    tvShows: 0, episodesWatched: 0, tvHours: 0, formats: [],
    theatersCount: 0, chainsCount: 0, firstFilm: null, lastFilm: null,
    availableYears: [],
  },
};

export default function RecapScreen() {
  const params = useLocalSearchParams<{ year?: string; preview?: string }>();
  const year = Number(params.year) || new Date().getFullYear() - 1;
  const viewShotRef = useRef<ViewShot>(null);

  const previewKey = __DEV__ && params.preview ? params.preview : undefined;
  const previewData = previewKey ? PREVIEW_FIXTURES[previewKey] : undefined;

  const query = useYearRecap(year);
  const recap = previewData ?? query.data;
  const isLoading = !previewData && query.isLoading;
  const isError = !previewData && query.isError;

  const onShare = useMemo(
    () => async () => {
      try { await shareRecap(viewShotRef, year); } catch { /* user cancelled / unavailable */ }
    },
    [year]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        {isLoading && <ActivityIndicator size="large" color="#C41E3A" style={styles.center} />}
        {isError && <Text style={styles.message}>Couldn’t load your recap. Pull back and try again.</Text>}

        {recap && recap.filmsSeen < THIN_YEAR_MIN_FILMS && (
          <Text style={styles.message}>
            Not enough logged for a {recap.year} recap yet — keep tracking and check back.
          </Text>
        )}

        {recap && recap.filmsSeen >= THIN_YEAR_MIN_FILMS && (
          <>
            <YearRecapPoster recap={recap} viewShotRef={viewShotRef} />

            <Pressable style={styles.shareBtn} onPress={onShare}>
              <Text style={styles.shareText}>↗ Share your year</Text>
            </Pressable>

            {recap.availableYears.length > 1 && (
              <View style={styles.archive}>
                {recap.availableYears.map((y) => (
                  <Pressable key={y} onPress={() => router.setParams({ year: String(y) })}
                    style={[styles.chip, y === year && styles.chipActive]}>
                    <Text style={[styles.chipText, y === year && styles.chipTextActive]}>{y}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  content: { padding: 20, alignItems: 'center', gap: 18 },
  back: { alignSelf: 'flex-start' },
  backText: { color: '#F5EBD9', fontSize: 16 },
  center: { marginTop: 60 },
  message: { color: '#F5EBD9', textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22, paddingHorizontal: 12 },
  shareBtn: { backgroundColor: '#C41E3A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  shareText: { color: '#F5EBD9', fontWeight: '700', fontSize: 15 },
  archive: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { borderWidth: 1, borderColor: '#C41E3A', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  chipActive: { backgroundColor: '#C41E3A' },
  chipText: { color: '#C41E3A', fontWeight: '700' },
  chipTextActive: { color: '#F5EBD9' },
});
```

- [ ] **Step 2: Type-check the screen**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). If expo-router complains the `/recap/[year]` route isn't typed yet, it resolves after the dev server regenerates route types; the file location is correct.

- [ ] **Step 3: Manual smoke (dev) — verify the route + preview states**

Run: `npm run ios` (or `npm run web`), then navigate to `/recap/2025?preview=full`, `?preview=sparse`, `?preview=empty`.
Expected: full = poster with IMAX + theaters; sparse = poster with no moat cells; empty = "Not enough logged…" message. No crash.

- [ ] **Step 4: Commit**

```bash
git add app/recap/[year].tsx
git commit -m "feat(recap): add recap screen with archive + dev preview mode"
```

---

## Task 7: Analytics-tab entry card (gated by `useRecapVisible`)

**Files:**
- Modify: `app/(tabs)/analytics.tsx`

Add a recap entry card pinned above the existing summary stats, rendered only when `useRecapVisible()` is true. Do not alter existing stat cards.

- [ ] **Step 1: Add the import + hook call**

In `app/(tabs)/analytics.tsx`, add to the imports near the existing hooks (after line 11 `import { useAuth } from '@/hooks/use-auth';`):

```tsx
import { useRecapVisible } from '@/hooks/use-recap-visible';
```

Inside `AnalyticsScreen`, after `const { user } = useAuth();` (line 31), add:

```tsx
  const recapVisible = useRecapVisible();
  const latestCompletedYear = new Date().getFullYear() - 1;
```

- [ ] **Step 2: Render the entry card**

In the JSX, immediately after the header block:

```tsx
        {/* Header with Title */}
        <View style={styles.header}>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Analytics</Text>
        </View>
```

insert:

```tsx
        {recapVisible && (
          <Pressable
            style={({ pressed }) => [
              styles.recapCard,
              { transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={() => router.push(`/recap/${latestCompletedYear}`)}
          >
            <Text style={styles.recapEmoji}>🎟️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.recapTitle}>Your Year at the Movies</Text>
              <Text style={styles.recapSub}>See your {latestCompletedYear} recap →</Text>
            </View>
          </Pressable>
        )}
```

- [ ] **Step 3: Add the styles**

Add these keys to the existing `StyleSheet.create({...})` in the same file (palette is fixed brand, independent of theme — matches the poster):

```tsx
  recapCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#C41E3A',
  },
  recapEmoji: { fontSize: 28 },
  recapTitle: { color: '#F5EBD9', fontWeight: '800', fontSize: 16 },
  recapSub: { color: '#C41E3A', fontSize: 12, marginTop: 2 },
```

- [ ] **Step 4: Verify gating + type-check**

Run: `npx tsc --noEmit`
Expected: PASS.
Manual: with `EXPO_PUBLIC_DEV_USER_IDS` containing your id (or in `__DEV__`), the card shows on the Analytics tab and routes to the recap. With the flag OFF and a non-dev id, it's hidden.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/analytics.tsx"
git commit -m "feat(recap): add dark-launched recap entry card to analytics tab"
```

---

## Task 8: Full verification gate + data-parity QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all green. Fix anything red before proceeding.

- [ ] **Step 2: Data-parity check (real account, dev build)**

With your dev account, open the recap for a completed year and compare `filmsSeen` / hours against the existing Analytics tab totals for the overlapping period.
Expected: the recap's counts reconcile with the shipped Analytics numbers (allowing for the recap being year-scoped vs all-time). Investigate any mismatch before launch.

- [ ] **Step 3: Confirm production dormancy**

Verify there is **no** PostHog flag `year_recap_enabled` set to ON in the production project (it should not exist yet, or be OFF). Confirm a non-dev production user sees no entry card.
Expected: feature invisible to users; route only reachable by direct deep link.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feature/year-at-the-movies-recap
gh pr create --title "feat: Your Year at the Movies recap (dark-launched)" \
  --body "Implements the Year-at-the-Movies recap per docs/superpowers/specs/2026-05-30-year-at-the-movies-recap-design.md. Ships dormant behind PostHog flag year_recap_enabled (default OFF); founder-visible via EXPO_PUBLIC_DEV_USER_IDS/__DEV__. Launch = flip the flag in Dec 2026."
```

---

## Out of scope (do NOT build here — tracked for later)
- Phase B: December push notification ("Your <year> is ready").
- Phase C: swipeable reveal sequence wrapping this poster as the finale.
- Monetization: hi-res/watermark-free export, premium reveal cards, extra stats behind PocketStubs+.
