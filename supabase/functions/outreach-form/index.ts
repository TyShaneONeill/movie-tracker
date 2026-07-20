// outreach-form — Edge Function
//
// Backs the tokenized outreach feedback funnel (public/outreach.html). Launch-week
// emails carry a unique ?t=<token> link; the static page calls this function with
// NO Supabase key. config.toml sets verify_jwt = false — the token IS the auth,
// so the anon key never has to ship in the page. All DB access is service-role,
// so RLS keeps outreach_invites completely closed to client roles.
//
// Two actions on POST:
//   { action: 'load',   token }                       → validate + mark clicked_at, return form state
//   { action: 'submit', token, answers, followup_ok } → store answers, single-use complete, grant PocketStubs+
//
// On completion the user is granted a PocketStubs+ promotional entitlement via the
// RevenueCat REST v1 API (app_user_id = the user's Supabase uuid — the same value
// premium-context.tsx passes to Purchases.configure({ appUserID })). If the
// RevenueCat key is missing at runtime the form STILL succeeds and records
// grant_error='missing_api_key' so the grant can be replayed later — a completed
// questionnaire must never be lost to a missing secret.
//
// Every stage is tracked: PostHog server-side capture (outreach_link_clicked /
// outreach_form_completed / outreach_grant_issued, distinct_id = user uuid) and a
// Discord ping to the metrics channel on completion.
//
// Env deps:
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (always present in the Edge runtime)
//   - REVENUECAT_SECRET_API_KEY                 (grant; if absent → recorded, replayable)
//   - EXPO_PUBLIC_POSTHOG_API_KEY               (analytics capture; best-effort)
//   - EXPO_PUBLIC_POSTHOG_HOST                  (optional, default https://us.i.posthog.com)
//   - DISCORD_METRICS_WEBHOOK_URL               (completion ping; best-effort)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";
import { enforceIpRateLimit } from "../_shared/rate-limit.ts";
import {
  computeGrantExpiry,
  deriveFirstName,
  isValidToken,
  mapGrantDuration,
  maskEmail,
  QUESTIONS_VERSION,
  validateSubmission,
  isValidationError,
} from "./logic.ts";

const RC_ENTITLEMENT = "plus"; // matches customerInfo.entitlements.active['plus']

interface OutreachInvite {
  id: string;
  user_id: string;
  email: string;
  campaign: string;
  tier: number;
  grant_months: number;
  clicked_at: string | null;
  completed_at: string | null;
}

function json(
  payload: unknown,
  status: number,
  cors: Record<string, string>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  // IP rate limit — this is a public (verify_jwt=false), token-guessing-adjacent
  // endpoint. A tight cap makes brute-forcing the 122-bit token space hopeless
  // while leaving plenty of headroom for a real invitee reloading the page.
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const rateLimited = await enforceIpRateLimit(
    clientIp,
    "outreach_form",
    30,
    60,
    req,
  );
  if (rateLimited) return rateLimited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const action = body.action;
  const token = body.token;

  // Generic response for any bad/unknown token — never distinguish malformed vs
  // unknown, so the endpoint reveals nothing about which tokens exist.
  if (!isValidToken(token)) {
    return json({ error: "not_found" }, 404, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: invite, error: fetchError } = await supabase
    .from("outreach_invites")
    .select(
      "id, user_id, email, campaign, tier, grant_months, clicked_at, completed_at",
    )
    .eq("token", token)
    .maybeSingle<OutreachInvite>();

  if (fetchError) {
    console.error("[outreach-form] invite fetch failed:", fetchError.message);
    return json({ error: "server_error" }, 500, cors);
  }
  if (!invite) {
    return json({ error: "not_found" }, 404, cors);
  }

  if (action === "load") {
    return handleLoad(req, supabase, invite, cors);
  }
  if (action === "submit") {
    return handleSubmit(req, supabase, invite, body, cors);
  }
  return json({ error: "invalid_action" }, 400, cors);
});

