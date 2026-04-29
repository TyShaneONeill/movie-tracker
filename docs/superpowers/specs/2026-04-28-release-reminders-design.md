# Spec — Release Reminders v1

**Date:** 2026-04-28
**Status:** Draft for plan
**Owner:** Tyshane
**Branch:** `feat/release-reminders`

---

## 1. Summary

Daily push notification fired the morning a watchlisted movie becomes available — once per movie per release category (theatrical or streaming). User control via a new in-app `/settings/notifications` page so people who want to mute the feature don't have to disable notifications at the OS level.

This is the **first consumer** of the push-notification infrastructure shipped in PR-series (`PRD-push-notifications.md` Phases 1 and 2). Tables, generic sender, receipt checker, client service, and hook are all already in place — this spec adds the consumer cron + edge function + settings UI.

## 2. Why now

- Push infra is built and idle. No consumers wired up. Capital expense already paid; marginal cost of shipping the first consumer is small.
- Release calendar pipeline (multiple recent PRs) is fast, accurate, region-clean, self-healing, and observable. It's the right data spine for this feature.
- Letterboxd has zero parity on release reminders. Builds a daily-engagement loop that an ad-supported app needs.
- 12-Month Business Plan has push notifications scheduled for Months 3-5; this lands one of the first push consumers ahead of social/digest features.

## 3. Scope

### In v1

- Daily cron fires `send-release-reminders` edge function at **14:00 UTC** (10 AM EDT / 7 AM PDT — morning for US users).
- Edge function: query watchlisted movies releasing today in US region, send one push per (user, movie, category).
- **Categories:** `theatrical` (release_type ∈ {1,2,3}) and `streaming` (release_type = 6). Digital/physical (4, 5) intentionally skipped.
- Dedup via `push_notification_log` — never resend the same (user, tmdb, category) pair.
- New screen `app/settings/notifications.tsx` with one toggle: "Release reminders". On = subscribe; toggling on prompts for OS push permission via the existing `registerForPushNotifications()` flow.
- New row in `app/settings/index.tsx` linking to the notifications page.
- US users only (existing `region='US'` default; multi-region deferred to a separate feature).

### Out of v1

- Day-before / week-before nudges. Day-of only.
- Per-movie bell button on calendar release cards (PRD-release-calendar.md Phase 3 design — discarded in favor of watchlist auto-subscribe).
- `release_reminders` table (no longer needed — derived from `user_movies` + `release_calendar`).
- Daily-digest aggregation when multiple movies release the same day. Single push per movie. Acceptable since watchlist size is small and same-day collisions are rare.
- Multi-region support. Rolls into `Multi-region preferences` future feature.
- Rich-image notifications (poster thumbnails). Plan Phase 4 polish.
- Late-add catch-up. If user adds a movie to watchlist *after* 14:00 UTC on its release day, no push fires. Acceptable v1 limitation.
- Per-platform stagger. Both iOS and Android targeted (Expo Push handles both transparently).

## 4. Architecture

### 4.1 Data flow

