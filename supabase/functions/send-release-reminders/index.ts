import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import { groupRemindersByMovie, type PendingReminder } from "./build-reminder-payload.ts";

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

    const { data: dayOfData, error: dayOfError } = await supabaseAdmin.rpc(
      "get_pending_release_reminders",
      { p_days_before: 0 }
    );

    if (dayOfError) {
      console.error("[send-release-reminders] RPC error (day_of):", dayOfError);
      return new Response(
        JSON.stringify({ error: dayOfError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // PS-15 PR 1 — component C: "opens tomorrow" day-before nudge, additive to
    // the existing day-of path above. Non-blocking: a failure here must not
    // take down the already-shipped day-of sends.
    const { data: dayBeforeData, error: dayBeforeError } = await supabaseAdmin.rpc(
      "get_pending_release_reminders",
      { p_days_before: 1 }
    );
    if (dayBeforeError) {
      console.error("[send-release-reminders] RPC error (day_before):", dayBeforeError);
    }

    const reminders = [
      ...((dayOfData ?? []) as PendingReminder[]),
      ...((dayBeforeData ?? []) as PendingReminder[]),
    ];
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
            "Authorization": inboundAuth,
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
          `[send-release-reminders] group skipped: ${JSON.stringify({
            tmdb_id: payload.data.tmdb_id,
            category: payload.data.category,
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
