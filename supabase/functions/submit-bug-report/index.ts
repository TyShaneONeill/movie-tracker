// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { validateBugReportPayload } from '../_shared/bug-report-validate.ts';
import {
  sanitizeTitle,
  sanitizeDescription,
  scrubPII,
} from '../_shared/bug-report-sanitize.ts';
import { submitSentryFeedback } from '../_shared/sentry-feedback.ts';
import { postInitialBugReport } from '../_shared/discord-webhook.ts';

const SENTRY_ORG = Deno.env.get('SENTRY_ORG') ?? '';

function jsonResponse(req: Request, body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

async function authenticate(req: Request): Promise<{ userId: string; email: string | null; tier: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const jwt = authHeader.slice(7);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  // Fetch account tier from profiles (used as a tag in Sentry / Discord footer)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin
    .from('profiles')
    .select('account_tier')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    tier: (profile?.account_tier as string) ?? 'free',
  };
}

Deno.serve(async (req) => {
  const started = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  // 1. Authenticate
  const auth = await authenticate(req);
  if (!auth) {
    return jsonResponse(req, { error: 'unauthenticated' }, 401);
  }

  // 2. Rate limit (two-tier: hourly AND daily)
  const hourly = await enforceRateLimit(auth.userId, 'bug_report_submission', 5, 3600, req);
  if (hourly) return hourly;
  const daily = await enforceRateLimit(auth.userId, 'bug_report_submission_daily', 20, 86400, req);
  if (daily) return daily;

  // 3. Parse + validate
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse(req, { error: 'invalid_json' }, 400);
  }
  const validation = validateBugReportPayload(raw);
  if (!validation.ok) {
    return jsonResponse(
      req,
      { error: 'validation_failed', field: validation.field, reason: validation.reason },
      validation.field === 'screenshot_base64' ? 413 : 400,
    );
  }
  const payload = validation.payload;

  // 4. Sanitize + PII scrub
  const cleanTitle = scrubPII(sanitizeTitle(payload.title));
  const cleanDescription = scrubPII(sanitizeDescription(payload.description));

  // 5. Submit to Sentry — SDK assigns event_id, screenshot rides along as
  //    an attachment in the same envelope.
  let event_id: string;
  try {
    event_id = await submitSentryFeedback({
      user_id: auth.userId,
      email: auth.email,
      name: auth.email ?? 'Anonymous',
      message: cleanDescription,
      screenshotBase64: payload.screenshot_base64 ?? null,
      tags: {
        bug_title: cleanTitle,
        platform: payload.platform,
        app_version: payload.app_version,
        route: payload.route,
        account_tier: auth.tier,
      },
    });
  } catch (err) {
    console.log(JSON.stringify({
      event: 'bug_report_sentry_failed',
      user_id: auth.userId,
      duration_ms: Date.now() - started,
      error: (err as Error).message,
    }));
    return jsonResponse(req, { error: 'submission_failed' }, 500);
  }

  // 6. Best-effort Discord ping
  const sentryUrl = `https://${SENTRY_ORG}.sentry.io/issues/?query=event_id:${event_id}`;
  postInitialBugReport({
    eventId: event_id,
    title: cleanTitle,
    descriptionPreview: cleanDescription.slice(0, 120) + (cleanDescription.length > 120 ? '…' : ''),
    platform: payload.platform,
    appVersion: payload.app_version,
    route: payload.route,
    accountTier: auth.tier,
    sentryUrl,
  });

  // 7. Success
  console.log(JSON.stringify({
    event: 'bug_report_completed',
    user_id: auth.userId,
    event_id,
    duration_ms: Date.now() - started,
  }));
  return jsonResponse(req, { success: true }, 200);
});
