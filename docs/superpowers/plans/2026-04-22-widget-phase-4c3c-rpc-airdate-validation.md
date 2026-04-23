# Widget Phase 4c.3c — RPC air_date Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the widget-bypasses-TS-guard bug by adding a restrictive server-side `air_date` check inside the `mark_episode_watched` RPC, and give the widget user a visible wiggle when a tap is rejected.

**Architecture:** One migration (RPC body change, signature preserved). Two widget Swift file edits (intent catch block + eyeball button modifier chain). UserDefaults-based per-show rejection counter keyed by `userTvShowId`. No TS types regen, no bulk-path changes, no telemetry.

**Tech Stack:** Postgres PL/pgSQL (Supabase RPC), Swift 5 / SwiftUI (iOS 17+ WidgetKit extension), AppIntents framework, App Group shared UserDefaults (`group.com.pocketstubs.app`).

**Spec:** `docs/superpowers/specs/2026-04-22-widget-phase-4c3c-rpc-airdate-validation-design.md`

**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File Map

| File | Action | Purpose |
|--|--|--|
| `public.mark_episode_watched` (Supabase RPC) | Modify | Add air_date guard after auth check, before idempotent insert |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift` | Modify | Replace silent catch with per-show UserDefaults counter increment |
| `expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift` | Modify | Chain `.symbolEffect(.wiggle, value:)` on rejection counter + add private `rejectionCount(for:)` helper |

No new files. No test files — widget extension has no unit test target (per prior 4b/4c precedent); validation is via MCP smoke tests + device repro.

---

## Task 1: Apply RPC migration + smoke test

**Context for implementer:** The `mark_episode_watched` RPC currently lives in Supabase (applied via MCP migrations through PRs #388, #389, #391). It is NOT committed to `supabase/migrations/` — that's the established convention for this project since the 4b.3 session. Do not create a SQL file in the repo. Apply via `mcp__plugin_supabase_supabase__apply_migration`.

The `tv_show_episodes` table (from PR #392) already exists in the database with `air_date date` (nullable), PK `(tmdb_show_id, season_number, episode_number)`. Confirmed via `information_schema.columns`.

**Files:**
- Apply via: `mcp__plugin_supabase_supabase__apply_migration`
- Verify via: `mcp__plugin_supabase_supabase__execute_sql`

- [ ] **Step 1: Verify current RPC body before change**

Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `wliblwulvsrfgqcnbzeh`:

```sql
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'mark_episode_watched';
```

Expected: function definition starting with `CREATE OR REPLACE FUNCTION public.mark_episode_watched(...)` — signature `(p_user_tv_show_id uuid, p_tmdb_show_id integer, p_season_number integer, p_episode_number integer, p_total_episodes_in_season integer)` returning `jsonb`. Confirm this matches the `## Scope -> 1. Migration` section of the spec — if it diverges, STOP and re-read the spec with the current body before proceeding.

- [ ] **Step 2: Verify `tv_show_episodes` has rows for testing**

```sql
SELECT tmdb_show_id, season_number, episode_number, air_date
FROM public.tv_show_episodes
WHERE air_date IS NOT NULL
ORDER BY air_date DESC
LIMIT 5;
```

Expected: at least 5 rows. Note one aired episode (`air_date < CURRENT_DATE`) and one unaired episode (`air_date > CURRENT_DATE`) for Step 5.

- [ ] **Step 3: Pick a test user + user_tv_show_id**

```sql
SELECT uts.id AS user_tv_show_id, uts.user_id, uts.tmdb_show_id, uts.name
FROM public.user_tv_shows uts
JOIN public.tv_show_episodes tse
  ON tse.tmdb_show_id = uts.tmdb_show_id
WHERE tse.air_date > CURRENT_DATE
LIMIT 3;
```

Expected: at least one row where the user has a show whose catalog contains a future-dated episode. Record the `user_tv_show_id`, `user_id`, `tmdb_show_id`, and the future `(season_number, episode_number)` from Step 2. This is the test fixture for Step 5.

If no rows come back, the device state is too shallow for a clean smoke test — skip to Step 4 and use a synthetic `user_tv_show_id` (any uuid) for the missing-row test only, and do the aired/unaired tests manually on device.

