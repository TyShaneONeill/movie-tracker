# Design Spec: TV Episode Push Notifications (v1)

**Date**: 2026-04-30
**Status**: Ready for implementation
**Scope**: Tier 2.2 of the 2026-04-30 strategic audit — daily server-side cron that pushes a notification to users with `status='watching'` shows whenever a new episode airs.
**Source**: 2026-04-30 daily note + brainstorming Q&A (this session)

---

## Why this PR

Per the 2026-04-30 strategic audit, the TV-tracker persona is the differentiated audience cinetrak serves that Letterboxd does not. Today, the highest-frequency re-engagement signal in this segment — "a new episode of a show you're watching just dropped" — fires zero pushes. Release reminders shipped in PR #411 cover movie releases (monthly per user at most), but TV is an order of magnitude more frequent (weekly per show per user). This PR mirrors the proven release_reminders shape from PR #411 to cover that gap.

---

## Scope Decisions (Q&A from brainstorming)

| Question | Choice |
|---|---|
| Timing model — when does the push fire? | **Available-now**: when an episode's `air_date` is today. Daily cron at 14:00 UTC, queries `tv_show_episodes WHERE air_date = CURRENT_DATE`. Mirrors release_reminders' "release_date = CURRENT_DATE" logic. |
| Eligibility — who qualifies? | **Any user with `user_tv_shows.status='watching'`** for that show. Simple, explicit user signal. v2 may add caught-up filter once per-episode progress data is plumbed through. |
| Data freshness — `tv_show_episodes` is currently only refreshed client-side via `lib/metadata-refresh.ts` when a user opens the app. | **Ship as-is, queue server-side warming as v2**. For n=1 active user today, client-driven refresh is fresh enough. Noted as the primary v2 follow-up. |
| Push copy template | **`📺 ${show_name} — S${pad(season)}E${pad(episode)} is out`** with zero-padded season/episode markers. Episode title (`tv_show_episodes.name`) is nullable in TMDB and inconsistent — episode markers are universal. |
| Season finale / premiere special copy | **No** in v1. Adds copy variants and detection logic for marginal delight before we know if the basic push works at all. v2 polish. |
| Notification preferences UI toggle in settings | **No** in v1, queued as downstream enhancement. The `notification_preferences` table already supports per-feature toggles (default-enabled when row absent), so the infrastructure works without UI today. |

---

## Architecture

