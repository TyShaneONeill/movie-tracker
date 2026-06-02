// capture-lead — Edge Function
//
// Public landing-page email capture (public/welcome.html "Keep your seat" block,
// and the future Android "notify me" block). Invoked from the browser with NO
// Supabase key — config.toml sets verify_jwt = false so the gateway allows
// unauthenticated calls, which means the anon key never has to be embedded in the
// static page. The insert is done server-side with the service-role client into
// public.email_leads (which is insert-only for anon; service role bypasses RLS).
//
// Env deps (always present in the Edge runtime):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Returns 200 {ok:true} for new AND duplicate captures, 400 for invalid input,
// 500 for unexpected insert errors.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_SOURCES = new Set(["web_welcome", "android_notify"]);

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

  // 23505 = unique_violation: already on the list. Treat as success.
  if (error && error.code !== "23505") {
    console.error("[capture-lead] insert failed:", error.message);
    return json({ error: "insert_failed" }, 500, cors);
  }

  return json({ ok: true }, 200, cors);
});