```
[ pg_cron — daily 14:00 UTC ]
        |
        v
[ POST /functions/v1/send-release-reminders ]      (Authorization: Bearer service_role_key)
        |
        | 1. SELECT um.user_id, rc.tmdb_id, rc.title, rc.release_type, rc.poster_path
        |    FROM release_calendar rc
        |    JOIN user_movies um ON um.tmdb_id = rc.tmdb_id AND um.status = 'watchlist'
        |    WHERE rc.region = 'US'
        |      AND rc.release_date = CURRENT_DATE
        |      AND rc.release_type IN (1, 2, 3, 6)
        |
        | 2. Compute category for each row:
        |        category = (release_type IN (1,2,3)) ? 'theatrical' : 'streaming'
        |
        | 3. Filter out rows that already fired:
        |    NOT EXISTS (
        |      SELECT 1 FROM push_notification_log
        |      WHERE feature = 'release_reminders'
        |        AND user_id = um.user_id
        |        AND data->>'tmdb_id' = rc.tmdb_id::text
        |        AND data->>'category' = category
        |    )
        |
        | 4. Group: collapse rows that share (user_id, tmdb_id, category) — multiple
        |    theatrical release_type rows for the same movie/region/date pick the
        |    single canonical theatrical push (not 3 pushes).
        |
        | 5. Skip any rows where release_calendar.title IS NULL.
        |    The warming pipeline reconciles null titles separately; we
        |    don't ship pushes with placeholder copy. The next day's
        |    cron will pick them up if they've been reconciled by then.
        |
        | 6. Build payload per group:
        |        title: '🎬 {title} — now in theaters'   (theatrical)
        |        title: '🍿 {title} — now streaming'      (streaming)
        |        body:  ''  (empty for v1; layered with details in Phase 4 polish)
        |        data:  { url: '/movie/{tmdb_id}', tmdb_id, category, feature: 'release_reminders' }
        |
        | 7. POST to internal `send-push-notification` edge function
        |       with user_ids batched and feature = 'release_reminders'
        |       (existing function handles token lookup, opt-out check,
        |       Expo API call, and log insert)
        |
        v
[ User device — lock-screen banner ]
        |
        | tap
        v
[ /movie/{tmdb_id} via expo-router ]
```

### 4.2 Why no new tables

- **Eligibility**: derived live from `user_movies.status='watchlist'` JOIN `release_calendar`. No separate `release_reminders` table is needed because the watchlist *is* the subscription.
- **Opt-out**: existing `notification_preferences` table with `feature='release_reminders'`. Generic `send-push-notification` already filters by this.
- **Dedup**: existing `push_notification_log`. The `data` JSONB column gets `tmdb_id` and `category` so we can NOT-EXISTS-filter on subsequent runs.

The only schema-adjacent change is one **migration** to register the cron job. No table DDL.

### 4.3 Edge function — `send-release-reminders`

```
supabase/functions/send-release-reminders/
├── index.ts          # Deno.serve handler — service-role-key auth; queries; sends
└── config.toml       # verify_jwt = false (internal-only, called by cron)
```