async function handleLoad(
  req: Request,
  supabase: SupabaseClient,
  invite: OutreachInvite,
  cors: Record<string, string>,
): Promise<Response> {
  const firstClick = invite.clicked_at === null;
  if (firstClick) {
    const { error } = await supabase
      .from("outreach_invites")
      .update({ clicked_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (error) {
      // Non-fatal: still render the form; the click just isn't stamped.
      console.error("[outreach-form] clicked_at update failed:", error.message);
    } else {
      await capturePostHog("outreach_link_clicked", invite);
    }
  }

  return json({
    ok: true,
    firstName: deriveFirstName(invite.email),
    questions_version: QUESTIONS_VERSION,
    completed: invite.completed_at !== null,
  }, 200, cors);
}

async function handleSubmit(
  req: Request,
  supabase: SupabaseClient,
  invite: OutreachInvite,
  body: Record<string, unknown>,
  cors: Record<string, string>,
): Promise<Response> {
  const validated = validateSubmission(body);
  if (isValidationError(validated)) {
    return json({ error: validated.error }, 400, cors);
  }

  // Atomic single-use claim: only the request that flips completed_at from NULL
  // wins. `.is('completed_at', null)` makes the UPDATE a no-op for an already
  // completed invite, so a double-submit (or a concurrent race) returns 0 rows.
  const { data: claimed, error: claimError } = await supabase
    .from("outreach_invites")
    .update({
      completed_at: new Date().toISOString(),
      answers: validated.answers,
      followup_ok: validated.followupOk,
    })
    .eq("id", invite.id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[outreach-form] claim update failed:", claimError.message);
    return json({ error: "server_error" }, 500, cors);
  }
  if (!claimed) {
    return json({ error: "already_completed" }, 409, cors);
  }

  await capturePostHog("outreach_form_completed", invite);

  // Grant PocketStubs+. Never let a grant failure fail the form — the answers
  // are already banked and the grant is replayable from the row.
  const grant = await grantPromotional(supabase, invite);

  if (grant.granted) {
    await capturePostHog("outreach_grant_issued", invite, {
      grant_months: invite.grant_months,
      grant_expires_at: grant.expiresAt,
    });
  }

  await notifyDiscord(invite, grant);

  return json({
    ok: true,
    granted: grant.granted,
    grant_expires_at: grant.expiresAt ?? null,
    grant_months: invite.grant_months,
  }, 200, cors);
}

interface GrantResult {
  granted: boolean;
  expiresAt: string | null;
  error: string | null;
}

/**
 * Grant a RevenueCat promotional entitlement and record the outcome on the row.
 * Fail-soft: any error (missing key, RC non-2xx, exception) is recorded in
 * grant_error and returned as granted=false — the caller already committed the
 * completion, so the grant can be replayed later against this row.
 */
async function grantPromotional(
  supabase: SupabaseClient,
  invite: OutreachInvite,
): Promise<GrantResult> {
  const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!apiKey) {
    await recordGrantError(supabase, invite.id, "missing_api_key");
    return { granted: false, expiresAt: null, error: "missing_api_key" };
  }

  let duration: string;
  try {
    duration = mapGrantDuration(invite.grant_months);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordGrantError(supabase, invite.id, msg);
    return { granted: false, expiresAt: null, error: msg };
  }

  const startedAt = new Date();
  const expiresAt = computeGrantExpiry(startedAt, invite.grant_months);

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${
        encodeURIComponent(invite.user_id)
      }/entitlements/${RC_ENTITLEMENT}/promotional`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ duration }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const msg = `revenuecat ${res.status}: ${detail}`;
      await recordGrantError(supabase, invite.id, msg);
      return { granted: false, expiresAt: null, error: msg };
    }

    const { error } = await supabase
      .from("outreach_invites")
      .update({
        grant_started_at: startedAt.toISOString(),
        grant_expires_at: expiresAt.toISOString(),
        grant_error: null,
      })
      .eq("id", invite.id);
    if (error) {
      console.error("[outreach-form] grant success update failed:", error.message);
      // Distinguish "RC granted but we failed to record it" from "never
      // granted" so a replay pass doesn't look identical to an unissued grant
      // (cold-review P2). Replay is harmless anyway — verified 2026-07-20:
      // re-POSTing the same promotional duration while active does NOT stack
      // or extend the expiry — but the marker keeps the ledger honest.
      await recordGrantError(
        supabase,
        invite.id,
        `granted_but_unrecorded:${expiresAt.toISOString()}`
      );
    }

    return { granted: true, expiresAt: expiresAt.toISOString(), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordGrantError(supabase, invite.id, `exception: ${msg}`);
    return { granted: false, expiresAt: null, error: msg };
  }
}

async function recordGrantError(
  supabase: SupabaseClient,
  id: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("outreach_invites")
    .update({ grant_error: message.slice(0, 500) })
    .eq("id", id);
  if (error) {
    console.error("[outreach-form] grant_error update failed:", error.message);
  }
}

/**
 * Server-side PostHog capture. Best-effort — analytics must never fail a grant.
 * distinct_id = the user's Supabase uuid so events stitch to the in-app person.
 */
async function capturePostHog(
  event: string,
  invite: OutreachInvite,
  extraProps: Record<string, unknown> = {},
): Promise<void> {
  const apiKey = Deno.env.get("EXPO_PUBLIC_POSTHOG_API_KEY");
  if (!apiKey) return;
  const host = Deno.env.get("EXPO_PUBLIC_POSTHOG_HOST") ||
    "https://us.i.posthog.com";
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: invite.user_id,
        properties: {
          campaign: invite.campaign,
          tier: invite.tier,
          $lib: "outreach-form-edge",
          ...extraProps,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (e) {
    console.error(
      "[outreach-form] posthog capture failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Ping the metrics Discord channel on completion. Best-effort; masks the email.
 * Reuses DISCORD_METRICS_WEBHOOK_URL (same channel post-daily-metrics writes to).
 */
async function notifyDiscord(
  invite: OutreachInvite,
  grant: GrantResult,
): Promise<void> {
  const url = Deno.env.get("DISCORD_METRICS_WEBHOOK_URL");
  if (!url) return;
  const grantLine = grant.granted && grant.expiresAt
    ? `grant issued through ${grant.expiresAt.slice(0, 10)}`
    : `grant deferred (${grant.error ?? "unknown"}) — replayable`;
  const content =
    `🎙️ Outreach completed: ${maskEmail(invite.email)} (tier ${invite.tier}) — ${grantLine}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (e) {
    console.error(
      "[outreach-form] discord notify failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
