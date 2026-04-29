# Release Reminders v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first consumer of the push-notification infra — a daily 14:00 UTC cron that pushes a release reminder to every user who has a watchlisted movie releasing today (theatrical or streaming, US region only). Plus a new `/settings/notifications` page with a single toggle to opt out.

**Architecture:** Eligibility derived live from `user_movies.status='watchlist'` JOIN `release_calendar` via a new SECURITY DEFINER RPC `get_pending_release_reminders()` that NOT-EXISTS-filters against `push_notification_log.data` JSONB for dedup. Edge function `send-release-reminders` calls the RPC, groups results by `(tmdb_id, category)`, and posts to the existing internal `send-push-notification` function. New client service + hook + settings screen wire opt-in via existing `notification_preferences` table.

**Tech Stack:** PostgreSQL (RPC, pg_cron, pg_net, vault), Deno (Supabase Edge Functions), TypeScript, Jest, React Native (`Pressable`, `ToggleSwitch`, `react-native-toast-message`), Supabase JS v2.

**Worktree:** `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders` on branch `feat/release-reminders` (already created off `origin/main` at `74c4c74`, `.env.local` copied, `npm install` complete, spec committed at `d59ecc0` and self-reviewed at `e1cbc00`).

**Spec:** `docs/superpowers/specs/2026-04-28-release-reminders-design.md`

**Supabase project ref:** `wliblwulvsrfgqcnbzeh`

---

## File Structure

**Create:**
- `supabase/migrations/<timestamp>_create_get_pending_release_reminders_rpc.sql` — RPC + grant
- `supabase/migrations/<timestamp>_schedule_release_reminders_cron.sql` — pg_cron schedule
- `supabase/functions/send-release-reminders/index.ts` — daily consumer edge function
- `supabase/functions/send-release-reminders/config.toml` — `verify_jwt = false`
- `supabase/functions/send-release-reminders/build-reminder-payload.ts` — pure helper, ~40 LOC, importable from Jest
- `__tests__/edge-functions/build-reminder-payload.test.ts` — Jest tests for the helper
- `lib/notification-preferences-service.ts` — service-layer wrapper, ~30 LOC
- `__tests__/lib/notification-preferences-service.test.ts` — Jest tests
- `hooks/use-notification-preferences.ts` — React Query hook, ~30 LOC
- `__tests__/hooks/use-notification-preferences.test.ts` — Jest tests
- `app/settings/notifications.tsx` — new settings screen
- `__tests__/app/settings/notifications.test.tsx` — Jest tests for screen behavior

**Modify:**
- `app/settings/index.tsx` — add a "Notifications" row that pushes to `/settings/notifications`
- `lib/push-notification-service.ts:258-267` — extend `handleNotificationResponse` to emit `release_reminder:tapped` analytics event before navigation when `data.feature === 'release_reminders'`
- `__tests__/lib/push-notification-service.test.ts:293-333` — add a test asserting the new analytics event fires

**Note on database types:** the `notification_preferences` table types are already in `lib/database.types.ts` lines 540-566 of the worktree (origin/main). No regeneration or hand-edit required.

---

## Task 1: Migration — RPC `get_pending_release_reminders`

**Files:**
- Create: `supabase/migrations/<timestamp>_create_get_pending_release_reminders_rpc.sql`

The RPC is `SECURITY DEFINER` so it can read across `user_movies` for all users (server-side only — granted to `service_role` only, revoked from PUBLIC). Returns rows ready to send.

- [ ] **Step 1.1: Generate migration filename**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
TS=$(date -u +%Y%m%d%H%M%S)
echo "supabase/migrations/${TS}_create_get_pending_release_reminders_rpc.sql"
```

- [ ] **Step 1.2: Create the migration file**

```sql
-- supabase/migrations/<timestamp>_create_get_pending_release_reminders_rpc.sql
-- Returns watchlisted movies whose release_date is today (US region) and which
-- the user has not yet been notified about for the same (tmdb_id, category).
-- Categories: 'theatrical' (release_type 1,2,3), 'streaming' (release_type 6).
-- SECURITY DEFINER + GRANT-to-service_role-only so only the daily cron can call it.

CREATE OR REPLACE FUNCTION public.get_pending_release_reminders()
RETURNS TABLE (
  user_id UUID,
  tmdb_id INTEGER,
  category TEXT,
  title TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    eligible.user_id,
    eligible.tmdb_id,
    eligible.category,
    MIN(eligible.title) AS title
  FROM (
    SELECT
      um.user_id,
      rc.tmdb_id,
      CASE
        WHEN rc.release_type IN (1, 2, 3) THEN 'theatrical'
        ELSE 'streaming'
      END AS category,
      rc.title
    FROM release_calendar rc
    JOIN user_movies um
      ON um.tmdb_id = rc.tmdb_id
      AND um.status = 'watchlist'
    WHERE rc.region = 'US'
      AND rc.release_date = CURRENT_DATE
      AND rc.release_type IN (1, 2, 3, 6)
      AND rc.title IS NOT NULL
  ) AS eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM push_notification_log pnl
    WHERE pnl.feature = 'release_reminders'
      AND pnl.user_id = eligible.user_id
      AND pnl.data->>'tmdb_id' = eligible.tmdb_id::text
      AND pnl.data->>'category' = eligible.category
  )
  GROUP BY eligible.user_id, eligible.tmdb_id, eligible.category;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_release_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_release_reminders() TO service_role;

