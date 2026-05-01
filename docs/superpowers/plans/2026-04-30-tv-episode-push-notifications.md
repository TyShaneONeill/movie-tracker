# TV Episode Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a daily push notification to users with `status='watching'` shows whenever a new episode of that show airs, mirroring the proven release_reminders pattern from PR #411.

**Architecture:** New SQL RPC `get_pending_tv_episode_reminders()` joins `tv_show_episodes` (where `air_date = CURRENT_DATE`) with `user_tv_shows` (where `status='watching'`), deduped per (user_id, tmdb_id, season, episode) against `push_notification_log`. New edge function `send-tv-episode-reminders` consumes the RPC, groups rows by episode, fans out via existing `send-push-notification`. New pg_cron job fires daily at 14:00 UTC with `timeout_milliseconds := 30000` per PR #414.

**Tech Stack:** PostgreSQL (RPC + pg_cron + pg_net), Supabase Edge Functions (Deno), TypeScript, Jest for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-30-tv-episode-push-notifications-design.md`

**Worktree:** Already created at `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes/` (off `origin/main` at `846ad5b`, branch `feat/tv-episode-push-notifications`). Spec already committed at `8ab9423`. All task commands run from the worktree.

---

## File Map

| File | Type | Responsibility |
|---|---|---|
| `supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql` | create | SQL RPC, `SECURITY DEFINER`, granted to service_role only |
| `supabase/migrations/20260501030100_schedule_tv_episode_reminders_cron.sql` | create | pg_cron schedule, daily 14:00 UTC, 30s timeout |
| `supabase/functions/send-tv-episode-reminders/config.toml` | create | `verify_jwt = true` for cron-auth flow |
| `supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts` | create | Pure helper: types + `groupEpisodeRemindersByEpisode` |
| `supabase/functions/send-tv-episode-reminders/index.ts` | create | Edge function entry — auth, RPC call, fanout |
| `__tests__/edge-functions/build-episode-reminder-payload.test.ts` | create | Jest unit tests for payload helper (TDD) |

Migration timestamps `20260501030000` and `20260501030100` are strictly greater than the latest existing migration (`20260501012958_bump_push_cron_http_timeout.sql` from PR #414), so they apply in correct order.

---

## Task 1: Payload helper + Jest tests (TDD)

**Files:**
- Create: `__tests__/edge-functions/build-episode-reminder-payload.test.ts`
- Create: `supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts`

**Why:** Pure function with clear inputs/outputs — natural TDD candidate. Mirrors the existing release_reminders test pattern at `__tests__/edge-functions/build-reminder-payload.test.ts`. Lives inside `supabase/functions/` so the Deno runtime can import directly, and is also Jest-testable from `__tests__/edge-functions/`.

- [ ] **Step 1.1: Write the failing test file**

Create `__tests__/edge-functions/build-episode-reminder-payload.test.ts`:

```typescript
import {
  groupEpisodeRemindersByEpisode,
  type PendingEpisodeReminder,
  type EpisodeReminderPayload,
} from '../../supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload';