Direct mirror of the proven release_reminders shape (PR #411 + auth helper from PR #413 + cron timeout fix from PR #414). YAGNI — no abstraction over a single existing similar feature. If a third reminder type ships later, then DRY.

```
[pg_cron daily 14:00 UTC]
   --pg_net.http_post (timeout_milliseconds=30000)-->
[send-tv-episode-reminders edge fn]
   --requireServiceRole(req)-->
   --rpc('get_pending_tv_episode_reminders')-->
[Postgres RPC]
   joins tv_show_episodes (air_date=CURRENT_DATE)
       + user_tv_shows (status='watching')
   dedup vs push_notification_log per (user_id, tmdb_id, season, episode)
   returns: (user_id, tmdb_id, season_number, episode_number, show_name)
   <-- rows
[edge fn] groups rows by (tmdb_id, season, episode)
   for each group:
     POST /functions/v1/send-push-notification
[send-push-notification edge fn — existing, unchanged]
   filters opted-out users via notification_preferences.feature='tv_episode_reminders'
   fetches push_tokens
   batches 100 → Expo Push API
   writes push_notification_log row per delivery (the dedup feed)
```

---

## Files to Create

`<ts>` in migration filenames = `YYYYMMDDHHMMSS` UTC timestamp at the moment of creation, matching the existing convention (e.g., `20260429045921_create_get_pending_release_reminders_rpc.sql`). The two new TV-episode migrations should use timestamps strictly greater than the most recent migration on `origin/main`.

| # | File | Description |
|---|------|---|
| 1 | `supabase/migrations/<ts>_create_get_pending_tv_episode_reminders_rpc.sql` | New SQL RPC. `SECURITY DEFINER`, granted to `service_role` only (revoke from PUBLIC + anon + authenticated). Joins `tv_show_episodes` + `user_tv_shows`, dedups via `NOT EXISTS` against `push_notification_log`. Returns `(user_id, tmdb_id, season_number, episode_number, show_name)`. |
| 2 | `supabase/migrations/<ts>_schedule_tv_episode_reminders_cron.sql` | pg_cron schedule, daily at 14:00 UTC. `timeout_milliseconds := 30000` (per PR #414 — Edge Function cold starts can take 5-11s, default 5s pg_net timeout silently truncates). |
| 3 | `supabase/functions/send-tv-episode-reminders/config.toml` | `verify_jwt = true` per cron-auth helper requirement. |
| 4 | `supabase/functions/send-tv-episode-reminders/index.ts` | Edge function entry. Uses `requireServiceRole(req)` from `_shared/cron-auth.ts`. Calls RPC, groups via helper, fans out to `send-push-notification`. Returns `{ candidates, groups, sent, errors }` JSON. |
| 5 | `supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts` | Pure helper `groupEpisodeRemindersByEpisode(reminders)`. Groups by `(tmdb_id, season, episode)` since multiple users watching the same show on the same air date should batch into one Expo push payload with N user_ids. Constructs the `ReminderPayload` with formatted title and feature key. |
| 6 | `__tests__/edge-functions/build-episode-reminder-payload.test.ts` | Jest unit tests for the payload helper. |

---

## SQL RPC

```sql
CREATE OR REPLACE FUNCTION public.get_pending_tv_episode_reminders()
RETURNS TABLE (
  user_id UUID,
  tmdb_id INTEGER,
  season_number INTEGER,
  episode_number INTEGER,
  show_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.season_number,
    eligible.episode_number,
    MIN(eligible.show_name) AS show_name
  FROM (
    SELECT
      uts.user_id,
      uts.tmdb_id,
      tse.season_number,
      tse.episode_number,
      uts.name AS show_name
    FROM public.tv_show_episodes tse
    JOIN public.user_tv_shows uts
      ON uts.tmdb_id = tse.tmdb_show_id
      AND uts.status = 'watching'
    WHERE tse.air_date = CURRENT_DATE
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.push_notification_log pnl
    WHERE pnl.feature = 'tv_episode_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND (pnl.data->>'season')::int = eligible.season_number
      AND (pnl.data->>'episode')::int = eligible.episode_number
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.season_number, eligible.episode_number;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() TO service_role;

COMMENT ON FUNCTION public.get_pending_tv_episode_reminders() IS
  'Returns episodes airing today for shows users have status=watching, deduped against push_notification_log. Internal use only — called by send-tv-episode-reminders edge function.';
```

---

## Cron Schedule

```sql
SELECT cron.schedule(
  'send-tv-episode-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/send-tv-episode-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

The cron name is unique (`send-tv-episode-reminders`) so it lives alongside `send-release-reminders` without collision. Same UTC time is fine — they're separate edge functions and Supabase runs them in parallel.

---

## Edge Function

```typescript
// supabase/functions/send-tv-episode-reminders/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import { groupEpisodeRemindersByEpisode, type PendingEpisodeReminder } from "./build-episode-reminder-payload.ts";

interface Result {
  candidates: number;
  groups: number;
  sent: number;
  errors: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "get_pending_tv_episode_reminders"
    );

    if (rpcError) {
      console.error("[send-tv-episode-reminders] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const reminders = (rpcData ?? []) as PendingEpisodeReminder[];
    if (reminders.length === 0) {
      const empty: Result = { candidates: 0, groups: 0, sent: 0, errors: 0 };
      return new Response(
        JSON.stringify(empty),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const groups = groupEpisodeRemindersByEpisode(reminders);
    let sent = 0;
    let errors = 0;

    for (const payload of groups) {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/send-push-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!resp.ok) {
        errors++;
        const text = await resp.text();
        console.error(
          `[send-tv-episode-reminders] send-push-notification ${resp.status}: ${text}`
        );
        continue;
      }
      const json = await resp.json() as {
        sent?: number;
        error?: string;
        skipped?: string;
      };
      sent += json.sent ?? 0;
      if (json.error || json.skipped) {
        console.log(
          `[send-tv-episode-reminders] group skipped: ${JSON.stringify({
            tmdb_id: payload.data.tmdb_id,
            season: payload.data.season,
            episode: payload.data.episode,
            error: json.error,
            skipped: json.skipped,
          })}`
        );
      }
    }

    const result: Result = {
      candidates: reminders.length,
      groups: groups.length,
      sent,
      errors,
    };
    console.log("[send-tv-episode-reminders]", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-tv-episode-reminders] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

Identical structure to `send-release-reminders/index.ts` except RPC name, log labels, and the additional season/episode keys in the skipped-log object.

---

## Payload Helper

```typescript
// supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts

export interface PendingEpisodeReminder {
  user_id: string;
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  show_name: string;
}

export interface EpisodeReminderPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    tmdb_id: number;
    season: number;
    episode: number;
    feature: 'tv_episode_reminders';
  };
  feature: 'tv_episode_reminders';
  channel_id: 'reminders';
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function groupEpisodeRemindersByEpisode(
  reminders: readonly PendingEpisodeReminder[]
): EpisodeReminderPayload[] {
  const byKey = new Map<string, EpisodeReminderPayload>();
  for (const r of reminders) {
    const key = `${r.tmdb_id}|${r.season_number}|${r.episode_number}`;
    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title: `📺 ${r.show_name} — S${pad2(r.season_number)}E${pad2(r.episode_number)} is out`,
        body: '',
        data: {
          url: `/tv/${r.tmdb_id}`,
          tmdb_id: r.tmdb_id,
          season: r.season_number,
          episode: r.episode_number,
          feature: 'tv_episode_reminders',
        },
        feature: 'tv_episode_reminders',
        channel_id: 'reminders',
      };
      byKey.set(key, payload);
    }
    payload.user_ids.push(r.user_id);
  }
  return Array.from(byKey.values());
}
```

---

## Tests

`__tests__/edge-functions/build-episode-reminder-payload.test.ts`:

1. **Empty input → empty output.** `groupEpisodeRemindersByEpisode([])` returns `[]`.
2. **Single user, single episode → 1 payload with 1 user_id.** Verifies title format and full data shape.
3. **Multiple users, same episode → 1 payload with N user_ids.** Verifies aggregation key correctness.
4. **Same user, different shows airing same day → distinct payloads.** Verifies tmdb_id is part of the key.
5. **Same user, same show, different episodes airing same day → distinct payloads.** (Edge case for double-features or season catch-up dumps.) Verifies season+episode are part of the key.
6. **Title formatting: zero-padding for single-digit season/episode.** Asserts `S01E04` and `S03E04`, not `S1E4` or `S03E4`.
7. **`data.feature` is always `'tv_episode_reminders'`.** Type-level + runtime assertion.

No edge-function-level integration test (matches release_reminders precedent — tested via production-cron-tick observability).

---

## Error Handling

Same 1:1 as release_reminders:
- 200 OK from `send-push-notification` with `error: 'No tokens found'` or `skipped: 'all_opted_out'` → log structured JSON, count as 0 sent (not an error)
- Non-OK status from `send-push-notification` → log status + body, increment error counter, continue with next group
- RPC error → return 500 with `{ error: rpcError.message }`
- Unhandled exception → top-level catch returns 500

---

## Verification (post-merge, post-cron)

1. Confirm migrations applied: `SELECT * FROM cron.job WHERE jobname = 'send-tv-episode-reminders';` should show the new job with `command` containing `timeout_milliseconds := 30000`.
2. Wait for next 14:00 UTC tick.
3. Query `cron.job_run_details WHERE jobname = 'send-tv-episode-reminders' ORDER BY end_time DESC LIMIT 1` — expect `status='succeeded'`.
4. Query `net._http_response WHERE created > <today_14:00>` — expect 200 status_code, `error_msg IS NULL`. (The PR #414 lesson — a non-null `error_msg` is a regression of that fix.)
5. If you have a Returning Series in `status='watching'` whose episode air_date is today, expect a push to your device. Tap → app deep-links to `/tv/${tmdb_id}`.
6. `SELECT * FROM push_notification_log WHERE feature = 'tv_episode_reminders' ORDER BY created_at DESC LIMIT 5;` — expect rows with `data` containing `tmdb_id`, `season`, `episode`.

---

## Out of Scope (queued v2)

- **Server-side warming cron for `tv_show_episodes`** — fix the dormant-user reach gap. Will require a new edge function that fetches TMDB next-episode data for all distinct `tmdb_id`s where any user has `status='watching'` and `tmdb_status='Returning Series'`.
- **Notification preferences UI toggle** for `tv_episode_reminders` in the existing settings/notifications screen. Mirrors the existing release_reminders toggle.
- **Season finale / premiere special copy** — detect via window function over `tv_show_episodes`, special-case copy templates.
- **Caught-up filter** — only push if user's last watched episode + 1 == upcoming episode. Requires per-episode progress plumbed through.
- **Multi-region air dates** — TMDB `air_date` is generic; v2 could resolve per-user-region.

---

## Risk Notes

- **Production cron change.** Same shape as release_reminders so the risk profile is well-understood. The 30s timeout (PR #414) prevents pg_net silent truncation. Test on a fresh worktree, deploy via standard EAS flow.
- **No schema changes to existing tables.** Only adds a new RPC and a new pg_cron job. Migrations are additive.
- **Cron timing collision with release_reminders.** Both fire at 14:00 UTC. Supabase runs them in parallel as separate edge function instances; no shared state, no collision risk. Confirmed acceptable.

---

## State to verify before merging

- `git log --oneline origin/main` — parent commit `846ad5b` (PR #415)
- `npm run lint && npx tsc --noEmit && npm test` — all green
- Edge function syntax check via `supabase functions serve` (optional, local)
- Migration applies cleanly: review the `<ts>_create_get_pending_tv_episode_reminders_rpc.sql` and `<ts>_schedule_tv_episode_reminders_cron.sql` files before applying to prod

---

*[[Daily Notes/2026-04-30]] · Tier 2.2 of activation/retention roadmap*
