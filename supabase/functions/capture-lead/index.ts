// capture-lead — Edge Function
//
// Public landing-page email capture (public/welcome.html "Keep your seat" block,
// and the future Android "notify me" block). Invoked from the browser with NO
// Supabase key — config.toml sets verify_jwt = false so the gateway allows
// unauthenticated calls, which means the anon key never has to be embedded in the
// static page. The insert is done server-side with the service-role client into
// public.email_leads (which is insert-only for anon; service role bypasses RLS).
//
// On a genuinely NEW capture, sends a brand-voice "you're on the list"
// confirmation via Resend (best-effort — a Resend failure never fails the
// capture). Duplicate signups are not re-emailed.
//
// Env deps:
//   - SUPABASE_URL                 (always present in the Edge runtime)
//   - SUPABASE_SERVICE_ROLE_KEY    (always present in the Edge runtime)
//   - RESEND_API_KEY               (project secret — already set for feedback-confirmation-email)
//   - LEAD_FROM_EMAIL              (optional, defaults to "PocketStubs <noreply@pocketstubs.com>")
//
// Returns 200 {ok:true} for new AND duplicate captures, 400 for invalid input,
// 500 for unexpected insert errors.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_SOURCES = new Set(["web_welcome", "android_notify"]);
const FROM_EMAIL = Deno.env.get("LEAD_FROM_EMAIL") ??
  "PocketStubs <noreply@pocketstubs.com>";

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  let body: { email?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const email = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  const source = typeof body.source === "string" && ALLOWED_SOURCES.has(body.source)
    ? body.source
    : "web_welcome";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "invalid_email" }, 400, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.from("email_leads").insert({ email, source });

  if (error) {
    // 23505 = unique_violation: already on the list. Success, but do NOT re-email.
    if (error.code === "23505") {
      return json({ ok: true }, 200, cors);
    }
    console.error("[capture-lead] insert failed:", error.message);
    return json({ error: "insert_failed" }, 500, cors);
  }

  // New capture — send the confirmation email. Best-effort: never fail the
  // capture if Resend is down or unconfigured (the lead is already saved).
  await sendConfirmationEmail(email).catch((e) => {
    console.error(
      "[capture-lead] confirmation email failed:",
      e instanceof Error ? e.message : String(e),
    );
  });

  return json({ ok: true }, 200, cors);
});

/**
 * Send the "you're on the list" confirmation via Resend. Throws on a Resend
 * error so the caller can log it; the caller swallows it (best-effort).
 */
async function sendConfirmationEmail(to: string): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("[capture-lead] RESEND_API_KEY not set — skipping confirmation email");
    return;
  }

  const subject = "You're on the list — PocketStubs";
  const { html, text } = renderEmail();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

function renderEmail(): { html: string; text: string } {
  const text = [
    "You're on the list.",
    "",
    "Thanks for keeping your seat. We'll send you one email the moment PocketStubs",
    "lands on your platform — plus first access when journey-art seasons drop.",
    "",
    "Until then, your stub's safe with us.",
    "",
    "— PocketStubs",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111827;">
    <h1 style="font-size: 22px; margin: 0 0 16px;">You're on the list.</h1>
    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
      Thanks for keeping your seat. We'll send you one email the moment PocketStubs
      lands on your platform &mdash; plus first access when journey-art seasons drop.
    </p>
    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Until then, your stub&rsquo;s safe with us.
    </p>
    <p style="font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">
      &mdash; PocketStubs
    </p>
  </body>
</html>`;

  return { html, text };
}
