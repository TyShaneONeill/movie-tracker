# Widget Phase 4c.3c — Server-side RPC air_date Validation Design Spec

**Date:** 2026-04-22
**Status:** Ready for plan
**Feature:** iOS Home Screen Widget — Phase 4c sub-project 3c (server-side air_date guard in `mark_episode_watched` RPC)
**Parent PRD:** `vault://Projects/CineTrak/Features/PRD - iOS Home Screen Widget`
**Parent note:** `vault://Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards` (section 3c)
**Supabase project ref:** `wliblwulvsrfgqcnbzeh`
**Predecessor PRs:** #388 (Phase 4b.3), #389 (Phase 4b.4), #390 (Phase 4c tactical), #391 (Phase 4c stale-cache), #392 (Phase 4c episode catalog), #393 (get-tv-show-details wrapper fix)

## Context

Phase 4c tactical (#390) added client-side air_date filtering in the TS surface: `markSeasonWatched`, `batchMarkEpisodesWatched`, and the single-episode `markEpisodeWatched` all reject unaired episodes before calling the RPC. Phase 4c catalog (#392) populated a shared `public.tv_show_episodes` table (keyed by `tmdb_show_id`, `season_number`, `episode_number`) on every `get-season-episodes` edge-function hit, giving the database per-episode `air_date` authority.

The widget bypasses the TS surface entirely. `MarkEpisodeWatchedIntent.swift` calls `SupabaseWidgetClient.markEpisodeWatched` which hits the `mark_episode_watched` RPC directly. The RPC today accepts any `(tmdb_show_id, season_number, episode_number)` tuple without consulting the catalog. Device validation on 2026-04-20 confirmed: tapping the widget's eyeball button on an unaired next-episode creates a watch row for a future-dated episode, corrupting progress aggregates.

This PR closes the bypass by extending the RPC to read the catalog's `air_date` before the idempotent insert. It also gives the widget a user-visible signal that the tap didn't take effect.

## Design decisions (resolved during brainstorm)

| Decision | Value |
|--|--|
| Missing catalog row semantics | **Restrictive** — fail-closed. Same rejection as unaired. |
| Error code for unaired AND missing-row | **Shared** — `ERRCODE = '22023'` (`invalid_parameter_value`), message `"Episode not eligible to mark watched"` |
| Date comparison function | `CURRENT_DATE` (PG idiom; Supabase session TZ is UTC; zero TZ drift vs PR #390's TS-side today-UTC) |
| Widget breadcrumb | **Yes** — eyeball button wiggle via `.symbolEffect(.wiggle, value:)` (iOS 17+ native) |
| Widget breadcrumb mechanism | App Group UserDefaults rejection counter incremented by intent on throw; timeline entry carries counter; view applies symbol effect |
| Bulk-path parity (`sync_tv_show_progress`) | **Out of scope** for 4c.3c. TS-side filter from #390 is sufficient; can extend later if bulk paths surface their own bypass |
| Poster shake animation | **Out of scope** — eyeball wiggle is spatially attributable and idiomatic; 3e will handle proactive button disable + "Airs Friday" badge |
| Rejection event telemetry | **Out of scope** — no PostHog or Sentry instrumentation this PR. Add if catalog misses become a production concern |
| TS types regen (`lib/database.types.ts`) | **Not required** — RPC signature and return type unchanged; body-only change |

## Scope

### 1. Migration: `add_air_date_guard_to_mark_episode_watched`

Applied via `mcp__plugin_supabase_supabase__apply_migration` (convention established in 4b.3 / 4b.4 / 4c — migrations deployed to the project are not committed to `supabase/migrations/` files).

```sql
CREATE OR REPLACE FUNCTION public.mark_episode_watched(
  p_user_tv_show_id uuid,
  p_tmdb_show_id integer,
  p_season_number integer,
  p_episode_number integer,
  p_total_episodes_in_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_air_date date;
  v_latest_season int;
  v_latest_episode int;
  v_show_total_seasons int;
  v_tmdb_status text;
  v_flipped boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- Phase 4c.3c air_date guard (restrictive / fail-closed).
  -- Rejects when catalog has no row, when the row's air_date is NULL
  -- (catalog corruption or pre-premiere placeholder), or when air_date
  -- is in the future. All three cases share ERRCODE '22023' so the
  -- widget has one code path to handle.
  SELECT air_date INTO v_air_date
  FROM public.tv_show_episodes
  WHERE tmdb_show_id = p_tmdb_show_id
    AND season_number = p_season_number
    AND episode_number = p_episode_number;

  IF NOT FOUND OR v_air_date IS NULL OR v_air_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Episode not eligible to mark watched'
      USING ERRCODE = '22023';
  END IF;

  -- Idempotent insert (unchanged from #391).
  IF NOT EXISTS (
    SELECT 1 FROM public.user_episode_watches
    WHERE user_id = v_user_id
      AND user_tv_show_id = p_user_tv_show_id
      AND season_number = p_season_number
      AND episode_number = p_episode_number
  ) THEN
    INSERT INTO public.user_episode_watches (
      user_id, user_tv_show_id, tmdb_show_id,
      season_number, episode_number, watch_number,
      watched_at, created_at
    )
    VALUES (
      v_user_id, p_user_tv_show_id, p_tmdb_show_id,
      p_season_number, p_episode_number, 1,
      NOW(), NOW()
    );
  END IF;

  -- Recompute current_season / current_episode (unchanged).
  SELECT season_number, episode_number
    INTO v_latest_season, v_latest_episode
  FROM public.user_episode_watches
  WHERE user_tv_show_id = p_user_tv_show_id
    AND user_id = v_user_id
  ORDER BY season_number DESC, episode_number DESC
  LIMIT 1;

  UPDATE public.user_tv_shows
  SET current_season = v_latest_season,
      current_episode = v_latest_episode,
      updated_at = NOW()
  WHERE id = p_user_tv_show_id
    AND user_id = v_user_id;

  -- Auto-flip branch (unchanged from #389 / #391).
  SELECT number_of_seasons, tmdb_status
    INTO v_show_total_seasons, v_tmdb_status
  FROM public.user_tv_shows
  WHERE id = p_user_tv_show_id AND user_id = v_user_id;

  IF v_show_total_seasons IS NOT NULL
     AND v_latest_season >= v_show_total_seasons
     AND p_total_episodes_in_season > 0
     AND v_latest_episode >= p_total_episodes_in_season
     AND v_tmdb_status IN ('Ended', 'Canceled')
  THEN
    UPDATE public.user_tv_shows
    SET status = 'watched',
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = p_user_tv_show_id
      AND user_id = v_user_id
      AND status <> 'watched';

    IF FOUND THEN
      v_flipped := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('flipped', v_flipped);
END;
$function$;
```

**Invariants preserved:**
- Signature unchanged — all existing TS callsites (`lib/tv-show-service.ts#markEpisodeWatched`) and Swift callsites (`SupabaseWidgetClient.markEpisodeWatched`) work without modification
- Return type unchanged — `jsonb` with `{flipped: boolean}`; TS hook logic in `use-episode-actions.ts onSuccess` is untouched
- Auth check semantics unchanged — `42501` still raised for unauthenticated calls, before the air_date check
- Idempotent insert semantics unchanged for eligible episodes
- Auto-flip branch unchanged

**Error surface for callers:**
- `42501` "Unauthenticated" — no session (unchanged)
- `22023` "Episode not eligible to mark watched" — NEW. Covers: no catalog row, null air_date, future air_date
- Default supabase-js error surface otherwise

### 2. Widget intent catch block: `MarkEpisodeWatchedIntent.swift`

Replace silent failure with a rejection-counter write to App Group UserDefaults, then trigger timeline reload.

```swift
// inside MarkEpisodeWatchedIntent.perform()
do {
  try await SupabaseWidgetClient.markEpisodeWatched(
    userTvShowId: userTvShowId,
    tmdbShowId: tmdbShowId,
    seasonNumber: seasonNumber,
    episodeNumber: episodeNumber,
    totalEpisodesInSeason: totalEpisodesInSeason
  )
} catch {
  // Phase 4c.3c: surface rejection to widget view via App Group state.
  // Covers server-side air_date guard (22023) and any other error path.
  if let defaults = UserDefaults(suiteName: "group.com.pocketstubs.shared") {
    let current = defaults.integer(forKey: "widget.markRejectionCount")
    defaults.set(current + 1, forKey: "widget.markRejectionCount")
  }
}
WidgetCenter.shared.reloadTimelines(ofKind: "PocketStubsWidget")
return .result()
```

**Exact App Group suite name and widget kind identifier** will be confirmed during implementation by reading the current `SupabaseWidgetClient.swift` and widget configuration — placeholders `group.com.pocketstubs.shared` and `PocketStubsWidget` are representative.

**Why any error (not just 22023):** the wiggle signals "that didn't take effect." Network errors, auth failures, and `22023` all have the same user meaning — tap was rejected. Narrowing to `22023` only would leave the other failure modes silent and create the same complaint that prompted this work.

### 3. Timeline entry + provider

The timeline entry struct gains a `markRejectionCount: Int` field. The timeline provider reads `defaults.integer(forKey: "widget.markRejectionCount")` when building each entry and sets it on the entry. No clear / reset logic — the counter monotonically increases; the view's symbol effect fires only when `value:` changes across entry boundaries.

### 4. Eyeball button view

In the widget view where the eyeball `Image(systemName:)` is rendered inside the `Button(intent:)`:

```swift
Image(systemName: "eye.fill")
  .symbolEffect(.wiggle, value: entry.markRejectionCount)
```

iOS 17+ native. Requires iOS 17 deployment target (already met — existing widget uses other iOS 17 APIs).

**Why `.wiggle` specifically:** subtle side-to-side rotation, idiomatic iOS "try again" signal, non-destructive (doesn't suggest error severity the way `.bounce.down.byLayer` might).

## Testing

### Supabase MCP `execute_sql` smoke (three cases)

Run as an authenticated session (via service role with `SET LOCAL auth.role = 'authenticated'` and `auth.uid()` set to a test user, or via `execute_sql` on behalf of a real test user). For each case, call `mark_episode_watched` with representative params and observe:

1. **Aired episode (happy path)** — pick a show + episode where `tv_show_episodes.air_date < CURRENT_DATE`. Expect success: JSON `{flipped: boolean}` return, row inserted into `user_episode_watches`.
2. **Unaired episode** — pick a show + episode where `tv_show_episodes.air_date > CURRENT_DATE`. Expect error `22023 "Episode not eligible to mark watched"`. Verify no row inserted.
3. **Missing catalog row** — call with a synthetic `(tmdb_show_id=9999999, season=99, episode=99)` guaranteed not in catalog. Expect error `22023`. Verify no row inserted.

### Swift test coverage

The widget extension target does not currently have a unit-test harness (confirmed by prior Phase 4b / 4c work — all widget-side validation has been manual device testing). Do not add a test harness for this PR; the catch-block behavior is straightforward and better verified by the device-validation step below. If future work introduces a widget test target, retrofit a test that mocks `SupabaseWidgetClient.markEpisodeWatched` to throw and asserts the App Group counter increments.

### Device validation

Reproduce the 2026-04-20 bug:
1. On device with PocketStubs widget configured for a show whose next episode has not aired (Breaking Bad was used last time — pick a current-Returning-Series equivalent)
2. Tap the eyeball button
3. Expect: eyeball wiggles (SwiftUI symbol effect), no new row in `user_episode_watches` for that user, widget state unchanged on next natural refresh, no false "Completed" status flip

### No new TS unit tests required

`lib/tv-show-service.ts#markEpisodeWatched` already filters before calling the RPC (PR #390). The RPC-side guard is defense-in-depth against widget/Shortcuts/external bypass. TS tests would duplicate coverage and don't exercise the RPC surface in any case.

## Out of scope (deferred)

- **Bulk-path RPC guards.** `sync_tv_show_progress` (called by `markSeasonWatched` and `batchMarkEpisodesWatched`) is not modified. TS-side filter from #390 covers those paths. If a future bypass path is discovered for bulk operations, extend the guard as 4c.3d.
- **Catalog coverage warming.** With restrictive semantics, widget users who have never opened a show's season screen in-app will hit the missing-row rejection. In practice, the widget's "currently watching" selection requires the show to be in `user_tv_shows`, and typical usage paths populate the catalog via `get-season-episodes`. If production monitoring shows this edge case is common, follow up with refresh-driven catalog population in `lib/metadata-refresh.ts`.
- **Poster shake animation.** Eyeball wiggle alone is sufficient for the spatial attribution. 3e will eliminate most rejection occurrences by disabling the button proactively.
- **Rejection event telemetry.** No PostHog event, no Sentry breadcrumb. If we need to measure rejection rate, add in a follow-up — requires picking a dimension for the event that justifies ingestion cost.
- **TS types regen.** `lib/database.types.ts` needs no edit; RPC Args and Returns are unchanged.

## Dependencies / sequencing

Depends on: `tv_show_episodes` table (shipped #392), current `mark_episode_watched` RPC body (shipped #391). No dependencies on unshipped work.

Unblocks: Phase 4c.3e widget UX unlocks (uses the catalog directly for button-disable logic).

## References

- [[Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards]] section 3c — proto-design
- [[Daily Notes/2026-04-20]] — bug discovery + predecessor PRs shipped
- [[Daily Notes/2026-04-22]] — this session
- `docs/superpowers/specs/2026-04-20-widget-phase-4c-episode-catalog-design.md` — 3b catalog spec
- `docs/superpowers/specs/2026-04-20-widget-phase-4b4-status-transitions-design.md` — auto-flip spec (referenced in auto-flip branch of RPC)
- PR #390 — client-side tactical guards (TS surface)
- PR #391 — flipped-signal return shape
- PR #392 — `tv_show_episodes` catalog migration
