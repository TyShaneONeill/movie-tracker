/**
 * Error-event capture for edge functions via direct envelope POST.
 *
 * Same transport rationale as sentry-feedback.ts: `npm:@sentry/deno`
 * captureException() silently no-ops in Supabase Edge Runtime (transport
 * layer incompatibility — synthesized event IDs, nothing leaves the worker).
 * Direct envelope POST to /api/{project_id}/envelope/ is the SDK-agnostic
 * protocol and works deterministically.
 *
 * Never throws — an observability failure must not change handler behavior.
 * Only needs SENTRY_DSN.
 */

const SENTRY_DSN = Deno.env.get('SENTRY_DSN');

interface CaptureOptions {
  /** Logical source, e.g. 'validate-subscription'. Becomes tags.function. */
  functionName: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: 'error' | 'warning' | 'fatal';
}

/**
 * Send an error event to Sentry. Returns the event_id on success, null on
 * any failure (missing DSN, network error, non-2xx from Sentry).
 */
export async function captureEdgeException(
  error: unknown,
  options: CaptureOptions,
): Promise<string | null> {
  try {
    if (!SENTRY_DSN) {
      console.warn('[sentry-capture] SENTRY_DSN not configured — event dropped');
      return null;
    }

    const dsn = new URL(SENTRY_DSN.trim());
    const projectId = dsn.pathname.replace(/^\/+|\/+$/g, '').trim();
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const sentAt = new Date().toISOString();

    const err = error instanceof Error ? error : new Error(String(error));
    const eventPayload = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: options.level ?? 'error',
      environment: 'production',
      tags: { function: options.functionName, ...options.tags },
      // Sentry's structured stacktrace needs parsed frames; a raw string in
      // extra is enough for edge-fn triage and can't be rejected as malformed.
      extra: { ...options.extra, ...(err.stack ? { stack: err.stack } : {}) },
      exception: {
        values: [{ type: err.name || 'Error', value: err.message }],
      },
    };

    const enc = new TextEncoder();
    const payloadBytes = enc.encode(JSON.stringify(eventPayload));
    const envelope = new Uint8Array([
      ...enc.encode(JSON.stringify({ event_id: eventId, sent_at: sentAt }) + '\n'),
      ...enc.encode(
        JSON.stringify({
          type: 'event',
          content_type: 'application/json',
          length: payloadBytes.length,
        }) + '\n',
      ),
      ...payloadBytes,
      ...enc.encode('\n'),
    ]);

    // Auth in the query string — Sentry's edge LB routes envelope traffic by
    // `sentry_key=` in the URL; header-only auth 404s (see sentry-feedback.ts).
    const ingestUrl =
      `${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/` +
      `?sentry_key=${dsn.username}&sentry_version=7`;

    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[sentry-capture] envelope failed status=${res.status} body=${text.slice(0, 200)}`,
      );
      return null;
    }
    return eventId;
  } catch (captureError) {
    console.error('[sentry-capture] capture threw:', captureError);
    return null;
  }
}
