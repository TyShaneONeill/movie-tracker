/**
 * Sentry client for user feedback + issue comments + related-error lookup.
 *
 * Ingestion uses a direct envelope POST to Sentry's /api/{project_id}/envelope/
 * endpoint. We tried `npm:@sentry/deno` Sentry.captureFeedback() but it silently
 * no-ops in Supabase Edge Runtime (transport layer incompatibility — captures
 * return synthesized event IDs without ever leaving the worker). Direct
 * envelope POST is the documented SDK-agnostic protocol and works deterministically.
 *
 * REST is still used for read-side queries (event GET, related-error issue
 * search, comment POST).
 *
 * Env deps:
 *   - SENTRY_DSN          ingestion (parsed for host + project_id + public key)
 *   - SENTRY_AUTH_TOKEN   REST reads + comment POST
 *   - SENTRY_ORG          slug, used in REST URLs and web links
 *   - SENTRY_PROJECT      slug, used in project-scoped REST URLs
 *   - SENTRY_PROJECT_ID   numeric, required by org-scoped /issues/ search
 */

const SENTRY_DSN = Deno.env.get('SENTRY_DSN');
const SENTRY_AUTH_TOKEN = Deno.env.get('SENTRY_AUTH_TOKEN');
const SENTRY_ORG = Deno.env.get('SENTRY_ORG');
const SENTRY_PROJECT = Deno.env.get('SENTRY_PROJECT');
const SENTRY_PROJECT_ID = Deno.env.get('SENTRY_PROJECT_ID');

if (!SENTRY_DSN || !SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT || !SENTRY_PROJECT_ID) {
  console.warn(
    '[sentry-feedback] missing env: one of SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_PROJECT_ID',
  );
}

const BASE = `https://sentry.io/api/0`;

interface ParsedDsn {
  publicKey: string;
  host: string;
  scheme: string;
  projectId: string;
}

function parseDsn(dsn: string): ParsedDsn {
  // Trim defensively — copy-pasted secret values often pick up trailing
  // newlines/whitespace which the URL parser preserves in pathname, producing
  // a malformed ingest URL.
  const url = new URL(dsn.trim());
  return {
    publicKey: url.username,
    host: url.host,
    scheme: url.protocol,
    projectId: url.pathname.replace(/^\/+|\/+$/g, '').trim(),
  };
}

function generateEventId(): string {
  // Sentry expects 32-char hex (no dashes).
  return crypto.randomUUID().replace(/-/g, '');
}

export interface SubmitFeedbackArgs {
  user_id: string;
  email: string | null;
  name: string;
  message: string;
  tags: Record<string, string>;
  screenshotBase64?: string | null;
}

/**
 * Submit user feedback as a Sentry envelope. Returns the event_id we assigned.
 *
 * Envelope format (one item per feedback, plus optional attachment item):
 *   <header-line: {event_id, sent_at}>
 *   <item-header: {type:'feedback', content_type:'application/json', length}>
 *   <item-payload: feedback JSON>
 *   [<item-header: {type:'attachment', ...}>
 *    <item-payload: binary bytes>]
 *
 * Spec: https://develop.sentry.dev/sdk/telemetry/feedbacks/
 */
export async function submitSentryFeedback(args: SubmitFeedbackArgs): Promise<string> {
  if (!SENTRY_DSN) throw new Error('sentry_dsn_not_configured');

  const dsn = parseDsn(SENTRY_DSN);
  const eventId = generateEventId();
  const sentAt = new Date().toISOString();
  const enc = new TextEncoder();

  const feedbackPayload = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    environment: 'production',
    user: {
      id: args.user_id,
      email: args.email ?? undefined,
      username: args.name,
    },
    tags: args.tags,
    contexts: {
      feedback: {
        name: args.name,
        contact_email: args.email ?? undefined,
        message: args.message,
        source: 'user_report_envelope',
      },
    },
  };
  const feedbackBytes = enc.encode(JSON.stringify(feedbackPayload));

  const envelopeHeaderLine = JSON.stringify({ event_id: eventId, sent_at: sentAt }) + '\n';
  const feedbackItemHeader = JSON.stringify({
    type: 'feedback',
    content_type: 'application/json',
    length: feedbackBytes.length,
  }) + '\n';

  const parts: Uint8Array[] = [
    enc.encode(envelopeHeaderLine),
    enc.encode(feedbackItemHeader),
    feedbackBytes,
    enc.encode('\n'),
  ];

  if (args.screenshotBase64) {
    const screenshotBytes = Uint8Array.from(
      atob(args.screenshotBase64),
      (c) => c.charCodeAt(0),
    );
    const attachmentItemHeader = JSON.stringify({
      type: 'attachment',
      attachment_type: 'event.attachment',
      content_type: 'image/png',
      filename: 'screenshot.png',
      length: screenshotBytes.length,
    }) + '\n';
    parts.push(enc.encode(attachmentItemHeader), screenshotBytes, enc.encode('\n'));
  }

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }

  // Auth lives in the query string, not just the header — Sentry's edge LB
  // routes envelope traffic by inspecting `sentry_key=` in the URL. Header-only
  // auth gets bounced to a generic 404 before Sentry's relay sees it.
  // Note: keep query values free of unencoded `/` — the LB does crude path
  // matching and treats slashes in query values as path separators (404).
  const ingestUrl =
    `${dsn.scheme}//${dsn.host}/api/${dsn.projectId}/envelope/` +
    `?sentry_key=${dsn.publicKey}&sentry_version=7`;

  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `sentry_envelope_failed status=${res.status} body=${text.slice(0, 400)}`,
    );
  }

  return eventId;
}

