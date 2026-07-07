import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import {
  buildDay2BridgePayloads,
  type Day2BridgeCandidate,
  type NearRelease,
} from "./day2-bridge-copy.ts";

// PS-15 PR 1 — component B, the metric-mover (D1->D2 return of new external
// cohorts). Ships DARK in this PR: no cron scheduling, no migration
// application beyond the RPC definitions — HQ schedules the cron in DB after
// the DRAFT copy in day2-bridge-copy.ts clears Content Queue review.

interface Result {
  candidates: number;
  groups: number;
  sent: number;
  errors: number;
  error?: string;
}

const NEAR_RELEASE_WINDOW_DAYS = 30;

Deno.serve(async (req: Request) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  // Forward the inbound auth header for the internal call to
  // send-push-notification — see the identical comment + PR #416 history in
  // send-release-reminders/index.ts.
  const inboundAuth = req.headers.get("authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: candidateRows, error: candidateError } = await supabaseAdmin.rpc(
      "get_pending_day2_bridge_candidates"
    );

    if (candidateError) {
      console.error("[send-day2-bridge] RPC error:", candidateError);
      return new Response(
        JSON.stringify({ error: candidateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const userIds = ((candidateRows ?? []) as { user_id: string }[]).map(
      (r) => r.user_id
    );

    if (userIds.length === 0) {
      const empty: Result = { candidates: 0, groups: 0, sent: 0, errors: 0 };
      return new Response(
        JSON.stringify(empty),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Personalization query ①②③: watchlist rows for these users, then any
    // release_calendar entries within the next 30 days for those tmdb_ids.
    const { data: watchlistRows } = await supabaseAdmin
      .from("user_movies")
      .select("user_id, tmdb_id")
      .in("user_id", userIds)
      .eq("status", "watchlist");

    const watchlistByUser = new Map<string, number[]>();
    for (const row of (watchlistRows ?? []) as { user_id: string; tmdb_id: number }[]) {
      const list = watchlistByUser.get(row.user_id) ?? [];
      list.push(row.tmdb_id);
      watchlistByUser.set(row.user_id, list);
    }

    const allTmdbIds = [...new Set(
      ((watchlistRows ?? []) as { tmdb_id: number }[]).map((r) => r.tmdb_id)
    )];

    const releaseByTmdbId = new Map<number, NearRelease>();
    if (allTmdbIds.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const windowEnd = new Date(
        Date.now() + NEAR_RELEASE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString().slice(0, 10);

      const { data: releaseRows } = await supabaseAdmin
        .from("release_calendar")
        .select("tmdb_id, title, release_date, release_type")
        .in("tmdb_id", allTmdbIds)
        .eq("region", "US")
        .gte("release_date", today)
        .lte("release_date", windowEnd)
        .in("release_type", [1, 2, 3, 6])
        .not("title", "is", null)
        .order("release_date", { ascending: true });

      for (const row of (releaseRows ?? []) as {
        tmdb_id: number;
        title: string;
        release_date: string;
        release_type: number;
      }[]) {
        // First (earliest) release per tmdb_id wins — rows are pre-sorted ascending.
        if (!releaseByTmdbId.has(row.tmdb_id)) {
          releaseByTmdbId.set(row.tmdb_id, {
            tmdb_id: row.tmdb_id,
            title: row.title,
            release_date: row.release_date,
            category: [1, 2, 3].includes(row.release_type) ? "theatrical" : "streaming",
          });
        }
      }
    }

    const candidates: Day2BridgeCandidate[] = userIds.map((user_id) => {
      const tmdbIds = watchlistByUser.get(user_id) ?? [];
      let nearRelease: NearRelease | undefined;
      for (const tmdbId of tmdbIds) {
        const release = releaseByTmdbId.get(tmdbId);
        if (release) {
          nearRelease = release;
          break;
        }
      }
      return { user_id, has_watchlist: tmdbIds.length > 0, near_release: nearRelease };
    });

    const payloads = buildDay2BridgePayloads(candidates);

    let sent = 0;
    let errors = 0;

    for (const payload of payloads) {
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/send-push-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": inboundAuth,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!resp.ok) {
        errors++;
        const text = await resp.text();
        console.error(
          `[send-day2-bridge] send-push-notification ${resp.status}: ${text}`
        );
        continue;
      }
      const json = await resp.json() as { sent?: number; error?: string; skipped?: string };
      sent += json.sent ?? 0;
      if (json.error || json.skipped) {
        console.log(
          `[send-day2-bridge] group skipped: ${JSON.stringify({
            variant: payload.data.variant,
            error: json.error,
            skipped: json.skipped,
          })}`
        );
      }
    }

    const result: Result = {
      candidates: userIds.length,
      groups: payloads.length,
      sent,
      errors,
    };
    console.log("[send-day2-bridge]", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-day2-bridge] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
