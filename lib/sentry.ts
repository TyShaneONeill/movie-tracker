/**
 * Sentry Error Tracking Configuration
 *
 * Initialize Sentry for error tracking and performance monitoring.
 * DSN should be set via EXPO_PUBLIC_SENTRY_DSN environment variable.
 */

import * as Sentry from '@sentry/react-native';
import { getCrashReportsEnabled } from './privacy-preferences';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * True when an event is a benign aborted in-flight request. These appear when the
 * page navigates/re-renders and cancels Supabase fetches (e.g. right after signup) —
 * no user impact, just noise. Covers all observed shapes: a raw DOMException, an Error
 * named AbortError, and a serialized Supabase error wrapper whose details/message
 * carries the abort text. See the vault Sentry triage (2026-05-30).
 */
function isAbortError(err: unknown, event: Sentry.Event): boolean {
  const e = err as
    | { name?: string; code?: number; message?: string; details?: string }
    | null
    | undefined;
  if (e?.name === 'AbortError' || e?.code === 20) return true;
  const haystack = [
    e?.message,
    e?.details,
    (event?.extra?.__serialized__ as { message?: string } | undefined)?.message,
    event?.exception?.values?.[0]?.value,
  ]
    .filter(Boolean)
    .join(' ');
  return /signal is aborted|aborted without reason|AbortError/i.test(haystack);
}

/** Shared Sentry noise filter used by every init path. Returns true to drop the event. */
function shouldDropEvent(event: Sentry.Event, hint?: { originalException?: unknown }): boolean {
  // Expected offline/network errors.
  if (event.exception?.values?.[0]?.value?.includes('Network request failed')) {
    return true;
  }
  // Benign aborted in-flight fetches (navigation cancels requests).
  if (isAbortError(hint?.originalException, event)) {
    return true;
  }
  return false;
}

export function initSentry() {
  if (!SENTRY_DSN) {
    if (__DEV__) {
      console.log('[Sentry] No DSN configured, skipping initialization');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',

    // Capture 100% of errors
    sampleRate: 1.0,

    // Capture 20% of transactions for performance monitoring
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,

    // Enable automatic session tracking
    enableAutoSessionTracking: true,

    // Attach stack traces to all messages
    attachStacktrace: true,

    // Don't send events in development
    enabled: !__DEV__,

    // Drop benign noise (offline network errors, aborted in-flight fetches).
    beforeSend(event, hint) {
      return shouldDropEvent(event, hint) ? null : event;
    },
  });

  // Apply the user's previous opt-out choice. We read AsyncStorage async, so
  // there's a tiny window at boot where Sentry is briefly enabled before being
  // closed — that's acceptable per spec (Sentry.close() flushes in-flight
  // events but stops new ones).
  getCrashReportsEnabled()
    .then((enabled) => {
      if (!enabled) {
        applyCrashReportsEnabled(false);
      }
    })
    .catch(() => {
      // Default-on behavior: do nothing.
    });
}

/**
 * Toggle Sentry event submission at runtime.
 *
 * Sentry RN does not expose a public `setEnabled()` API, so we close the
 * client to stop new submissions (which also flushes pending events) and
 * re-init when the user opts back in. This is the least-invasive approach.
 */
export function applyCrashReportsEnabled(enabled: boolean) {
  if (!SENTRY_DSN) return;

  const client = Sentry.getClient();

  if (!enabled) {
    // close() returns a promise that resolves when the queue is drained.
    // We don't await it — fire-and-forget is fine here.
    client?.close();
    return;
  }

  // Re-enable by re-initializing. Sentry.init() is idempotent; calling it
  // again replaces the client.
  if (!client || !client.getOptions().enabled) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      sampleRate: 1.0,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
      enabled: !__DEV__,
      beforeSend(event, hint) {
        return shouldDropEvent(event, hint) ? null : event;
      },
    });
  }
}

/**
 * Set the authenticated user context for Sentry
 * Only sends user ID, no PII (email, name, etc.)
 */
export function setSentryUser(userId: string | null) {
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Capture an exception with optional context
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture a message with optional context
 */
export function captureMessage(message: string, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureMessage(message);
    });
  } else {
    Sentry.captureMessage(message);
  }
}

// Re-export Sentry for direct access when needed
export { Sentry };