COMMENT ON FUNCTION public.get_pending_release_reminders() IS
  'Returns watchlisted movies releasing today in US region, deduped against push_notification_log. Internal use only — called by send-release-reminders edge function.';
```

- [ ] **Step 1.3: Apply the migration via Supabase MCP**

```
mcp__plugin_supabase_supabase__apply_migration
  project_id: wliblwulvsrfgqcnbzeh
  name: create_get_pending_release_reminders_rpc
  query: <the SQL from Step 1.2>
```

Verification SQL (also via MCP `execute_sql`):

```sql
SELECT
  proname,
  prosecdef AS security_definer,
  array_to_string(proacl, ',') AS acl
FROM pg_proc
WHERE proname = 'get_pending_release_reminders';
```

Expected: 1 row, `security_definer=true`, `acl` contains `service_role=X`.

- [ ] **Step 1.4: Commit the migration**

```bash
git add supabase/migrations/*_create_get_pending_release_reminders_rpc.sql
git commit -m "feat(notifications): RPC — get_pending_release_reminders

Returns watchlisted movies releasing today (US, theatrical or streaming),
deduped against push_notification_log via NOT EXISTS on data->>tmdb_id
and data->>category. SECURITY DEFINER so the daily cron's service_role
call can read across user_movies; grant restricted to service_role only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration — pg_cron schedule

**Files:**
- Create: `supabase/migrations/<timestamp>_schedule_release_reminders_cron.sql`

Vault secrets `project_url` and `service_role_key` are already created (per `20260327000003_setup_push_cron_jobs.sql`). Reuse them.

- [ ] **Step 2.1: Generate migration filename (one minute later than Task 1)**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
TS=$(date -u +%Y%m%d%H%M%S)
echo "supabase/migrations/${TS}_schedule_release_reminders_cron.sql"
```

- [ ] **Step 2.2: Create the migration file**

```sql
-- supabase/migrations/<timestamp>_schedule_release_reminders_cron.sql
-- Daily 14:00 UTC = 10am EDT / 7am PDT — morning for US users.
-- Reuses Vault secrets created in 20260327000003_setup_push_cron_jobs.sql.

SELECT cron.schedule(
  'send-release-reminders',
  '0 14 * * *',
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

- [ ] **Step 2.3: Apply via Supabase MCP**

```
mcp__plugin_supabase_supabase__apply_migration
  project_id: wliblwulvsrfgqcnbzeh
  name: schedule_release_reminders_cron
  query: <the SQL from Step 2.2>
```

Verification SQL (via MCP `execute_sql`):

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'send-release-reminders';
```

Expected: 1 row, `schedule='0 14 * * *'`, `active=true`.

- [ ] **Step 2.4: Commit the migration**

```bash
git add supabase/migrations/*_schedule_release_reminders_cron.sql
git commit -m "feat(notifications): cron — daily release reminders at 14:00 UTC

Daily fire at 10am EDT / 7am PDT — morning for US users. Reuses Vault
secrets project_url and service_role_key already provisioned in the
push-notifications cron migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pure helper — `build-reminder-payload.ts` (TDD)

**Files:**
- Create: `supabase/functions/send-release-reminders/build-reminder-payload.ts`
- Create: `__tests__/edge-functions/build-reminder-payload.test.ts`

The helper groups RPC results by `(tmdb_id, category)` and constructs the Expo Push payload format. Pure function — easy to Jest-test from the supabase/functions tree (same pattern as yesterday's `selectBestTrailer`).

- [ ] **Step 3.1: Write the failing tests**

Create `__tests__/edge-functions/build-reminder-payload.test.ts`:

```ts
import {
  groupRemindersByMovie,
  type PendingReminder,
  type ReminderPayload,
} from '../../supabase/functions/send-release-reminders/build-reminder-payload';

describe('groupRemindersByMovie', () => {
  it('returns empty array for empty input', () => {
    expect(groupRemindersByMovie([])).toEqual([]);
  });

  it('builds a theatrical payload with film emoji and "now in theaters" suffix', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 12345, category: 'theatrical', title: 'Dune: Part Two' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<ReminderPayload>({
      user_ids: ['u1'],
      title: '🎬 Dune: Part Two — now in theaters',
      body: '',
      data: {
        url: '/movie/12345',
        tmdb_id: 12345,
        category: 'theatrical',
        feature: 'release_reminders',
      },
      feature: 'release_reminders',
      channel_id: 'reminders',
    });
  });

  it('builds a streaming payload with popcorn emoji and "now streaming" suffix', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 999, category: 'streaming', title: 'Some Series' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result[0].title).toBe('🍿 Some Series — now streaming');
    expect(result[0].data.url).toBe('/movie/999');
    expect(result[0].data.category).toBe('streaming');
  });

  it('groups two users for the same movie+category into one payload with two user_ids', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 42, category: 'theatrical', title: 'Movie A' },
      { user_id: 'u2', tmdb_id: 42, category: 'theatrical', title: 'Movie A' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u1', 'u2']);
  });

  it('separates the same user across two different movies into two payloads', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 1, category: 'theatrical', title: 'Movie A' },
      { user_id: 'u1', tmdb_id: 2, category: 'theatrical', title: 'Movie B' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.data.tmdb_id).sort()).toEqual([1, 2]);
  });

  it('separates the same user+movie across two different categories into two payloads', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 7, category: 'theatrical', title: 'X' },
      { user_id: 'u1', tmdb_id: 7, category: 'streaming', title: 'X' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(2);
    const cats = result.map(p => p.data.category).sort();
    expect(cats).toEqual(['streaming', 'theatrical']);
  });

  it('preserves user order within a group (insertion order)', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u3', tmdb_id: 5, category: 'theatrical', title: 'M' },
      { user_id: 'u1', tmdb_id: 5, category: 'theatrical', title: 'M' },
      { user_id: 'u2', tmdb_id: 5, category: 'theatrical', title: 'M' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u3', 'u1', 'u2']);
  });
});
```

- [ ] **Step 3.2: Run the tests to verify they fail**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
npx jest __tests__/edge-functions/build-reminder-payload.test.ts 2>&1
```

Expected: FAIL with "Cannot find module" or similar — the helper file doesn't exist yet.

- [ ] **Step 3.3: Implement the helper**

Create `supabase/functions/send-release-reminders/build-reminder-payload.ts`:

```ts
/**
 * Pure helper for the send-release-reminders consumer.
 * Groups RPC rows by (tmdb_id, category) and constructs Expo Push payloads
 * suitable for posting to the internal `send-push-notification` edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/.
 */

