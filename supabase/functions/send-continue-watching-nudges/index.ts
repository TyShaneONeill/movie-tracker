import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import {
  buildContinueWatchingPayloads,
  type ContinueWatchingCandidate,
} from "./continue-watching-copy.ts";

// Continue-watching → Debrief Room nudge (retention experiment, founder-only).
// Fills the gap left by send-tv-episode-reminders (which only fires when a
// brand-new episode AIRS): a once-a-day nudge back to the next UNWATCHED, AIRED
// episode of a show the user is actively watching. Recipient selection + caps
// live in get_continue_watching_nudge_candidates (server-side SQL); this
// consumer just fans the candidates out to send-push-notification, mirroring
// send-tv-episode-reminders / send-weekly-recap exactly.

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
  // send-tv-episode-reminders/index.ts. sb_secret_* env keys are NOT JWTs and
  // fail verify_jwt=true; the vault-stored legacy service_role JWT that cron
  // uses for inbound auth is what we forward for outbound auth.
  const inboundAuth = req.headers.get("authorization") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: candidateRows, error: candidateError } = await supabaseAdmin.rpc(
      "get_continue_watching_nudge_candidates"
    );

    if (candidateError) {
      console.error("[send-continue-watching-nudges] RPC error:", candidateError);
      return new Response(
        JSON.stringify({ error: candidateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const candidates = (candidateRows ?? []) as ContinueWatchingCandidate[];

    if (candidates.length === 0) {
      const empty: Result = { candidates: 0, sent: 0, errors: 0 };
      return new Response(
        JSON.stringify(empty),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // One payload per user (the RPC already returns at most one per user).
    const payloads = buildContinueWatchingPayloads(candidates);

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
          `[send-continue-watching-nudges] send-push-notification ${resp.status}: ${text}`
        );
        continue;
      }
      // 200 OK can still carry `error` ("No tokens found") or `skipped`
      // ("all_opted_out") — expected empty-send outcomes, not failures.
      const json = await resp.json() as { sent?: number; error?: string; skipped?: string };
      sent += json.sent ?? 0;
      if (json.error || json.skipped) {
        console.log(
          `[send-continue-watching-nudges] user skipped: ${JSON.stringify({
            user_id: payload.user_ids[0],
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
      candidates: candidates.length,
      sent,
      errors,
    };
    console.log("[send-continue-watching-nudges]", JSON.stringify(result));
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-continue-watching-nudges] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