/**
 * Look up the most recent event_id for a given issue. Used when Sentry's
 * issue.created webhook arrives without a direct event_id reference.
 */
export async function fetchLatestEventIdForIssue(issue_id: string): Promise<string | undefined> {
  const url = `${BASE}/organizations/${SENTRY_ORG}/issues/${issue_id}/events/?limit=1&sort=-timestamp`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`sentry_issue_events_fetch_failed status=${res.status}`);
  }
  const events = (await res.json()) as Array<{ eventID?: string; id?: string }>;
  if (!Array.isArray(events) || events.length === 0) return undefined;
  // Sentry's issue events endpoint returns `eventID` (camelCase). Some older
  // responses use `id`. Try both.
  return events[0].eventID ?? events[0].id;
}

/**
 * Fetch a feedback event's full details + a small set of related error
 * events from the same user in the 10 minutes prior. Used by
 * analyze-bug-report to build the LLM prompt context.
 */
export async function fetchFeedbackEvent(event_id: string): Promise<{
  event: Record<string, unknown>;
  relatedErrors: Record<string, unknown>[];
}> {
  const eventUrl = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/${event_id}/`;
  const eventRes = await fetch(eventUrl, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!eventRes.ok) {
    throw new Error(`sentry_event_fetch_failed status=${eventRes.status}`);
  }
  const event = (await eventRes.json()) as Record<string, unknown>;

  const userId = (event as { user?: { id?: string } }).user?.id;
  const ts = (event as { dateCreated?: string }).dateCreated;
  if (!userId || !ts) return { event, relatedErrors: [] };

  const before = new Date(ts);
  const after = new Date(before.getTime() - 10 * 60 * 1000);

  // Org-scoped issues search supports Discover-style query=. Project param
  // must be the numeric id, not the slug.
  const issuesUrl =
    `${BASE}/organizations/${SENTRY_ORG}/issues/` +
    `?query=${encodeURIComponent(`user.id:${userId} event.type:error`)}` +
    `&project=${SENTRY_PROJECT_ID}` +
    `&start=${after.toISOString()}` +
    `&end=${before.toISOString()}` +
    `&limit=5`;

  const issuesRes = await fetch(issuesUrl, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!issuesRes.ok) return { event, relatedErrors: [] };
  const issues = (await issuesRes.json()) as Array<{ id?: string }>;
  if (!Array.isArray(issues) || issues.length === 0) return { event, relatedErrors: [] };

  // Resolve each issue to its latest event in parallel.
  const errorEvents = await Promise.all(
    issues
      .map((i) => i.id)
      .filter((id): id is string => typeof id === 'string')
      .map(async (issueId) => {
        const url = `${BASE}/organizations/${SENTRY_ORG}/issues/${issueId}/events/?limit=1&sort=-timestamp`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) return null;
        const arr = (await r.json()) as Record<string, unknown>[];
        return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      }),
  );

  const relatedErrors = errorEvents.filter((e): e is Record<string, unknown> => e !== null);
  return { event, relatedErrors };
}

/**
 * Post a markdown comment onto an issue. Uses the canonical issue-scoped
 * URL — the org-prefixed variant has been removed from current Sentry docs.
 */
export async function postSentryComment(issue_id: string, markdown: string): Promise<void> {
  const url = `${BASE}/issues/${issue_id}/comments/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: markdown }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`sentry_comment_failed status=${res.status}`);
  }
}