export type ReminderCategory = 'theatrical' | 'streaming';

export interface PendingReminder {
  user_id: string;
  tmdb_id: number;
  category: ReminderCategory;
  title: string;
}

export interface ReminderPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    tmdb_id: number;
    category: ReminderCategory;
    feature: 'release_reminders';
  };
  feature: 'release_reminders';
  channel_id: 'reminders';
}

export function groupRemindersByMovie(
  reminders: readonly PendingReminder[]
): ReminderPayload[] {
  const byKey = new Map<string, ReminderPayload>();
  for (const r of reminders) {
    const key = `${r.tmdb_id}|${r.category}`;
    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title:
          r.category === 'theatrical'
            ? `🎬 ${r.title} — now in theaters`
            : `🍿 ${r.title} — now streaming`,
        body: '',
        data: {
          url: `/movie/${r.tmdb_id}`,
          tmdb_id: r.tmdb_id,
          category: r.category,
          feature: 'release_reminders',
        },
        feature: 'release_reminders',
        channel_id: 'reminders',
      };
      byKey.set(key, payload);
    }
    payload.user_ids.push(r.user_id);
  }
  return Array.from(byKey.values());
}
```

- [ ] **Step 3.4: Run the tests to verify they pass**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
npx jest __tests__/edge-functions/build-reminder-payload.test.ts 2>&1
```

Expected: 7 passed.

- [ ] **Step 3.5: Commit**

```bash
git add supabase/functions/send-release-reminders/build-reminder-payload.ts \
        __tests__/edge-functions/build-reminder-payload.test.ts
git commit -m "feat(notifications): groupRemindersByMovie helper (TDD)

Pure helper that groups RPC rows by (tmdb_id, category) and builds the
Expo Push payload shape with theatrical/streaming title variants. Lives
in supabase/functions/send-release-reminders/ for Deno import, jest-tested
via relative path. 7 cases — empty, theatrical, streaming, multi-user
group, multi-movie split, multi-category split, user ordering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Edge function — `send-release-reminders/index.ts`

**Files:**
- Create: `supabase/functions/send-release-reminders/index.ts`
- Create: `supabase/functions/send-release-reminders/config.toml`

The function is invoked only by the daily cron with the service_role key. Calls the RPC, groups via the helper, posts each payload to the internal `send-push-notification` function.

- [ ] **Step 4.1: Create config.toml**

```toml
verify_jwt = false
```

(The function authenticates via the service_role key check inside its body — same pattern as `send-push-notification`.)

- [ ] **Step 4.2: Create index.ts**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { groupRemindersByMovie, type PendingReminder } from "./build-reminder-payload.ts";

interface Result {
  candidates: number;
  groups: number;
  sent: number;
  errors: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!authHeader.includes(serviceRoleKey)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      "get_pending_release_reminders"
    );

    if (rpcError) {
      console.error("[send-release-reminders] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const reminders = (rpcData ?? []) as PendingReminder[];
    if (reminders.length === 0) {
      const empty: Result = { candidates: 0, groups: 0, sent: 0, errors: 0 };
      return new Response(
        JSON.stringify(empty),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const groups = groupRemindersByMovie(reminders);
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
          `[send-release-reminders] send-push-notification ${resp.status}: ${text}`
        );
        continue;
      }
      const json = await resp.json() as { sent?: number; error?: string };
      sent += json.sent ?? 0;
      if (json.error) errors++;
    }

    const result: Result = {
      candidates: reminders.length,
      groups: groups.length,
      sent,
      errors,
    };
    console.log("[send-release-reminders]", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-release-reminders] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 4.3: Deploy via Supabase MCP**

```
mcp__plugin_supabase_supabase__deploy_edge_function
  project_id: wliblwulvsrfgqcnbzeh
  name: send-release-reminders
  files: [
    { name: "index.ts",                   content: <contents of supabase/functions/send-release-reminders/index.ts> },
    { name: "build-reminder-payload.ts",  content: <contents of supabase/functions/send-release-reminders/build-reminder-payload.ts> },
    { name: "config.toml",                content: "verify_jwt = false\n" }
  ]
