import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireServiceRole } from "../_shared/cron-auth.ts";

// Server-side relay of content reports to the Discord moderation channel.
//
// Invoked ONLY by the AFTER INSERT trigger on public.reports
// (reports_notify_discord, migration 20260607203757) via pg_net with the
// vault-stored service-role JWT. verify_jwt = true at the gateway + the
// requireServiceRole check below means a logged-in user can't call this
// directly to spam the channel.
//
// Why server-side: the old client (lib/report-service.ts) POSTed to
// EXPO_PUBLIC_DISCORD_MODERATION_WEBHOOK, which baked the webhook URL into the
// public app/web bundle (extractable → spammable). It also only fired on web
// (native skipped it for CORS), so native reports never reached moderators.
// Moving it here removes the secret from the bundle AND covers every platform.
//
// Env (Supabase function secret, NO EXPO_PUBLIC_ prefix):
//   - DISCORD_MODERATION_WEBHOOK

interface ReportRecord {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string | null;
  created_at: string | null;
}

interface WebhookPayload {
  type: "INSERT";
  table: "reports";
  schema: "public";
  record: ReportRecord;
  old_record: null;
}

Deno.serve(async (req: Request) => {
  const authError = requireServiceRole(req);
  if (authError) return authError;

  try {
    const webhookUrl = Deno.env.get('DISCORD_MODERATION_WEBHOOK');
    if (!webhookUrl) {
      console.warn('[notify-report] DISCORD_MODERATION_WEBHOOK not set — skipping notification');
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json() as WebhookPayload;
    const r = payload?.record;
    if (!r) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const embed = {
      embeds: [{
        title: '🚨 New Report Submitted',
        color: 0xe11d48,
        fields: [
          { name: 'Type', value: r.target_type ?? 'unknown', inline: true },
          { name: 'Reason', value: r.reason ?? 'unknown', inline: true },
          { name: 'Target ID', value: r.target_id ?? '—', inline: false },
          { name: 'Description', value: r.description || 'No additional details', inline: false },
        ],
        footer: { text: 'PocketStubs Moderation' },
        timestamp: r.created_at ?? new Date().toISOString(),
      }],
    };

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[notify-report] Discord webhook failed:', resp.status, text);
      return new Response(JSON.stringify({ error: 'Discord webhook failed', status: resp.status }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[notify-report] error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