Behavior summary:
1. Validate `Authorization: Bearer <service_role_key>` header (401 otherwise — same pattern as `send-push-notification`).
2. Run the eligibility SQL above (a single PostgREST `select` with appropriate filters; the NOT-EXISTS dedup needs an RPC because PostgREST can't subquery cleanly — see §4.4).
3. Group by `(user_id, tmdb_id, category)`.
4. For each group, build an Expo Push payload and call `send-push-notification` with `feature='release_reminders'`.
5. Return `{ candidates, sent, skipped, errors }` for observability.

Deploy via `supabase functions deploy send-release-reminders`.

### 4.4 Why an RPC, not pure PostgREST

PostgREST cannot express the dedup `NOT EXISTS` cleanly across `release_calendar`, `user_movies`, and `push_notification_log` in a single query. Two options:

- **A — One RPC `get_pending_release_reminders()`**: PL/pgSQL function returning rows ready to send. Cleanest, single round trip, easy to test (`SELECT * FROM get_pending_release_reminders()`).
- **B — Two PostgREST queries client-side**: fetch candidates, fetch existing log rows, dedup in TS. More round trips, more memory, more correctness risk.

**Pick A.** Add an RPC migration alongside the cron migration. RPC accepts no params, runs as `SECURITY DEFINER` (so it can read `user_movies` across users), returns `(user_id uuid, tmdb_id int, category text, title text)`.

### 4.5 Cron migration

```sql
-- supabase/migrations/<timestamp>_schedule_release_reminders_cron.sql

SELECT cron.schedule(
  'send-release-reminders',
  '0 14 * * *',                               -- Daily at 14:00 UTC
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/send-release-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Both `project_url` and `service_role_key` Vault secrets are already created (per the existing `setup_push_cron_jobs.sql` migration that wires `check-push-receipts`). Reuse them.

### 4.6 Client architecture

```
app/settings/
├── index.tsx                  (modified: add "Notifications" row)
└── notifications.tsx          (new: single toggle for v1)

lib/
└── notification-preferences-service.ts   (new: read + upsert)

hooks/
└── use-notification-preferences.ts       (new: React Query wrapper)
```

The notifications screen reads the preference for `feature='release_reminders'`. Toggle ON:
1. Call `registerForPushNotifications()` — prompts for OS permission if undetermined; gets the Expo token; upserts to `push_tokens`.
2. If permission denied, surface a toast: "Enable notifications in Settings to receive release reminders."
3. On success, upsert `notification_preferences` row `(user_id, 'release_reminders', enabled=true)`.

Toggle OFF:
1. Upsert `notification_preferences` row `(user_id, 'release_reminders', enabled=false)`.
2. Do NOT delete push token (other features may still want push when those ship).

## 5. Files to create / modify

### New

| Path | Purpose |
|------|---------|
| `supabase/functions/send-release-reminders/index.ts` | Daily consumer edge function |
| `supabase/functions/send-release-reminders/config.toml` | `verify_jwt = false`, sets `entrypoint` |
| `supabase/functions/send-release-reminders/get-pending-release-reminders.sql.txt` | Reference dump of the RPC body, for human review (real DDL lives in the migration below) |
| `supabase/migrations/<timestamp>_create_get_pending_release_reminders_rpc.sql` | RPC + grant |
| `supabase/migrations/<timestamp>_schedule_release_reminders_cron.sql` | pg_cron schedule |
| `app/settings/notifications.tsx` | New settings page with single toggle |
| `lib/notification-preferences-service.ts` | Service-layer wrapper over `notification_preferences` table |
| `hooks/use-notification-preferences.ts` | React Query hook |
| `__tests__/lib/notification-preferences-service.test.ts` | Unit tests |
| `__tests__/hooks/use-notification-preferences.test.ts` | Hook tests |
| `__tests__/app/settings/notifications.test.tsx` | Screen behavior (toggle on triggers permission flow, off persists, denied permission shows toast) |
| `supabase/functions/send-release-reminders/test.ts` | Deno tests for happy path / opted-out / dedup / no-match |

### Modified

| Path | Change |
|------|--------|
| `app/settings/index.tsx` | Add a "Notifications" row that pushes to `/settings/notifications` |
| `lib/database.types.ts` | Hand-add `notification_preferences` typed helpers (per the regen-wipes-aliases memory). Do NOT run `supabase gen types`. |

## 6. Notification preferences integration

The `notification_preferences` table is already present:

```
notification_preferences (id uuid pk, user_id uuid, feature text, enabled boolean, created_at, updated_at, UNIQUE(user_id, feature))
```

For v1, the only `feature` value used is `'release_reminders'`.

**Default state when no row exists:** treated as `enabled = true` per the existing `send-push-notification` logic (which only filters out users whose row says `enabled = false`). This is the intended semantics: opting in is the default for users who have already granted push permission.

**However**, the user does not get a push reminder until *both* of these are true:
1. They have at least one `push_tokens` row (i.e., they granted OS permission at some point).
2. They do NOT have a `notification_preferences` row with `enabled = false` for `release_reminders`.

Because OS permission is requested only when they toggle ON in the settings screen (or via some future onboarding moment), users who have never visited the settings screen will have no `push_tokens` row, and therefore receive no pushes. This is correct — we don't want to ambush users with notifications.

## 7. Permission flow

Re-uses the existing `registerForPushNotifications()` helper from `lib/push-notification-service.ts`. No new permission code.

User journey:
1. User taps Settings → Notifications.
2. Sees "Release reminders" toggle, currently OFF.
3. Taps the toggle to turn it ON.
4. OS permission prompt appears (if undetermined).
   - **Granted:** push token registered, preference row written `enabled=true`. Toggle stays ON.
   - **Denied:** toast surfaces guidance. Toggle reverts to OFF (preference row not written or set to false).
   - **Already granted:** no prompt. Token refresh, preference row written. Toggle ON immediately.
5. To turn off: tap toggle to OFF. Preference row updated `enabled=false`. No OS permission change.

## 8. Cron timing rationale

- **14:00 UTC** = 10 AM EDT / 7 AM PDT — morning for US users, well after typical theatrical-Friday-AM "doors open" time.
- **Daily** — simpler than cron-by-region. We can stagger when multi-region lands.
- **Not configurable** — keep v1 lean. If users complain about timing, we can ship per-user-quiet-hours later.

## 9. Dedup details

### Dedup key
`(user_id, tmdb_id, category)` where `category ∈ {'theatrical', 'streaming'}`.

### Storage
The dedup signal lives in `push_notification_log.data` JSONB. Every push we send via the consumer includes `{tmdb_id, category}` in the data payload. The RPC NOT-EXISTS-filters against existing rows for the same `feature='release_reminders'`.

### Lifetime
Indefinite. `push_notification_log` rows persist permanently (no cleanup cron specified). A user gets max 2 release-reminder pushes per movie ever (one theatrical, one streaming) regardless of how many calendar entries the movie accumulates.

### Edge case — release date moved
If TMDB updates a movie's `release_date` (e.g., delayed from 2026-05-01 to 2026-06-15) *after* we already sent the push, the user does not get re-notified on the new date. Acceptable: they already got the "now in theaters" announcement; if the release was postponed, they'll find out via in-app calendar browsing or social channels.

## 10. Error handling

| Scenario | Behavior |
|----------|----------|
| RPC returns 0 rows | Edge function returns `{ candidates: 0, sent: 0 }`. Fast path. |
| User has preference `enabled=false` | `send-push-notification` skips them; logged as `skipped: 'opted_out'`. |
| User has no push token | `send-push-notification` returns `sent: 0` for that user; nothing logged in `push_notification_log` (existing behavior). Acceptable — happens when a user toggled ON in the past, then revoked OS permission. |
| Expo `DeviceNotRegistered` error | Existing `send-push-notification` deletes the token; user simply doesn't receive. They can re-enable via settings. |
| Edge function crash | pg_cron logs the failure. No retry today. Acceptable v1 since missed reminder is a one-day window — the next day's cron handles new releases. Document as known limitation. |
| Authorization header missing/wrong | 401 returned, cron `pg_net` request fails. PostHog/Sentry would not catch this without explicit alerting; acceptable given low risk (the auth is internal-only). |
| `notification_preferences` row exists with `enabled=true` but token is missing | Same as "no push token" above. The toggle reflects the preference, not the live OS state. Acceptable v1. |

## 11. Testing strategy

### Client (Jest)

| Test | What it asserts |
|------|----------------|
| `notification-preferences-service.test.ts: get returns default-true when no row` | Service treats absence as enabled |
| `notification-preferences-service.test.ts: get returns false when row.enabled=false` | Service respects explicit opt-out |
| `notification-preferences-service.test.ts: setEnabled upserts with onConflict user_id,feature` | Single row per user/feature |
| `use-notification-preferences.test.ts: toggle invalidates query cache` | UI stays in sync after mutation |
| `notifications.test.tsx: ON toggle calls registerForPushNotifications` | Permission flow wired correctly |
| `notifications.test.tsx: ON when permission denied surfaces toast and stays OFF` | Graceful degradation |
| `notifications.test.tsx: OFF persists preference without altering token` | Toggle off doesn't unregister token |

### Edge function (Deno)

| Test | What it asserts |
|------|----------------|
| `test.ts: rejects requests without service_role key` | 401 |
| `test.ts: happy path — one watchlist + today release → 1 push sent` | RPC results plumbed into send-push-notification |
| `test.ts: skips when push_notification_log already has matching (user, tmdb, category)` | Dedup |
| `test.ts: skips users with notification_preferences.enabled=false` | Opt-out respected (already covered by send-push-notification, but verify integration) |
| `test.ts: 0 candidates → returns {sent: 0}` | No-op fast path |

### Manual device QA (TestFlight build)

1. Open app → Settings → Notifications → toggle Release reminders ON.
2. Confirm OS permission prompt shows; grant.
3. Verify a row in `push_tokens` (Supabase Studio).
4. Add a movie to watchlist whose `release_calendar.release_date = today` and `region = 'US'` and `release_type IN (1,2,3,6)`. (Use Supabase Studio to insert a synthetic row if needed.)
5. Manually invoke the edge function: `supabase functions invoke send-release-reminders --no-verify-jwt`.
6. Verify push arrives on device with correct title and emoji.
7. Tap notification → confirm app opens to `/movie/{tmdb_id}`.
8. Re-invoke the function. Confirm no duplicate push (dedup working).
9. Toggle Release reminders OFF in settings. Re-add a synthetic same-day release. Re-invoke. Confirm no push (opt-out working).

### Verification gate

`npm run lint && npx tsc --noEmit && npm test` — must be clean before PR.

## 12. Rollout

1. Merge PR.
2. Apply two new migrations: RPC + cron. (Supabase MCP: `apply_migration`.)
3. Deploy edge function: `supabase functions deploy send-release-reminders` (or via Supabase MCP `deploy_edge_function`).
4. Confirm `pg_cron` job is scheduled: `SELECT * FROM cron.job WHERE jobname = 'send-release-reminders';`.
5. PostHog instrumentation via the existing `analytics` export from `lib/analytics.ts`:
   - `analytics.track('notifications:toggle_changed', { feature: 'release_reminders', enabled: true|false })` from the settings screen on toggle commit.
   - `analytics.track('release_reminder:tapped', { tmdb_id, category })` from `handleNotificationResponse` in `lib/push-notification-service.ts` when the response's `data.feature === 'release_reminders'`. Wiring point: extend the existing handler to inspect `data.feature` before navigating; emit the event, then call `router.push(url)` as today.
6. Wait for the next 14:00 UTC fire and inspect `push_notification_log` for delivery rate.

## 13. Observability

- `push_notification_log.feature = 'release_reminders'` filterable in Supabase Studio.
- Edge function returns `{ candidates, sent, skipped, errors }` in its response body — captured by `pg_cron` job logs.
- Sentry is already wired in the worktree for client-side errors; the settings screen should surface permission errors via `Sentry.captureException` if they're unexpected (not the user-denied case).
- PostHog: opt-in rate (`notifications:toggle_changed enabled=true / total users`) and tap-through rate (`release_reminder:tapped / sent`).

## 14. Future work (not in v1)

| Item | Why it's deferred |
|------|------------------|
| Day-before nudge | Earn opt-in trust on day-of first; layer in v2 if tap-through is high |
| Per-region cron staggering | Blocked on multi-region preferences feature |
| Daily digest aggregation when ≥3 movies release same day | Watchlist sizes are small; collisions rare |
| Rich notifications with poster image | iOS notification service extension is a significant lift |
| Per-movie bell (PRD original design) | Inversion of subscription model; only revisit if users complain about lack of granularity |
| `release_reminders` table for explicit reminders | Same — only if explicit-bell pattern is reintroduced |
| Late-add catch-up (movie added to watchlist after 14:00 UTC of release day) | Edge case; user can still see "now in theaters" in-app |
| Quiet hours / per-user delivery time | v2 polish |
| In-app notification companion row | Existing PRD calls this dual-delivery; deferred to v2 |
| Re-notification on re-release / resurfacing | Not a real use case for v1 |

---

## Spec self-review checklist

- [x] All "TBD" items flagged as such (PostHog event names in §12 step 5)
- [x] Architecture matches feature description (data flow ↔ scope ↔ files)
- [x] Single-PR scope confirmed (no cross-feature dependencies beyond shipped infra)
- [x] No ambiguous "we'll figure out later" — every decision has a v1 answer
- [x] Schema verified against `lib/database.types.ts` on `origin/main`
- [x] Reuse-existing-components check passed (no new push send/log/preference primitives invented)
- [x] Memory references applied: regen-wipes-types (hand-edit), worktree-env-local (copied), recon-existing-components (used existing PRD + service)
