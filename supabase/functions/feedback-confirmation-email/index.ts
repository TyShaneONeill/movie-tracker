// feedback-confirmation-email — Edge Function (PRD-5 Sprint 3)
//
// Triggered by an AFTER INSERT trigger on public.feature_requests (see
// 20260525071606_feedback_confirmation_email.sql). The trigger fires a
// pg_net HTTP POST shaped like Supabase's native Database Webhook payload.
//
// What we do:
//   1. Parse the webhook payload, pull out the new row.
//   2. If user_id is NULL (defensive — shouldn't happen on INSERT, but FK is
//      ON DELETE SET NULL), no-op.
//   3. If confirmation_email_sent_at is already set, no-op (idempotency guard
//      against pg_net / Supabase webhook retries).
//   4. Look up the user's email from auth.users via service-role client.
//   5. Send a templated "thanks for your feedback" email via Resend.
//   6. Stamp confirmation_email_sent_at = now() on success.
//
// Returns 200 on success or any expected no-op. Returns 500 on real errors
// (e.g. Resend down) so pg_net + Supabase webhook layer can retry.
//
// Env deps (set via `supabase secrets set --project-ref wliblwulvsrfgqcnbzeh`):
//   - SUPABASE_URL                 (always available in Edge runtime)
//   - SUPABASE_SERVICE_ROLE_KEY    (always available in Edge runtime)
//   - RESEND_API_KEY               *** NEW — must be set in Doppler + Supabase secrets ***
//   - FEEDBACK_FROM_EMAIL          (optional, defaults to "PocketStubs <feedback@pocketstubs.com>")
//
// The function is invoked by the trigger with the service-role Bearer token,
// so the default verify_jwt = true on the Supabase gateway is fine — no
// config.toml override needed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface FeatureRequestRecord {
  id: string;
  user_id: string | null;
  type: "feature_request" | "feedback";
  title: string;
  description: string;
  screenshot_url: string | null;
  app_version: string | null;
  platform: string | null;
  status: string;
  created_at: string | null;
  confirmation_email_sent_at: string | null;
}

interface WebhookPayload {
  type: "INSERT";
  table: "feature_requests";
  schema: "public";
  record: FeatureRequestRecord;
  old_record: null;
}

interface ResultBody {
  status: "sent" | "skipped";
  reason?: string;
  feature_request_id?: string;
}

const FROM_EMAIL =
  Deno.env.get("FEEDBACK_FROM_EMAIL") ?? "PocketStubs <feedback@pocketstubs.com>";

Deno.serve(async (req: Request) => {
  // Supabase may send HEAD checks against function URLs — answer politely.
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const record = payload?.record;
  if (!record || !record.id) {
    return new Response(
      JSON.stringify({ error: "missing_record" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------
  // Defensive: deleted-account row should be impossible on INSERT, but the
  // FK is ON DELETE SET NULL so user_id can legally be null on later rows.
  // ---------------------------------------------------------------------
  if (!record.user_id) {
    return ok({ status: "skipped", reason: "no_user_id", feature_request_id: record.id });
  }

  // ---------------------------------------------------------------------
  // Idempotency: bail if we've already sent for this row.
  // ---------------------------------------------------------------------
  if (record.confirmation_email_sent_at) {
    return ok({
      status: "skipped",
      reason: "already_sent",
      feature_request_id: record.id,
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[feedback-confirmation-email] missing SUPABASE env");
    return err(500, "missing_supabase_env");
  }
  if (!RESEND_API_KEY) {
    console.error("[feedback-confirmation-email] RESEND_API_KEY not set");
    return err(500, "missing_resend_api_key");
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------------------
  // Double-check idempotency against the DB (in case the webhook payload
  // we received is stale relative to a concurrent retry that already
  // stamped the row).
  // ---------------------------------------------------------------------
  const { data: freshRow, error: freshErr } = await supabaseAdmin
    .from("feature_requests")
    .select("id, user_id, title, type, confirmation_email_sent_at")
    .eq("id", record.id)
    .single();

  if (freshErr) {
    console.error("[feedback-confirmation-email] fresh-row lookup failed:", freshErr);
    return err(500, "fresh_row_lookup_failed");
  }
  if (freshRow?.confirmation_email_sent_at) {
    return ok({
      status: "skipped",
      reason: "already_sent",
      feature_request_id: record.id,
    });
  }

  // ---------------------------------------------------------------------
  // Look up the submitter's email from auth.users (admin API).
  // ---------------------------------------------------------------------
  const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin
    .getUserById(record.user_id);
  if (userErr || !userResp?.user?.email) {
    console.error(
      "[feedback-confirmation-email] auth.users lookup failed:",
      userErr,
    );
    // No usable email — skip silently rather than retry forever.
    return ok({
      status: "skipped",
      reason: "no_email_on_user",
      feature_request_id: record.id,
    });
  }
  const recipientEmail = userResp.user.email;

  // ---------------------------------------------------------------------
  // Compose + send the email via Resend.
  // ---------------------------------------------------------------------
  const typeLabel = record.type === "feature_request"
    ? "feature request"
    : "general feedback";
  const subject = "Thanks for your feedback";
  const { html, text } = renderEmail({
    typeLabel,
    title: record.title,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject,
      html,
      text,
    }),
  });

  if (!resendRes.ok) {
    const body = await resendRes.text().catch(() => "");
    console.error(
      `[feedback-confirmation-email] resend ${resendRes.status}: ${body.slice(0, 400)}`,
    );
    return err(500, `resend_failed_${resendRes.status}`);
  }

  // ---------------------------------------------------------------------
  // Stamp the row so retries skip.
  // ---------------------------------------------------------------------
  const { error: stampErr } = await supabaseAdmin
    .from("feature_requests")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", record.id);

  if (stampErr) {
    // The email already went out — surface the failure but don't 500, since
    // a retry would send a duplicate email. Log loudly so we notice in
    // function logs.
    console.error(
      "[feedback-confirmation-email] stamp failed (email already sent):",
      stampErr,
    );
  }

  return ok({
    status: "sent",
    feature_request_id: record.id,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(body: ResultBody): Response {
  return new Response(
    JSON.stringify(body),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function err(status: number, reason: string): Response {
  return new Response(
    JSON.stringify({ error: reason }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Escape user-supplied text for safe HTML rendering. The title comes from
 * RPC-validated user input and is bounded to 100 chars, but we still escape
 * defensively — the email body is HTML.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RenderArgs {
  typeLabel: string;
  title: string;
}

function renderEmail({ typeLabel, title }: RenderArgs): { html: string; text: string } {
  const safeTitle = escapeHtml(title);
  const safeType = escapeHtml(typeLabel);

  const text = [
    "Thanks for your feedback!",
    "",
    `We got your ${typeLabel} — "${title}" — and the team will take a look.`,
    "",
    "You can track this and your other submissions under Settings → Feedback & Feature Requests.",
    "",
    "— The PocketStubs team",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">Thanks for your feedback!</h1>
    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">
      We got your ${safeType} and the team will take a look.
    </p>
    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px; padding: 12px 16px; background: #f3f4f6; border-left: 3px solid #b91c3c; border-radius: 4px;">
      <strong>${safeTitle}</strong>
    </p>
    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 16px;">
      You can track this and your other submissions under
      <strong>Settings → Feedback &amp; Feature Requests</strong> in the app.
    </p>
    <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">— The PocketStubs team</p>
  </body>
</html>`;

  return { html, text };
}