```

Verification — invoke the function with no candidates and confirm a 0-result response:

```bash
SUPABASE_URL=$(grep ^EXPO_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
SERVICE_ROLE_KEY=$(grep SERVICE_ROLE_KEY .env.local | cut -d= -f2)  # if locally available; otherwise skip
# (If not available locally, skip the curl and rely on the manual QA in Task 9.)
```

(Manual invocation is documented in Task 9 manual QA — skip ad-hoc curl here unless `.env.local` has a `SERVICE_ROLE_KEY` entry. If it doesn't, the deploy itself is the verification of upload.)

- [ ] **Step 4.4: Commit**

```bash
git add supabase/functions/send-release-reminders/index.ts \
        supabase/functions/send-release-reminders/config.toml
git commit -m "feat(notifications): send-release-reminders edge function

Daily consumer for release reminders. Auths via service_role header,
calls get_pending_release_reminders() RPC, groups results by movie,
posts each payload to the internal send-push-notification function.
Returns {candidates, groups, sent, errors} for cron-log observability.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client service — `notification-preferences-service.ts` (TDD)

**Files:**
- Create: `lib/notification-preferences-service.ts`
- Create: `__tests__/lib/notification-preferences-service.test.ts`

Reads/writes `notification_preferences`. Treats absence of a row as `enabled=true` (matches `send-push-notification`'s "no row = not in disabledUsers" semantic).

- [ ] **Step 5.1: Write the failing tests**

Create `__tests__/lib/notification-preferences-service.test.ts`:

```ts
import {
  getNotificationPreference,
  setNotificationPreference,
} from '@/lib/notification-preferences-service';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const getUserMock = supabase.auth.getUser as jest.Mock;
const fromMock = supabase.from as jest.Mock;

function mockSelectChain(maybeSingleResult: { data: any; error: any }) {
  const builder: any = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue(maybeSingleResult);
  fromMock.mockReturnValue(builder);
  return builder;
}

function mockUpsertChain(upsertResult: { error: any }) {
  const builder: any = {};
  builder.upsert = jest.fn().mockResolvedValue(upsertResult);
  fromMock.mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('getNotificationPreference', () => {
  it('returns true when no row exists (default)', async () => {
    mockSelectChain({ data: null, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(true);
  });

  it('returns true when the row says enabled=true', async () => {
    mockSelectChain({ data: { enabled: true }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(true);
  });

  it('returns false when the row says enabled=false', async () => {
    mockSelectChain({ data: { enabled: false }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(false);
  });

  it('returns true when user is unauthenticated (graceful)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await getNotificationPreference('release_reminders')).toBe(true);
  });
});

describe('setNotificationPreference', () => {
  it('upserts the preference with onConflict on user_id+feature', async () => {
    const builder = mockUpsertChain({ error: null });
    await setNotificationPreference('release_reminders', false);
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        feature: 'release_reminders',
        enabled: false,
        updated_at: expect.any(String),
      }),
      { onConflict: 'user_id,feature' }
    );
  });

  it('throws when not authenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      setNotificationPreference('release_reminders', true)
    ).rejects.toThrow('Not authenticated');
  });

  it('throws when supabase returns an error', async () => {
    mockUpsertChain({ error: { message: 'boom' } });
    await expect(
      setNotificationPreference('release_reminders', true)
    ).rejects.toMatchObject({ message: 'boom' });
  });
});
```

- [ ] **Step 5.2: Run the tests to verify they fail**

```bash
npx jest __tests__/lib/notification-preferences-service.test.ts 2>&1
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the service**

Create `lib/notification-preferences-service.ts`:

```ts
/**
 * Notification preferences service — wraps the notification_preferences table.
 *
 * Semantics: absence of a row means "enabled". This matches the existing
 * send-push-notification logic which only filters out users whose row says
 * enabled=false. Toggling OFF persists enabled=false; toggling ON upserts
 * enabled=true (so the row exists and can be re-toggled cleanly).
 */

import { supabase } from './supabase';

export type NotificationFeature = 'release_reminders';

export async function getNotificationPreference(
  feature: NotificationFeature
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return true;
  const { data } = await supabase
    .from('notification_preferences')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('feature', feature)
    .maybeSingle();
  return data?.enabled ?? true;
}

export async function setNotificationPreference(
  feature: NotificationFeature,
  enabled: boolean
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        feature,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,feature' }
    );
  if (error) throw error;
}
```

- [ ] **Step 5.4: Run the tests to verify they pass**

```bash
npx jest __tests__/lib/notification-preferences-service.test.ts 2>&1
```

Expected: 7 passed.

- [ ] **Step 5.5: Commit**

```bash
git add lib/notification-preferences-service.ts \
        __tests__/lib/notification-preferences-service.test.ts
git commit -m "feat(notifications): notification-preferences-service (TDD)

Read/upsert against notification_preferences table. Absence of a row
treated as enabled=true (matches send-push-notification semantics).
Throws when unauthenticated on writes; gracefully returns true on reads.
7 test cases — defaults, both enabled values, unauthenticated paths,
upsert shape, error propagation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: React Query hook — `use-notification-preferences.ts` (TDD)

**Files:**
- Create: `hooks/use-notification-preferences.ts`
- Create: `__tests__/hooks/use-notification-preferences.test.ts`

- [ ] **Step 6.1: Write the failing tests**

Create `__tests__/hooks/use-notification-preferences.test.ts`:

```ts
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationPreference } from '@/hooks/use-notification-preferences';
import * as service from '@/lib/notification-preferences-service';

jest.mock('@/lib/notification-preferences-service');

const getMock = service.getNotificationPreference as jest.Mock;
const setMock = service.setNotificationPreference as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useNotificationPreference', () => {
  it('returns enabled=true on initial fetch when service returns true', async () => {
    getMock.mockResolvedValue(true);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(getMock).toHaveBeenCalledWith('release_reminders');
  });

  it('returns enabled=false when service returns false', async () => {
    getMock.mockResolvedValue(false);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it('setEnabled invokes the service and refreshes the query', async () => {
    getMock.mockResolvedValue(true);
    setMock.mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useNotificationPreference('release_reminders'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    getMock.mockResolvedValue(false);
    await act(async () => {
      result.current.setEnabled(false);
    });
    await waitFor(() => expect(setMock).toHaveBeenCalledWith('release_reminders', false));
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });
});
```

- [ ] **Step 6.2: Run the tests to verify they fail**

```bash
npx jest __tests__/hooks/use-notification-preferences.test.ts 2>&1
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement the hook**

Create `hooks/use-notification-preferences.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPreference,
  setNotificationPreference,
  type NotificationFeature,
} from '@/lib/notification-preferences-service';