- [ ] **Step 4: Apply the migration**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `wliblwulvsrfgqcnbzeh`
- name: `add_air_date_guard_to_mark_episode_watched`
- query: (use the full `CREATE OR REPLACE FUNCTION public.mark_episode_watched(...)` body from the spec's "Scope -> 1. Migration" section, reproduced below verbatim)

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
  -- is in the future. All three cases share ERRCODE '22023'.
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

Expected: `mcp__plugin_supabase_supabase__apply_migration` returns success. If it fails with a signature-conflict or syntax error, STOP — do not retry with modifications; report the error verbatim to the driver.

- [ ] **Step 5: Smoke test — aired episode (happy path)**

Pick an `(tmdb_show_id, season_number, episode_number)` from Step 2 with `air_date < CURRENT_DATE` AND matches a real `user_tv_shows` row from Step 3.

Run via `mcp__plugin_supabase_supabase__execute_sql` with project_id `wliblwulvsrfgqcnbzeh`:

```sql
-- Impersonate the real user for auth.uid() to resolve.
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<USER_ID_FROM_STEP_3>", "role": "authenticated"}';
SELECT public.mark_episode_watched(
  '<USER_TV_SHOW_ID_FROM_STEP_3>'::uuid,
  <TMDB_SHOW_ID>::int,
  <SEASON_NUMBER>::int,
  <AIRED_EPISODE_NUMBER>::int,
  <TOTAL_EPISODES>::int
);
```

Expected: returns JSON `{"flipped": false}` (or `true` if the show is Ended/Canceled and this mark completes it). No exception raised.

Clean up after the test:

```sql
DELETE FROM public.user_episode_watches
WHERE user_id = '<USER_ID_FROM_STEP_3>'
  AND user_tv_show_id = '<USER_TV_SHOW_ID_FROM_STEP_3>'
  AND season_number = <SEASON_NUMBER>
  AND episode_number = <AIRED_EPISODE_NUMBER>
  AND watched_at > NOW() - INTERVAL '5 minutes';
```

This removes ONLY the row inserted during the test. Verify the delete returned 1 row before moving on. If the user had already watched this episode pre-test, the idempotent insert was a no-op and the delete returns 0 — that's fine, no cleanup needed.

- [ ] **Step 6: Smoke test — unaired episode**

Pick an `(tmdb_show_id, season_number, episode_number)` from Step 2 with `air_date > CURRENT_DATE`.

```sql
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<USER_ID_FROM_STEP_3>", "role": "authenticated"}';
SELECT public.mark_episode_watched(
  '<USER_TV_SHOW_ID_FROM_STEP_3>'::uuid,
  <TMDB_SHOW_ID>::int,
  <SEASON_NUMBER>::int,
  <UNAIRED_EPISODE_NUMBER>::int,
  <TOTAL_EPISODES>::int
);
```

Expected: error `22023 "Episode not eligible to mark watched"`. Verify no new row in `user_episode_watches`:

```sql
SELECT COUNT(*) FROM public.user_episode_watches
WHERE user_id = '<USER_ID_FROM_STEP_3>'
  AND user_tv_show_id = '<USER_TV_SHOW_ID_FROM_STEP_3>'
  AND season_number = <SEASON_NUMBER>
  AND episode_number = <UNAIRED_EPISODE_NUMBER>;
```

Expected: count = 0.

- [ ] **Step 7: Smoke test — missing catalog row**

Synthesize a non-existent `(tmdb_show_id, season_number, episode_number)` tuple. Use `tmdb_show_id = 9999999`, `season = 99`, `episode = 99` — guaranteed not to match any real TMDB show.

```sql
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<USER_ID_FROM_STEP_3>", "role": "authenticated"}';
SELECT public.mark_episode_watched(
  '<USER_TV_SHOW_ID_FROM_STEP_3>'::uuid,
  9999999::int,
  99::int,
  99::int,
  10::int
);
```

Expected: error `22023 "Episode not eligible to mark watched"`. Verify no insert happened.

- [ ] **Step 8: Confirm migration recorded**

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE name = 'add_air_date_guard_to_mark_episode_watched';
```

Expected: one row. If zero, the apply didn't land — re-check Step 4 result.

- [ ] **Step 9: Commit the spec reference (no SQL file, per convention)**

No SQL file to commit — the migration is applied via MCP only. However, create a marker commit recording that the RPC change landed, with the migration version. This gives future debugging a git anchor.

From worktree root:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
git commit --allow-empty -m "$(cat <<'EOF'
feat(tv): Phase 4c.3c — mark_episode_watched rejects unaired episodes

Migration add_air_date_guard_to_mark_episode_watched applied via MCP.
RPC now SELECTs tv_show_episodes.air_date before the idempotent insert
and raises ERRCODE 22023 on missing row, null air_date, or future
air_date. Signature and return type unchanged; no TS types regen.

Widget feedback surface in follow-up commit (EyeballButton wiggle).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: new empty commit on the feature branch. This is intentional — the RPC change has no file to track in this repo; the empty commit serves as documentation.

---

## Task 2: Widget intent catch block + eyeball wiggle

**Context for implementer:** Two Swift file edits in one commit. Both are tightly coupled — the intent writes the counter, the view reads it. Shipping independently would break the UX (button writes without view response, or view reads without a writer).

The widget extension has NO unit test target. Do not attempt to add tests. Validate via `npx tsc --noEmit` (catches Swift-adjacent TS issues like outdated types) and device test (Task 3).

### File 2a: MarkEpisodeWatchedIntent.swift

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift`

- [ ] **Step 1: Read current file**

Use Read on the absolute path `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation/expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift`.

Current catch block (lines 51-53):

```swift
} catch {
    // Silent. Intentional.
}
```

- [ ] **Step 2: Replace the silent catch with a per-show counter write**

Use Edit with:

old_string:
```swift
        } catch {
            // Silent. Intentional.
        }
```

new_string:
```swift
        } catch {
            // Phase 4c.3c: surface rejection to the widget view via a
            // per-show counter. Covers the server-side air_date guard
            // (ERRCODE 22023) and any other error path (network, auth).
            // Per-show key so a rejection on show X doesn't animate
            // show Y's eyeball.
            if let defaults = UserDefaults(suiteName: AppGroup.identifier) {
                let key = "widget.markRejection.\(userTvShowId)"
                defaults.set(defaults.integer(forKey: key) + 1, forKey: key)
            }
        }
```

Expected: file now writes to App Group UserDefaults on error. The existing 1.5s minimum delay and `WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)` call after the catch block are unchanged.

- [ ] **Step 3: Verify file compiles conceptually**

Re-read the modified file. Confirm:
- `AppGroup.identifier` is accessible (it's in the same widget target — imported via `import Foundation` at top or via module boundary; since `AppGroup` is a plain enum in the same target, no explicit import needed)
- `userTvShowId` is in scope (it's a `@Parameter` stored property on the struct)
- The `catch` binding `error` is still unused (`catch` without binding is fine — we don't need the error value, only the fact of the failure)

If any reference is unresolved, STOP and report.

### File 2b: EyeballButton.swift

**Files:**
- Modify: `expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift`

- [ ] **Step 4: Read current file**

Current modifier chain on the eyeball Image (lines 18-29 of current file):

```swift
Image(systemName: "eye")
    .font(.system(size: 12, weight: .medium))
    .foregroundColor(.primary)
    // Phase 3: bounce when current_episode changes (post-success reload)
    .symbolEffect(.bounce, value: show.currentEpisode)
    .frame(width: 24, height: 24)
    .background(Color(.tertiarySystemFill))
    .clipShape(Circle())
    // Phase 3: 44pt Apple HIG minimum hit target via inset rectangle
    // — visual size unchanged (24x24) but tap area expands ~10pt
    // on all sides to give users a more forgiving tap region.
    .contentShape(Rectangle().inset(by: -10))
```

- [ ] **Step 5: Chain the wiggle modifier after the existing bounce**

Use Edit with:

old_string:
```swift
                        .symbolEffect(.bounce, value: show.currentEpisode)
                        .frame(width: 24, height: 24)
```

new_string:
```swift
                        .symbolEffect(.bounce, value: show.currentEpisode)
                        // Phase 4c.3c: wiggle on RPC rejection (unaired or
                        // missing catalog row). Reads per-show counter from
                        // App Group UserDefaults; timeline reload after the
                        // intent triggers body re-eval which re-reads the
                        // counter and drives this symbolEffect.
                        .symbolEffect(.wiggle, value: rejectionCount(for: show.userTvShowId))
                        .frame(width: 24, height: 24)
```

Expected: two `.symbolEffect` modifiers chained. Bounce fires on successful episode advance (existing). Wiggle fires on rejection count change (new).

- [ ] **Step 6: Add the `rejectionCount(for:)` private helper**

Use Edit with:

old_string:
```swift
struct EyeballButton: View {
    let show: Show

    var body: some View {
```

new_string:
```swift
struct EyeballButton: View {
    let show: Show

    // Phase 4c.3c: reads the per-show rejection counter written by
    // MarkEpisodeWatchedIntent's catch block. Computed per body
    // re-render; SwiftUI observes the changing value on the
    // .symbolEffect(.wiggle) modifier above.
    private func rejectionCount(for userTvShowId: String) -> Int {
        UserDefaults(suiteName: AppGroup.identifier)?
            .integer(forKey: "widget.markRejection.\(userTvShowId)") ?? 0
    }

    var body: some View {
```

Expected: helper method sits above `body`. `AppGroup.identifier` is accessible (same target, plain enum).

- [ ] **Step 7: Run type-check baseline**

From the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
npx tsc --noEmit 2>&1 | tail -5
```

Expected: zero TS errors. Swift files are not type-checked here — Swift-side validation is deferred to device build in Task 3. `tsc` running clean means no TS types were broken by anything we did (sanity check — we didn't touch TS).

- [ ] **Step 8: Run full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -10
```

Expected: all three pass. Test count should match the baseline from worktree creation (762/762 on 2026-04-20).

- [ ] **Step 9: Commit**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
git add expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift
git commit -m "$(cat <<'EOF'
feat(widget): Phase 4c.3c — eyeball wiggle on RPC rejection

Intent catch block now writes a per-show rejection counter to App
Group UserDefaults (key: widget.markRejection.<userTvShowId>).
EyeballButton chains a second .symbolEffect(.wiggle, value:) on that
counter — timeline reload after the intent triggers body re-eval,
which re-reads the counter, which drives the wiggle.

Per-show key prevents cross-contamination: a rejection on show X
doesn't wiggle show Y's eyeball.

Closes the UX gap where widget taps on unaired episodes silently
did nothing. With the RPC guard (previous commit) + this visual
breadcrumb, users get honest feedback that the mark was rejected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: clean commit. No hook failures — pre-commit hooks in this repo run lint + tsc + jest, all should be clean per Step 8.

---

## Task 3: Device validation

**Context for implementer:** This is manual. Do not attempt to automate. The purpose is to catch real-device integration issues that MCP smoke tests + type-checks can't surface: the App Group wiring, the SwiftUI symbol effect visual, and the actual eyeball button response on a live widget.

**Files:**
- No code changes expected. If device testing surfaces a bug, reopen Task 1 or Task 2 with a fix commit.

- [ ] **Step 1: Build + install the widget on device**

From the worktree:

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
npx expo prebuild --clean
npx expo run:ios --device
```

Alternative: EAS build if TestFlight is the preferred distribution for testing. User preference per CineTrak convention — check with the driver.

Expected: app launches on device with the widget extension built in. If build errors reference the Swift edits, STOP and re-check Task 2 steps 5-6 for missing imports or typos.

- [ ] **Step 2: Configure widget + pick a show with an unaired next episode**

On device:
1. Add the PocketStubsWidget (Continue Watching) to home screen
2. In the app, open a Returning Series whose next episode has not yet aired (check `docs/superpowers/specs/2026-04-22-widget-phase-4c3c-rpc-airdate-validation-design.md` for the Breaking Bad test case from 2026-04-20 or pick an equivalent currently-airing show)
3. Ensure the show is at a progress point where the next episode is still unaired (e.g., last aired is S3E7 but S3E8 airs Friday)
4. Open the widget — verify the show appears with an eyeball button

- [ ] **Step 3: Tap the unaired eyeball — expect wiggle, no DB write**

1. Tap the eyeball button for the show whose next episode is unaired
2. Expect: eyeball wiggles (side-to-side SF Symbol animation). No bounce (bounce is for success).
3. Wait for the 1.5s minimum disabled-state to pass
4. Expect: widget state unchanged — same show, same `current_episode`

Verify server-side:

```sql
SELECT * FROM public.user_episode_watches
WHERE user_tv_show_id = '<TEST_SHOW_ID>'
  AND season_number = <UNAIRED_SEASON>
  AND episode_number = <UNAIRED_EPISODE>;
```

Expected: zero rows (no insert happened because the RPC raised 22023).

- [ ] **Step 4: Tap an aired eyeball — expect bounce, successful mark**

1. Pick a different show whose NEXT episode has aired (or the same show but step back in progress so the next episode is aired)
2. Tap the eyeball button
3. Expect: eyeball bounces (the existing Phase 3 effect on `show.currentEpisode` change). No wiggle.
4. Widget reloads, `current_episode` increments by 1

Verify server-side:

```sql
SELECT * FROM public.user_episode_watches
WHERE user_tv_show_id = '<TEST_SHOW_ID>'
  AND season_number = <CURRENT_SEASON>
  AND episode_number = <AIRED_EPISODE>
ORDER BY watched_at DESC LIMIT 1;
```

Expected: one row with `watched_at` within the last minute.

- [ ] **Step 5: Verify per-show isolation**

If the widget shows more than one tracked show:
1. Tap an unaired eyeball on show A — verify ONLY show A's eyeball wiggles, not show B's
2. Tap an aired eyeball on show B — verify ONLY show B's eyeball bounces, not show A's

Expected: no cross-contamination. Per-show counters keep the feedback localized.

- [ ] **Step 6: Record findings and commit any fixes**

If all four expectations passed, no commit needed. Move to Task 4.

If any step failed, the fix belongs in Task 2 with a follow-up commit on this branch. Typical failure modes and their fixes:
- Wiggle doesn't fire → verify `.symbolEffect(.wiggle, value:)` is below `.symbolEffect(.bounce, value:)` — SwiftUI processes modifiers outside-in; order matters. Also verify `AppGroup.identifier` is reachable from `EyeballButton.swift`.
- Wiggle fires on every eyeball → the counter key is shared across shows. Re-check `rejectionCount(for:)` uses `\(userTvShowId)` in the key.
- DB row inserted on unaired tap → the RPC guard didn't land. Re-run Task 1 smoke tests.

---

## Task 4: PR + code review + merge

**Context for implementer:** Follow the established 4b/4c pattern: push branch, open PR, request code reviews, address feedback, squash-merge.

- [ ] **Step 1: Push the feature branch**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
git push -u origin feat/widget-4c3-rpc-airdate-validation 2>&1 | tail -5
```

Expected: `Branch 'feat/widget-4c3-rpc-airdate-validation' set up to track 'origin/feat/widget-4c3-rpc-airdate-validation'.`

- [ ] **Step 2: Open the PR**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
gh pr create --title "feat(widget): Phase 4c.3c — server-side air_date guard + eyeball wiggle" --body "$(cat <<'EOF'
## Summary

- Adds restrictive `air_date` guard to `public.mark_episode_watched` RPC — rejects unaired episodes and missing catalog rows with `ERRCODE 22023`
- Gives the widget user visual feedback on rejection via per-show eyeball wiggle (`.symbolEffect(.wiggle, value:)`) driven by App Group UserDefaults counter
- Closes the widget-bypasses-TS-guard bug confirmed on 2026-04-20 device validation (widget called RPC directly, RPC accepted any tuple)

## Design decisions

| Decision | Value |
|--|--|
| Missing catalog row | Restrictive (fail-closed) — same `22023` as unaired |
| Error code | Shared `22023` for both unaired + missing-row (one widget code path) |
| Date comparison | `CURRENT_DATE` (PG idiom; Supabase session TZ is UTC) |
| Breadcrumb | Per-show eyeball wiggle (iOS widgets don't support haptics) |
| Bulk-path parity | Out of scope — TS-side filter from #390 covers those paths |

Full spec: `docs/superpowers/specs/2026-04-22-widget-phase-4c3c-rpc-airdate-validation-design.md`.

## Test plan

- [x] MCP `execute_sql` smoke tests — aired, unaired, missing catalog row (all three expected results observed)
- [x] Pre-PR check clean (`npm run lint && npx tsc --noEmit && npm test`)
- [x] Device validation — unaired tap wiggles + no DB write, aired tap bounces + increments, per-show isolation confirmed

## Changed

- Migration `add_air_date_guard_to_mark_episode_watched` applied via MCP (not committed to `supabase/migrations/` per convention)
- `expo-plugins/widget-extension/src/PocketStubsWidget/Intents/MarkEpisodeWatchedIntent.swift` — catch block writes per-show rejection counter
- `expo-plugins/widget-extension/src/PocketStubsWidget/Views/EyeballButton.swift` — chains `.symbolEffect(.wiggle, value:)` on rejection counter

## Not changed

- `lib/tv-show-service.ts` (TS-side guard from #390 still does the pre-check)
- `lib/database.types.ts` (RPC signature + return type unchanged)
- `sync_tv_show_progress` and bulk-path RPCs (out of scope; TS filter sufficient)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -5
```

Expected: PR URL printed. Record it for the vault update in Task 5.

- [ ] **Step 3: Dispatch code review**

Use the Agent tool with `subagent_type: "superpowers:code-reviewer"` (or the code-review skill) with a prompt including:
- Branch name `feat/widget-4c3-rpc-airdate-validation`
- Two commits of interest: the `feat(tv):` empty commit (RPC applied via MCP) and the `feat(widget):` Swift commit
- Context: the `docs/superpowers/specs/` file for background
- Focus areas: SwiftUI modifier order, App Group UserDefaults key collision risk, RPC error-code correctness, per-show counter isolation

The review will surface issues in the same style as prior 4b/4c PRs. Fix any findings with follow-up commits on this branch.

- [ ] **Step 4: Wait for CI**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
gh pr checks 2>&1 | tail -10
```

Expected: `Lint, Types & Tests` passes. `Cloudflare Pages` and `Vercel` pass. `Security Audit` is pre-existing noise (transitive Expo deps) — not a blocker for merge; mirrors PR #393's state.

- [ ] **Step 5: Squash-merge**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-4c3-rpc-validation
gh pr merge --squash --auto 2>&1 | tail -3
```

Expected: auto-merge enabled. Merges when required checks pass.

- [ ] **Step 6: Update the vault**

Use `mcp__obsidian__patch_note` to update `Projects/CineTrak/Features/Widget Phase 4c - Episode Catalog + Unaired Guards.md` — change section 3c status from "NEXT SESSION" to "shipped" and link the PR.

Use `mcp__obsidian__patch_note` to append to `Daily Notes/2026-04-22.md` — add the PR to the `## Shipped` section.

Expected: vault reflects current state. Next session's kickoff prompt lives in the daily note.

---

## Self-Review

Spec coverage check:
- Migration body with guard insertion: Task 1 ✓
- Widget intent catch block with per-show counter: Task 2 File 2a ✓
- EyeballButton wiggle modifier chain: Task 2 File 2b Steps 4-6 ✓
- Three MCP smoke test cases (aired, unaired, missing row): Task 1 Steps 5-7 ✓
- Device validation of widget repro: Task 3 ✓
- Per-show isolation: Task 3 Step 5 ✓
- No TS types regen: noted in Task 2 Step 7 ✓
- Bulk paths out of scope: noted in PR body Task 4 Step 2 ✓

Placeholder scan: no "TBD" / "TODO" / "add validation" lines in the plan. Fixture placeholders (`<USER_ID_FROM_STEP_3>`, etc.) are instructions for the implementer to substitute at runtime — those are legitimate parameterization, not placeholders.

Type / naming consistency: `AppGroup.identifier` used consistently in both intent and view. `widget.markRejection.\(userTvShowId)` key uses the same pattern in both files. `.symbolEffect(.bounce, ...)` ordering preserved relative to new `.symbolEffect(.wiggle, ...)`.
