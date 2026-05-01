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

  // Forward the inbound auth header for the internal call to send-push-notification.
  // Supabase migrated SUPABASE_SERVICE_ROLE_KEY env var to the new sb_secret_* format
  // which is NOT a JWT and fails verify_jwt=true gateway validation. The vault-stored
  // service_role_key (legacy JWT) is what cron uses for inbound auth, so we forward
  // it for outbound auth. (Discovered 2026-05-01 during PR #416 deploy.)
  const inboundAuth = req.headers.get("authorization") || "";
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
            "Authorization": inboundAuth,
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
