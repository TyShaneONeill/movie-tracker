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