describe('groupEpisodeRemindersByEpisode', () => {
  it('returns empty array for empty input', () => {
    expect(groupEpisodeRemindersByEpisode([])).toEqual([]);
  });

  it('builds a payload with the correct title format and full data shape', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1396, season_number: 3, episode_number: 4, show_name: 'Breaking Bad' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<EpisodeReminderPayload>({
      user_ids: ['u1'],
      title: '📺 Breaking Bad — S03E04 is out',
      body: '',
      data: {
        url: '/tv/1396',
        tmdb_id: 1396,
        season: 3,
        episode: 4,
        feature: 'tv_episode_reminders',
      },
      feature: 'tv_episode_reminders',
      channel_id: 'reminders',
    });
  });

  it('groups two users watching the same episode into one payload with two user_ids', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 42, season_number: 1, episode_number: 1, show_name: 'Show' },
      { user_id: 'u2', tmdb_id: 42, season_number: 1, episode_number: 1, show_name: 'Show' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u1', 'u2']);
  });

  it('separates the same user across two different shows into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 1, episode_number: 1, show_name: 'A' },
      { user_id: 'u1', tmdb_id: 2, season_number: 1, episode_number: 1, show_name: 'B' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.data.tmdb_id).sort()).toEqual([1, 2]);
  });

  it('separates same user+show across two different episodes into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 1, show_name: 'X' },
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 2, show_name: 'X' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    const eps = result.map(p => p.data.episode).sort();
    expect(eps).toEqual([1, 2]);
  });

  it('separates same user+show across two different seasons into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 1, show_name: 'X' },
      { user_id: 'u1', tmdb_id: 7, season_number: 3, episode_number: 1, show_name: 'X' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    const seasons = result.map(p => p.data.season).sort();
    expect(seasons).toEqual([2, 3]);
  });

  it('zero-pads single-digit season and episode numbers in the title', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 1, episode_number: 4, show_name: 'A' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result[0].title).toBe('📺 A — S01E04 is out');
  });

  it('does not pad two-digit numbers', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 12, episode_number: 25, show_name: 'A' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result[0].title).toBe('📺 A — S12E25 is out');
  });

  it('preserves user order within a group (insertion order)', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u3', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
      { user_id: 'u1', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
      { user_id: 'u2', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u3', 'u1', 'u2']);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm failure**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && npx jest __tests__/edge-functions/build-episode-reminder-payload.test.ts`

Expected: FAIL — module `build-episode-reminder-payload` does not exist yet.

- [ ] **Step 1.3: Create the helper file**

Create `supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts`:

```typescript
/**
 * Pure helper for the send-tv-episode-reminders consumer.
 * Groups RPC rows by (tmdb_id, season_number, episode_number) and constructs
 * Expo Push payloads suitable for posting to the internal `send-push-notification`
 * edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/.
 */

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

- [ ] **Step 1.4: Run tests to confirm pass**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && npx jest __tests__/edge-functions/build-episode-reminder-payload.test.ts`

Expected: PASS — 9/9 tests green.

- [ ] **Step 1.5: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && npm run lint && npx tsc --noEmit`

Expected: PASS — 0 errors. (Pre-existing 8 warnings unchanged.)

- [ ] **Step 1.6: Commit**

```bash
git add __tests__/edge-functions/build-episode-reminder-payload.test.ts \
        supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload.ts
git commit -m "feat(notifications): add tv-episode reminder payload helper + tests"
```

---

## Task 2: Edge function `index.ts` + `config.toml`

**Files:**
- Create: `supabase/functions/send-tv-episode-reminders/config.toml`
- Create: `supabase/functions/send-tv-episode-reminders/index.ts`

**Depends on:** Task 1 (imports the helper)

**Why:** The edge function is glue between the SQL RPC and the existing `send-push-notification` fanout. Mirrors `supabase/functions/send-release-reminders/index.ts` exactly except RPC name, log labels, and skipped-log payload keys (season + episode in place of category).

- [ ] **Step 2.1: Create `config.toml`**

Create `supabase/functions/send-tv-episode-reminders/config.toml`:

```toml
verify_jwt = true
```

This matches the convention used by `send-release-reminders/config.toml`. With `verify_jwt = true`, Supabase validates the JWT signature at the gateway before the function body runs. Inside the body, `requireServiceRole(req)` then validates the role claim.

- [ ] **Step 2.2: Create `index.ts`**

Create `supabase/functions/send-tv-episode-reminders/index.ts`:

```typescript
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

  // serviceRoleKey is still needed to authenticate internal calls to send-push-notification
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
      // 200 OK from send-push-notification can still carry `error` ("No tokens
      // found") or `skipped` ("all_opted_out") — these are expected empty-send
      // outcomes, not failures. Only non-OK status (handled above) counts as
      // an error in our fan-out result.
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

- [ ] **Step 2.3: Run typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && npx tsc --noEmit`

Expected: PASS. Note: edge function code uses `jsr:` Deno imports which the TypeScript compiler treats as `any` types — that's OK and matches the release_reminders precedent.

- [ ] **Step 2.4: Commit**

```bash
git add supabase/functions/send-tv-episode-reminders/config.toml \
        supabase/functions/send-tv-episode-reminders/index.ts
git commit -m "feat(notifications): add send-tv-episode-reminders edge function"
```

---

## Task 3: SQL RPC migration

**Files:**
- Create: `supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql`

**Why:** Pure-SQL helper called by the edge function. `SECURITY DEFINER` so it runs with elevated privileges; granted to `service_role` only (revoked from PUBLIC + anon + authenticated) so users cannot directly call it. Dedups against `push_notification_log` per (user_id, tmdb_id, season, episode) so a re-run on the same day does not re-push a previously-pushed episode.

- [ ] **Step 3.1: Create migration file**

Create `supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql`:

```sql
-- supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql
-- Returns episodes airing today for TV shows users have status='watching',
-- deduped against push_notification_log so each user gets at most one push
-- per (tmdb_id, season, episode) tuple, ever.
-- SECURITY DEFINER + GRANT-to-service_role-only so only the daily cron can call it.

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

-- REVOKE FROM PUBLIC covers future roles; also explicitly revoke from Supabase
-- default roles that inherit PUBLIC grants at function-creation time.
REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_tv_episode_reminders() TO service_role;

COMMENT ON FUNCTION public.get_pending_tv_episode_reminders() IS
  'Returns episodes airing today for shows users have status=watching, deduped against push_notification_log. Internal use only — called by send-tv-episode-reminders edge function.';
```

- [ ] **Step 3.2: Verify migration syntax (locally optional, prod application post-merge)**

Migrations are not applied locally for this codebase — they are reviewed in the PR and applied to production via the standard Supabase CLI / MCP flow after merge. The `BEGIN;`/`COMMIT;` wrapping is omitted because Supabase CLI wraps each migration file in its own transaction by default.

If you want to syntax-check locally (optional, requires Supabase CLI), run: `supabase db lint`. Otherwise, the syntax is identical in shape to the existing `20260429045921_create_get_pending_release_reminders_rpc.sql` and can be considered safe-to-merge by inspection.

- [ ] **Step 3.3: Commit**

```bash
git add supabase/migrations/20260501030000_create_get_pending_tv_episode_reminders_rpc.sql
git commit -m "feat(notifications): add get_pending_tv_episode_reminders RPC migration"
```

---

## Task 4: Cron schedule migration

**Files:**
- Create: `supabase/migrations/20260501030100_schedule_tv_episode_reminders_cron.sql`

**Why:** Schedules the edge function to run daily at 14:00 UTC. Includes `timeout_milliseconds := 30000` per the PR #414 lesson (Edge Function cold starts can take 5-11s; default 5s pg_net timeout silently truncates).

- [ ] **Step 4.1: Create cron migration file**

Create `supabase/migrations/20260501030100_schedule_tv_episode_reminders_cron.sql`. The body matches the existing release_reminders cron migration character-for-character except the cron job name and the function URL path (verified against `20260429050539_schedule_release_reminders_cron.sql`):

```sql
-- Daily 14:00 UTC = 10am EDT / 7am PDT — morning for US users.
-- Reuses Vault secrets created in 20260327000003_setup_push_cron_jobs.sql.
-- Mirrors 20260429050539_schedule_release_reminders_cron.sql; both jobs run
-- in parallel as separate edge functions, no shared state.
--
-- timeout_milliseconds = 30000 per PR #414 fix (Edge Function cold starts can
-- take 5-11s; default pg_net timeout of 5000ms silently truncates the response).

SELECT cron.schedule(
  'send-tv-episode-reminders',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/send-tv-episode-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
```

- [ ] **Step 4.2: Commit**

```bash
git add supabase/migrations/20260501030100_schedule_tv_episode_reminders_cron.sql
git commit -m "feat(notifications): schedule tv-episode-reminders cron daily at 14:00 UTC"
```

---

## Task 5: Final verification

**Files:** None — verification only.

- [ ] **Step 5.1: Run full lint + typecheck + test suite**

Run:
```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && npm run lint && npx tsc --noEmit && npm test
```

Expected:
- Lint: 0 errors (8 pre-existing warnings unchanged)
- TypeScript: clean
- Jest: 928/928 pass (the 919 baseline from PR #415 + 9 new tests in `build-episode-reminder-payload.test.ts`)

- [ ] **Step 5.2: Verify the commit log on the branch**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes && git log --oneline origin/main..HEAD`

Expected: 5 commits (in order, oldest first):
1. `docs: add TV episode push notifications spec`
2. `feat(notifications): add tv-episode reminder payload helper + tests`
3. `feat(notifications): add send-tv-episode-reminders edge function`
4. `feat(notifications): add get_pending_tv_episode_reminders RPC migration`
5. `feat(notifications): schedule tv-episode-reminders cron daily at 14:00 UTC`

- [ ] **Step 5.3: Push branch and open PR**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-tv-episode-pushes
git push -u origin feat/tv-episode-push-notifications
gh pr create --title "feat(notifications): tv episode push reminders v1" --body "$(cat <<'EOF'
## Summary

Tier 2.2 of the 2026-04-30 strategic audit — daily server-side cron that pushes a notification to users with `status='watching'` shows whenever a new episode airs.

Mirrors the proven release_reminders pattern from PR #411:
- New SQL RPC `get_pending_tv_episode_reminders()` joins `tv_show_episodes` (where `air_date = CURRENT_DATE`) with `user_tv_shows` (where `status='watching'`), deduped via `push_notification_log` per (user_id, tmdb_id, season, episode)
- New edge function `send-tv-episode-reminders` consumes the RPC, groups rows by episode, fans out via existing `send-push-notification`
- New pg_cron job fires daily at 14:00 UTC with `timeout_milliseconds := 30000` per PR #414

Push payload: `📺 ${show_name} — S${pad(season)}E${pad(episode)} is out`. Empty body, deep link to `/tv/${tmdb_id}`, feature key `tv_episode_reminders`.

## Test plan

Automated (already green):
- [x] `__tests__/edge-functions/build-episode-reminder-payload.test.ts` — 9 cases covering empty input, payload shape, multi-user grouping, multi-show separation, multi-episode separation, multi-season separation, zero-padding, two-digit handling, insertion-order preservation
- [x] `npm run lint && npx tsc --noEmit && npm test` — all green

Post-merge production verification:
- [ ] Apply migrations via Supabase CLI / MCP
- [ ] Deploy edge function via `supabase functions deploy send-tv-episode-reminders`
- [ ] Wait for next 14:00 UTC tick
- [ ] Query `cron.job_run_details WHERE jobname = 'send-tv-episode-reminders' ORDER BY end_time DESC LIMIT 1` — expect status='succeeded'
- [ ] After the next 14:00 UTC tick, run: `SELECT id, status_code, error_msg, created FROM net._http_response ORDER BY id DESC LIMIT 5;` — expect status_code=200, error_msg IS NULL on the new tv-episode tick (a non-null error_msg would be a regression of the PR #414 timeout fix)
- [ ] If a Returning Series in `status='watching'` has an episode `air_date = today`, expect a push to your device — tap deep-links to `/tv/${tmdb_id}`
- [ ] `SELECT * FROM push_notification_log WHERE feature = 'tv_episode_reminders' ORDER BY created_at DESC LIMIT 5;` — expect rows with `data` containing `tmdb_id`, `season`, `episode`

## Out of scope (queued v2)

- Server-side warming cron for `tv_show_episodes` (dormant-user reach gap; client-side refresh is sufficient at n=1)
- Notification preferences UI toggle for `tv_episode_reminders` in settings
- Season finale / premiere special copy
- Caught-up filter (only push if user is on the brink of needing the next episode)
- Multi-region air dates

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Production deployment (post-merge)

After PR is merged on GitHub:

1. **Apply migrations** (via Supabase MCP or CLI):
   - `mcp__plugin_supabase_supabase__apply_migration` for `20260501030000_create_get_pending_tv_episode_reminders_rpc.sql`
   - `mcp__plugin_supabase_supabase__apply_migration` for `20260501030100_schedule_tv_episode_reminders_cron.sql`
2. **Deploy edge function**: `supabase functions deploy send-tv-episode-reminders` (or via MCP `deploy_edge_function`)
3. **Confirm cron job exists**: `SELECT * FROM cron.job WHERE jobname = 'send-tv-episode-reminders';`
4. **Run the verification checklist** from Step 5.3's PR body

Do not apply migrations or deploy the edge function from a feature branch before merge — production-affecting changes should run from the merged commit on main.

---

## Out of Scope (deliberately deferred per spec)

- Server-side warming cron for `tv_show_episodes` (Tier 2.2 v2 follow-up)
- Notification preferences UI toggle for `tv_episode_reminders`
- Season finale / premiere special copy detection
- Caught-up filter
- Multi-region air dates