export function useNotificationPreference(feature: NotificationFeature) {
  const queryClient = useQueryClient();
  const queryKey = ['notification-preference', feature];

  const query = useQuery({
    queryKey,
    queryFn: () => getNotificationPreference(feature),
    staleTime: 1000 * 60 * 5,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => setNotificationPreference(feature, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    enabled: query.data ?? true,
    isLoading: query.isLoading,
    setEnabled: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
```

- [ ] **Step 6.4: Run the tests to verify they pass**

```bash
npx jest __tests__/hooks/use-notification-preferences.test.ts 2>&1
```

Expected: 3 passed.

- [ ] **Step 6.5: Commit**

```bash
git add hooks/use-notification-preferences.ts \
        __tests__/hooks/use-notification-preferences.test.ts
git commit -m "feat(notifications): useNotificationPreference hook (TDD)

React Query hook over notification-preferences-service. 5-min staleTime
on the read; mutation invalidates the query key on success so toggle
reflects in UI immediately. 3 test cases — default true, false read,
mutate-and-refetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Settings screen — `app/settings/notifications.tsx` (TDD)

**Files:**
- Create: `app/settings/notifications.tsx`
- Create: `__tests__/app/settings/notifications.test.tsx`

Single toggle for v1. ON triggers `registerForPushNotifications()` first; OFF persists `enabled=false` without revoking the OS-level token.

- [ ] **Step 7.1: Write the failing tests**

Create `__tests__/app/settings/notifications.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import * as prefService from '@/lib/notification-preferences-service';
import * as pushHook from '@/hooks/use-push-notifications';
import * as analyticsModule from '@/lib/analytics';
import Toast from 'react-native-toast-message';

jest.mock('@/lib/notification-preferences-service');
jest.mock('@/hooks/use-push-notifications');
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));

const getPrefMock = prefService.getNotificationPreference as jest.Mock;
const setPrefMock = prefService.setNotificationPreference as jest.Mock;
const usePushMock = pushHook.usePushNotifications as jest.Mock;
const trackSpy = jest.spyOn(analyticsModule.analytics, 'track');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPrefMock.mockResolvedValue(false);
  setPrefMock.mockResolvedValue(undefined);
});

describe('NotificationsSettingsScreen', () => {
  it('renders the Release reminders toggle', async () => {
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    expect(await findByLabelText('Release reminders')).toBeTruthy();
  });

  it('toggling ON requests permission and persists when granted', async () => {
    const requestPermission = jest.fn().mockResolvedValue(true);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: true,
    });
  });

  it('toggling ON when permission denied surfaces toast and does NOT persist', async () => {
    const requestPermission = jest.fn().mockResolvedValue(false);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalled());
    expect(setPrefMock).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
  });

  it('toggling OFF persists enabled=false without re-requesting permission', async () => {
    getPrefMock.mockResolvedValue(true);
    const requestPermission = jest.fn();
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', false);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', false)
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: false,
    });
  });

  it('toggling ON when permission already granted skips the prompt', async () => {
    const requestPermission = jest.fn();
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const toggle = await findByLabelText('Release reminders');
    fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2: Run the tests to verify they fail**

```bash
npx jest __tests__/app/settings/notifications.test.tsx 2>&1
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the screen**

Create `app/settings/notifications.tsx`:

```tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer } from '@/components/content-container';
import { useNotificationPreference } from '@/hooks/use-notification-preferences';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { hapticImpact } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export default function NotificationsSettingsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { enabled, isLoading, setEnabled, isUpdating } =
    useNotificationPreference('release_reminders');
  const { permissionStatus, requestPermission, isAvailable } = usePushNotifications();

  const handleToggle = async (next: boolean) => {
    hapticImpact();
    if (next && permissionStatus !== 'granted') {
      const granted = await requestPermission();
      if (!granted) {
        Toast.show({
          type: 'info',
          text1: 'Permission required',
          text2: 'Enable notifications in your device Settings to get release reminders.',
          visibilityTime: 4000,
        });
        return;
      }
    }
    setEnabled(next);
    analytics.track('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: next,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <ActivityIndicator
          size="small"
          color={colors.tint}
          style={{ marginTop: Spacing.lg }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text
          style={[styles.title, Typography.heading.h3, { color: colors.text }]}
        >
          Notifications
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ContentContainer>
        <View
          style={[
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowText}>
            <Text
              style={[
                Typography.body.base,
                { color: colors.text, fontWeight: '600' },
              ]}
            >
              Release reminders
            </Text>
            <Text
              style={[
                Typography.body.sm,
                { color: colors.textSecondary, marginTop: 2 },
              ]}
            >
              Notify me when a watchlisted movie hits theaters or streaming.
            </Text>
          </View>
          <ToggleSwitch
            value={enabled}
            onValueChange={handleToggle}
            disabled={isUpdating || !isAvailable}
            accessibilityLabel="Release reminders"
          />
        </View>
        {!isAvailable && (
          <Text
            style={[styles.helpText, { color: colors.textTertiary }]}
          >
            Notifications are not available on this platform.
          </Text>
        )}
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: { textAlign: 'center', flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  rowText: { flex: 1 },
  helpText: {
    fontSize: 12,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
```

- [ ] **Step 7.4: Run the tests to verify they pass**

```bash
npx jest __tests__/app/settings/notifications.test.tsx 2>&1
```

Expected: 5 passed.

- [ ] **Step 7.5: Commit**

```bash
git add app/settings/notifications.tsx \
        __tests__/app/settings/notifications.test.tsx
git commit -m "feat(notifications): /settings/notifications screen (TDD)

Single toggle for release reminders. ON triggers
registerForPushNotifications() before persisting; permission denied
surfaces a toast and reverts the toggle. OFF persists enabled=false
without revoking the OS token (other features may want push later).
Emits notifications:toggle_changed analytics on every successful
commit. 5 test cases — render, ON-grant, ON-deny, OFF, ON-already-granted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Settings index — add Notifications row

**Files:**
- Modify: `app/settings/index.tsx`

Add a row that pushes to `/settings/notifications`. Place it next to the existing notifications-related setting (or next to the privacy/permission rows — the implementer should pick the most natural neighbor).

- [ ] **Step 8.1: Open `app/settings/index.tsx` and identify the existing settings-row pattern**

Read the file. Find the section/group that holds privacy / permission / preference rows. Match the visual style (likely uses `<Pressable>` with `ChevronRightIcon` and a label).

- [ ] **Step 8.2: Add the Notifications row**

Add a new row near the privacy/preference cluster:

```tsx
<Pressable
  style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
  onPress={() => {
    hapticImpact();
    router.push('/settings/notifications');
  }}
  accessibilityRole="button"
  accessibilityLabel="Notification settings"
>
  <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
    Notifications
  </Text>
  <ChevronRightIcon color={colors.textSecondary} />
</Pressable>
```

The exact wrapper / styles must match what the implementer finds in the file. Use the existing row pattern, do not invent a new one.

- [ ] **Step 8.3: Run lint + typecheck**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
npm run lint 2>&1 | tail -20
npx tsc --noEmit 2>&1 | tail -20
```

Expected: both clean (no new errors).

- [ ] **Step 8.4: Smoke-render in Jest by adding a test or by extending the existing settings test**

If a test for `app/settings/index.tsx` exists, add a "renders Notifications row that navigates to /settings/notifications" test. If not, skip the test (manual QA in Task 10 covers this).

```bash
ls __tests__/app/settings/ 2>&1
```

(If `index.test.tsx` exists, follow its mocking pattern. Otherwise, skip.)

- [ ] **Step 8.5: Commit**

```bash
git add app/settings/index.tsx
# Plus the test if one was added
git commit -m "feat(notifications): add Notifications row to Settings index

Navigates to the new /settings/notifications page. Matches the
existing settings-row pattern (Pressable + ChevronRight + label).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Tap analytics — extend `handleNotificationResponse`

**Files:**
- Modify: `lib/push-notification-service.ts:258-267` (the `handleNotificationResponse` function)
- Modify: `__tests__/lib/push-notification-service.test.ts:293-333` (existing describe block — add one new test)

Emit `release_reminder:tapped` when the user taps a release-reminder push. Must NOT break any of the existing 4 tests at lines 293-333.

- [ ] **Step 9.1: Add the failing test**

Inside the existing `describe('handleNotificationResponse', () => { ... })` block in `__tests__/lib/push-notification-service.test.ts`, add a new test below the existing ones. The mocking pattern for `analytics` should match the file's existing patterns (imports the module, uses `jest.spyOn` or extends the existing module mock at the top of the file). Read the file to see how analytics is imported elsewhere and mirror.

```ts
it('emits release_reminder:tapped when feature is release_reminders', () => {
  // Mock setup follows the file's existing analytics mocking pattern;
  // if analytics isn't yet mocked at module scope, add:
  //   jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));
  // at the top of the file (next to other module mocks).
  const { analytics } = require('@/lib/analytics');
  const trackSpy = analytics.track as jest.Mock;
  trackSpy.mockClear();

  const response: any = {
    notification: {
      request: {
        content: {
          data: {
            url: '/movie/12345',
            tmdb_id: 12345,
            category: 'theatrical',
            feature: 'release_reminders',
          },
        },
      },
    },
  };
  handleNotificationResponse(response);
  expect(trackSpy).toHaveBeenCalledWith('release_reminder:tapped', {
    tmdb_id: 12345,
    category: 'theatrical',
  });
});
```

If `@/lib/analytics` is not yet jest-mocked in this file, add the mock at module scope before any `describe`. (Check existing mocks first — there should be `jest.mock('expo-router', ...)` and similar near the top.)

- [ ] **Step 9.2: Run the new test to verify it fails**

```bash
npx jest __tests__/lib/push-notification-service.test.ts -t 'release_reminder:tapped' 2>&1
```

Expected: FAIL — analytics.track was not called.

- [ ] **Step 9.3: Modify `handleNotificationResponse`**

Replace lines 258-267 of `lib/push-notification-service.ts`:

```ts
import { analytics } from './analytics';   // add at the top of the file

// ...

export function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data;
  if (data && data.feature === 'release_reminders') {
    analytics.track('release_reminder:tapped', {
      tmdb_id: typeof data.tmdb_id === 'number' ? data.tmdb_id : null,
      category: typeof data.category === 'string' ? data.category : null,
    });
  }
  const url = getNotificationUrl(response.notification);
  if (url) {
    setTimeout(() => {
      router.push(url as any);
    }, 0);
  }
}
```

- [ ] **Step 9.4: Run all tests in the file and verify all pass (the new one + the existing 4)**

```bash
npx jest __tests__/lib/push-notification-service.test.ts 2>&1
```

Expected: all tests in the file pass — original 4 still green plus 1 new green.

- [ ] **Step 9.5: Commit**

```bash
git add lib/push-notification-service.ts \
        __tests__/lib/push-notification-service.test.ts
git commit -m "feat(notifications): emit release_reminder:tapped analytics

Extend handleNotificationResponse to track when a user taps a
release-reminder push. Reads tmdb_id + category from the data payload,
calls analytics.track before the existing router.push navigation.
Backward-compatible: non-release-reminder notifications skip the track.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Verification gate — lint + typecheck + full Jest

- [ ] **Step 10.1: Run the full pre-PR check**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-release-reminders
npm run lint && npx tsc --noEmit && npm test 2>&1 | tail -40
```

Expected:
- ESLint: 0 errors, 0 warnings (or only pre-existing warnings unchanged from `origin/main`).
- TypeScript: no errors.
- Jest: all suites pass (existing + the ones added in this PR).

If any test outside this PR's scope is failing, document it in the PR body as pre-existing. Do not silence or skip tests.

- [ ] **Step 10.2: Manual device QA on TestFlight build**

Perform once before opening the PR for human review. Steps:

1. Open app → Settings → Notifications. Confirm the row exists.
2. Tap into the screen. Confirm the toggle reads OFF.
3. Toggle ON. Confirm OS permission prompt appears (if undetermined). Grant.
4. Confirm a row appears in `push_tokens` (Supabase Studio for project `wliblwulvsrfgqcnbzeh`).
5. (Test data setup) Insert a synthetic row via Supabase MCP `execute_sql`:
   ```sql
   INSERT INTO release_calendar
     (tmdb_id, region, release_date, release_type, title, poster_path, vote_average)
   VALUES (
     999999, 'US', CURRENT_DATE, 1, 'QA Test Release', NULL, 7.5
   ) ON CONFLICT DO NOTHING;
   ```
6. Add tmdb_id=999999 to your watchlist via the app (or via SQL):
   ```sql
   INSERT INTO user_movies (user_id, tmdb_id, status, title, added_at)
   VALUES ('<your-user-id>', 999999, 'watchlist', 'QA Test Release', now())
   ON CONFLICT DO NOTHING;
   ```
7. Manually invoke the function via Supabase MCP `execute_sql`:
   ```sql
   SELECT net.http_post(
     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
            || '/functions/v1/send-release-reminders',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
     ),
     body := '{}'::jsonb
   );
   ```
8. Confirm push arrives on device with title "🎬 QA Test Release — now in theaters".
9. Tap the notification → confirm app opens to `/movie/999999` (likely a 404 movie since synthetic; the navigation itself is the test).
10. Confirm a row appears in `push_notification_log` with `feature='release_reminders'` and `data->>'tmdb_id'='999999'`.
11. Re-invoke the function. Confirm no second push (dedup working). Inspect the function response — `{candidates: 0, ...}`.
12. Toggle Release reminders OFF in the settings screen.
13. Re-insert a different synthetic release (different tmdb_id) and watchlist it, then re-invoke. Confirm no push (opt-out working). Inspect `push_notification_log` for `skipped: 'all_opted_out'` in the response of the inner `send-push-notification` (or note the empty fanout).
14. Clean up synthetic rows:
    ```sql
    DELETE FROM user_movies WHERE tmdb_id IN (999999, <second_tmdb_id>);
    DELETE FROM release_calendar WHERE tmdb_id IN (999999, <second_tmdb_id>);
    DELETE FROM push_notification_log WHERE data->>'tmdb_id' IN ('999999', '<second_tmdb_id>');
    ```

- [ ] **Step 10.3: Open the PR**

```bash
git push -u origin feat/release-reminders
gh pr create --title "feat(notifications): release reminders v1" --body "$(cat <<'EOF'
## Summary
- First consumer of the push-notification infra: a daily 14:00 UTC cron pushes a release reminder to every user with a watchlisted movie releasing today (US, theatrical or streaming).
- New `/settings/notifications` page with a single toggle so users can mute the feature without disabling notifications at the OS level.
- No new tables — eligibility derived live from `user_movies` JOIN `release_calendar` via a SECURITY DEFINER RPC; opt-out via existing `notification_preferences`; dedup via `push_notification_log.data` JSONB.

## Test plan
- [x] `npm run lint && npx tsc --noEmit && npm test` clean
- [x] Unit tests added (groupRemindersByMovie helper, prefs service, hook, settings screen, tap analytics)
- [x] Migrations applied via Supabase MCP; RPC and cron job verified in `pg_proc` and `cron.job`
- [x] Edge function deployed via Supabase MCP; manual invocation produces `{candidates: 0, ...}` baseline
- [x] Manual device QA — synthetic release + watchlist add → push arrives → tap deep-links to /movie/:id → re-invoke deduped → toggle off skips delivery

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|--------------|-----------|
| §3 In v1 — daily cron 14:00 UTC | Task 2 |
| §3 In v1 — categories theatrical + streaming | Task 1 (RPC CASE), Task 3 (helper title), Task 4 (function flow) |
| §3 In v1 — dedup via push_notification_log | Task 1 (RPC NOT EXISTS) |
| §3 In v1 — settings page + single toggle | Task 7 |
| §3 In v1 — settings index row | Task 8 |
| §3 In v1 — US users only | Task 1 (`region = 'US'` in RPC) |
| §4.1 — data flow | Tasks 1, 3, 4 |
| §4.2 — no new tables | Confirmed; only RPC + cron migrations, no DDL |
| §4.3 — edge function shape | Task 4 |
| §4.4 — RPC justification | Task 1 |
| §4.5 — cron migration | Task 2 |
| §4.6 — client architecture (service + hook + screen) | Tasks 5, 6, 7 |
| §5 files list | Tasks 1-9 |
| §6 preference semantics (absence = enabled true) | Task 5 (service); Task 4 reuses send-push-notification's matching logic |
| §7 permission flow | Task 7 |
| §8 cron timing 14:00 UTC | Task 2 |
| §9 dedup details | Task 1 |
| §10 error handling — RPC empty, opt-out, no token | Task 4 |
| §10 — title NULL skip | Task 1 (`AND rc.title IS NOT NULL`) |
| §11 testing strategy — client + edge | Tasks 3, 5, 6, 7, 9 (all TDD) |
| §11 — manual QA | Task 10 |
| §12 rollout — migrations + deploy + verify | Tasks 1.3, 2.3, 4.3, 10.1, 10.2 |
| §12 step 5 — PostHog instrumentation | Task 7 (toggle event), Task 9 (tap event) |
| §13 observability | Logged in Task 4 (`console.log` of result), surfaced in `push_notification_log` |

**Placeholder scan:** None. Every code block contains real, runnable code. Migration filenames use a generated UTC timestamp pattern (Step 1.1 / 2.1) — this matches the codebase convention. The Settings index row (Task 8) intentionally points at "match the existing pattern" because the file's exact structure may have evolved since I read it; the implementer reads it and matches. That's not a TODO — it's a "follow existing convention" instruction with sufficient detail for the implementer to act.

**Type consistency:**
- `PendingReminder` defined in Task 3, imported in Task 4. ✓
- `ReminderPayload` defined in Task 3, used in Task 4 (typed via the imported helper). ✓
- `NotificationFeature` defined in Task 5, imported in Task 6. ✓
- `release_reminders` literal — used identically across RPC, helper, edge function, service, hook, screen, analytics. ✓
- `theatrical` and `streaming` literals — used identically across RPC and helper. ✓
- Analytics event names — `notifications:toggle_changed` and `release_reminder:tapped` — used in screen (Task 7) and push-service (Task 9), referenced consistently. ✓

**Scope check:** This plan produces a single coherent PR. No subsystem decomposition needed.
