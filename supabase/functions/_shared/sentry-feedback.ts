/**
 * Thin Sentry API client for user feedback + issue comments.
 * Env deps: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT.
 * Docs: https://docs.sentry.io/api/projects/#post-user-feedback
 */

const SENTRY_AUTH_TOKEN = Deno.env.get('SENTRY_AUTH_TOKEN');
const SENTRY_ORG = Deno.env.get('SENTRY_ORG');         // e.g. 'pocketstubs-5w'
const SENTRY_PROJECT = Deno.env.get('SENTRY_PROJECT');

if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
  console.warn('[sentry-feedback] missing env: one of SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT');
}

const BASE = `https://sentry.io/api/0`;
const USER_FEEDBACK_URL = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/user-feedback/`;

export interface SubmitFeedbackArgs {
  event_id: string;          // caller-generated UUID (no dashes — Sentry convention)
  user_id: string;
  email: string | null;      // Sentry user-feedback wants this; okay to be null
  name: string;              // display name or 'User' fallback
  comments: string;          // title + description combined
  tags: Record<string, string>;
}

/**
 * Call Sentry's user-feedback endpoint. Returns the event_id on success.
 * Throws on network failure or non-2xx.
 */
export async function submitSentryFeedback(args: SubmitFeedbackArgs): Promise<string> {
  const res = await fetch(USER_FEEDBACK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_id: args.event_id,
      name: args.name,
      email: args.email ?? 'unknown@pocketstubs.com',
      comments: args.comments,
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sentry_feedback_failed status=${res.status} body=${body.slice(0, 400)}`);
  }

  // Tags must be set via a separate call since user-feedback doesn't accept tags.
  // We store them on the associated issue via the event we reference.
  // See: tagged via issue update below.
  return args.event_id;
}

/**
 * Attach tags to the issue associated with this feedback event.
 * Sentry groups feedback into issues; this endpoint tags that issue.
 */
export async function attachFeedbackTags(
  event_id: string,
  tags: Record<string, string>,
): Promise<void> {
  // Tags are scoped to events, and user feedback creates an event of type
  // 'user_report'. We write them via the events endpoint.
  const url = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/${event_id}/`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tags: Object.entries(tags).map(([k, v]) => ({ key: k, value: v })) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    // Non-fatal — log and continue. Feedback is already submitted.
    console.log(JSON.stringify({
      event: 'sentry_tag_attach_failed',
      event_id,
      status: res.status,
    }));
  }
}

/**
 * Upload a screenshot attachment tied to an event.
 * Sentry attachment API uses multipart/form-data.
 */
export async function attachScreenshot(
  event_id: string,
  pngBase64: string,
): Promise<void> {
  const bin = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
  const form = new FormData();
  form.append('file', new Blob([bin], { type: 'image/png' }), 'screenshot.png');
  const url = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/${event_id}/attachments/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.log(JSON.stringify({
      event: 'sentry_screenshot_upload_failed',
      event_id,
      status: res.status,
    }));
  }
}

/**
 * Fetch a feedback event's full details + associated error events.
 * Used by analyze-bug-report to build the LLM prompt context.
 */
export async function fetchFeedbackEvent(event_id: string): Promise<{
  event: Record<string, unknown>;
  relatedErrors: Record<string, unknown>[];
}> {
  const url = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/${event_id}/`;
  const eventRes = await fetch(url, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!eventRes.ok) {
    throw new Error(`sentry_event_fetch_failed status=${eventRes.status}`);
  }
  const event = await eventRes.json();

  // Fetch related errors by user_id + time proximity (last 10 min before feedback)
  const userId = (event as { user?: { id?: string } }).user?.id;
  if (!userId) return { event, relatedErrors: [] };
  const ts = (event as { dateCreated?: string }).dateCreated;
  if (!ts) return { event, relatedErrors: [] };
  const before = new Date(ts);
  const after = new Date(before.getTime() - 10 * 60 * 1000);

  const issuesUrl = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/` +
    `?query=user.id:${encodeURIComponent(userId)}+event.type:error&start=${after.toISOString()}&end=${before.toISOString()}&limit=5`;
  const errRes = await fetch(issuesUrl, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  });
  const relatedErrors = errRes.ok ? await errRes.json() : [];
  return { event, relatedErrors: Array.isArray(relatedErrors) ? relatedErrors : [] };
}

/**
 * Post a markdown comment onto the issue containing this feedback event.
 */
export async function postSentryComment(
  issue_id: string,
  markdown: string,
): Promise<void> {
  const url = `${BASE}/organizations/${SENTRY_ORG}/issues/${issue_id}/comments/`;
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
