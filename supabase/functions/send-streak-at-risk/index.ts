import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import {
  buildStreakAtRiskPayloads,
  type StreakAtRiskCandidate,
} from "./streak-at-risk-copy.ts";

// PS-15 PR 3 — component: at-risk streak nudge (gentle evening reminder when a
// streak >= 3 is about to lapse). Ships DARK in this PR: no cron scheduling, no
// migration application beyond the RPC definitions, and the streak_at_risk
// notification pref defaults OFF (opt-in) — HQ schedules the hourly cron in DB
// after the DRAFT copy in streak-at-risk-copy.ts clears Content Queue review.
//
// Opt-in is enforced in get_streak_at_risk_candidates (explicit enabled=true
// pref required), so this function never nudges a user who didn't turn it on.

interface Result {
  candidates: number;
  sent: number;
  errors: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  // Forward the inbound auth header for the internal call to
  // send-push-notification — see the identical comment + PR #416 history in
  // send-day2-bridge/index.ts and send-weekly-recap/index.ts.
  const inboundAuth = req.headers.get("authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: candidateRows, error: candidateError } = await supabaseAdmin.rpc(
      "get_streak_at_risk_candidates"
    );

    if (candidateError) {
      console.error("[send-streak-at-risk] RPC error:", candidateError);
      return new Response(
        JSON.stringify({ error: candidateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const candidates = (candidateRows ?? []) as StreakAtRiskCandidate[];

    if (candidates.length === 0) {
      const empty: Result = { candidates: 0, sent: 0, errors: 0 };
      return new Response(
        JSON.stringify(empty),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // One payload per user (not grouped) for true per-user send isolation —
    // the copy is streak-count-specific anyway.
    const payloads = buildStreakAtRiskPayloads(candidates);

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
          `[send-streak-at-risk] send-push-notification ${resp.status}: ${text}`
        );
        continue;
      }
      const json = await resp.json() as { sent?: number; error?: string; skipped?: string };
      sent += json.sent ?? 0;
      if (json.error || json.skipped) {
        console.log(
          `[send-streak-at-risk] user skipped: ${JSON.stringify({
            user_id: payload.user_ids[0],
            error: json.error,
            skipped: json.skipped,
          })}`
        );
      }
    }

    const result: Result = {
      candidates: candidates.length,
      sent,
      errors,
    };
    console.log("[send-streak-at-risk]", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-streak-at-risk] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
