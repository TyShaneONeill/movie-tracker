/**
 * Sentry client for user feedback + issue comments + related-error lookup.
 *
 * Uses the modern Sentry SDK (`Sentry.captureFeedback`) for ingestion — the
 * legacy /user-feedback/ REST endpoint is deprecated. REST is still used for
 * read-side queries (event GET, related-error issue search, comment POST).
 *
 * Env deps:
 *   - SENTRY_DSN          ingestion (SDK)
 *   - SENTRY_AUTH_TOKEN   REST reads + comment POST
 *   - SENTRY_ORG          slug, used in REST URLs and web links
 *   - SENTRY_PROJECT      slug, used in project-scoped REST URLs
 *   - SENTRY_PROJECT_ID   numeric, required by org-scoped /issues/ search
 */

import * as Sentry from 'npm:@sentry/deno';

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

let sentryInited = false;
function ensureSentryInit(): void {
  if (sentryInited) return;
  if (!SENTRY_DSN) throw new Error('sentry_dsn_not_configured');
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0,
    defaultIntegrations: false,
  });
  sentryInited = true;
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
 * Submit user feedback via the Sentry SDK. Returns the assigned event_id.
 * Tags travel in-band on the scope; screenshot (if any) is attached as an
 * envelope item alongside the feedback so there is no eventual-consistency
 * race with a follow-up REST call.
 */
export async function submitSentryFeedback(args: SubmitFeedbackArgs): Promise<string> {
  ensureSentryInit();

  return await Sentry.withScope(async (scope) => {
    scope.setUser({
      id: args.user_id,
      email: args.email ?? undefined,
      username: args.name,
    });
    scope.setTags(args.tags);

    const hint: Record<string, unknown> = {};
    if (args.screenshotBase64) {
      const bytes = Uint8Array.from(atob(args.screenshotBase64), (c) => c.charCodeAt(0));
      hint.attachments = [
        { data: bytes, filename: 'screenshot.png', contentType: 'image/png' },
      ];
    }

    const eventId = Sentry.captureFeedback(
      {
        name: args.name,
        email: args.email ?? undefined,
        message: args.message,
      },
      hint,
    );

    const flushed = await Sentry.flush(2000);
    if (!eventId) throw new Error('sentry_feedback_no_event_id');
    if (!flushed) {
      console.log(JSON.stringify({ event: 'sentry_feedback_flush_timeout', event_id: eventId }));
    }
    return eventId;
  });
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
