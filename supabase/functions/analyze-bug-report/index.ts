// supabase/functions/analyze-bug-report/index.ts
// deno-lint-ignore-file no-explicit-any
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifySentryWebhookSignature } from '../_shared/webhook-signature.ts';
import { fetchFeedbackEvent, postSentryComment } from '../_shared/sentry-feedback.ts';
import { buildAnalysisContext } from '../_shared/bug-report-context.ts';
import { analyzeBugReport } from '../_shared/claude-client.ts';
import {
  formatSentryComment,
  formatDiscordAnalysis,
} from '../_shared/bug-report-format.ts';
import { postAnalysisThread } from '../_shared/discord-webhook.ts';

const SENTRY_WEBHOOK_SECRET = Deno.env.get('SENTRY_WEBHOOK_SECRET') ?? '';

function fallbackComment(reason: string): string {
  return `**AI Analysis**\n\n⚠️ Unavailable: ${reason}. Please triage manually.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  // 1. Verify signature
  const rawBody = await req.text();
  const sig = req.headers.get('sentry-hook-signature') ?? '';
  const ok = await verifySentryWebhookSignature(rawBody, sig, SENTRY_WEBHOOK_SECRET);
  if (!ok) {
    console.log(JSON.stringify({ event: 'analyze_signature_reject' }));
    return new Response('unauthorized', { status: 401 });
  }

  // 2. Parse body
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('bad_request', { status: 400 });
  }

  // Sentry Feedback webhooks send `data.feedback` containing event_id + issue_id
  const event_id: string | undefined = payload?.data?.feedback?.event_id;
  const issue_id: string | undefined = payload?.data?.issue?.id;
  if (!event_id || !issue_id) {
    console.log(JSON.stringify({ event: 'analyze_malformed_payload' }));
    return new Response('bad_request', { status: 400 });
  }

  // 3. Fetch context
  let feedback: any, relatedErrors: any[];
  try {
    const r = await fetchFeedbackEvent(event_id);
    feedback = r.event;
    relatedErrors = r.relatedErrors;
  } catch (err) {
    console.log(JSON.stringify({
      event: 'analyze_sentry_fetch_failed',
      event_id,
      error: (err as Error).message,
    }));
    try {
      await postSentryComment(issue_id, fallbackComment('could not fetch feedback event'));
    } catch { /* nothing to do */ }
    return new Response('ok', { status: 200 });
  }

  // Extract breadcrumbs + tags
  const breadcrumbs = feedback?.entries
    ?.find((e: any) => e.type === 'breadcrumbs')
    ?.data?.values ?? [];
  const tagsArr: Array<{ key: string; value: string }> = feedback?.tags ?? [];
  const tagMap: Record<string, string> = Object.fromEntries(tagsArr.map(t => [t.key, t.value]));

  // Modern Sentry feedback events expose the user's message at
  // contexts.feedback.message; the title rides along as a tag (bug_title)
  // set at submit time.
  const message: string = feedback?.contexts?.feedback?.message ?? feedback?.message ?? '';
  const description = message || '(no description)';
  const title = tagMap.bug_title ?? '(no title)';

  const context = buildAnalysisContext({
    title,
    description,
    platform: tagMap.platform ?? 'unknown',
    app_version: tagMap.app_version ?? 'unknown',
    route: tagMap.route ?? 'unknown',
    breadcrumbs,
    errorEvents: relatedErrors,
  });

  // 4. Call Claude (one retry on failure)
  let analysis = await analyzeBugReport(context);
  if (!analysis) {
    analysis = await analyzeBugReport(context);
  }

  if (!analysis) {
    try {
      await postSentryComment(issue_id, fallbackComment('LLM unavailable'));
    } catch { /* swallow */ }
    return new Response('ok', { status: 200 });
  }

  // 5. Post Sentry comment
  try {
    await postSentryComment(issue_id, formatSentryComment(analysis));
  } catch (err) {
    console.log(JSON.stringify({
      event: 'analyze_sentry_comment_failed',
      event_id,
      error: (err as Error).message,
    }));
  }

  // 6. Post Discord analysis message
  // The original Discord message id isn't round-tripped through Sentry —
  // instead, the Discord follow-up references the Sentry event_id so a
  // human can correlate.
  postAnalysisThread(event_id, tagMap.route ?? 'report', formatDiscordAnalysis(analysis));

  console.log(JSON.stringify({
    event: 'analyze_completed',
    event_id,
    severity: analysis.severity,
    category: analysis.category,
    confidence: analysis.confidence,
  }));

  return new Response('ok', { status: 200 });
});
