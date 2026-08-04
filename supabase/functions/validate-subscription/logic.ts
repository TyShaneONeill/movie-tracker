// Pure, dependency-free logic for the validate-subscription webhook.
//
// Kept free of Deno / jsr imports so it can be unit-tested from Jest
// (see __tests__/edge-functions/validate-subscription-logic.test.ts), same
// pattern as outreach-form/logic.ts. index.ts imports from here for the
// side-effectful I/O paths (DB upsert, sync_profile_tier RPC, Sentry).

// ============================================================================
// Types
// ============================================================================

/**
 * The slice of a RevenueCat webhook event we consume. RC sends more fields;
 * the full payload is preserved in subscriptions.raw_event.
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export interface RevenueCatEvent {
  id?: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  /** All app user ids RC knows for this subscriber (anonymous + identified). */
  aliases?: string[];
  product_id: string;
  entitlement_ids: string[];
  expiration_at_ms: number;
  purchased_at_ms: number;
  store: string;
  transaction_id: string;
  environment: string;
  is_trial_period: boolean;
}

export interface SubscriptionUpsert {
  user_id: string;
  revenuecat_customer_id: string;
  entitlement_id: string;
  product_id: string;
  store: string;
  store_transaction_id: string | null;
  status: string;
  expires_at: string | null;
  is_trial: boolean;
  environment: string;
  raw_event: RevenueCatEvent;
  updated_at: string;
  canceled_at?: string | null;
  trial_start_at?: string;
  trial_end_at?: string | null;
}

// ============================================================================
// Response-status matrix
// ============================================================================

/**
 * The webhook's complete reason → HTTP status matrix, in one place so a
 * single table-driven test pins it. RevenueCat retries ANY non-2xx the same
 * way — the different codes exist purely to make logs/RC dashboard entries
 * self-explanatory, not to steer retry behavior.
 *
 * `unhandled_event_type` is not a failure (200 = acknowledged skip) but
 * lives here so the full decision table is covered by the same test.
 */
export const FAILURE_STATUS = {
  webhook_secret_not_configured: 500,
  unauthorized: 401,
  missing_event_payload: 400,
  missing_required_fields: 400,
  unhandled_event_type: 200,
  user_lookup_failed: 500,
  unresolvable_app_user_id: 503,
  subscription_upsert_failed: 500,
  profile_tier_sync_failed: 500,
  unhandled_error: 500,
} as const;

export type FailureReason = keyof typeof FAILURE_STATUS;

// ============================================================================
// Status mapping
// ============================================================================

/** Map RevenueCat event types to subscription status values */
export const STATUS_MAP: Record<string, string> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  CANCELLATION: 'canceled',
  UNCANCELLATION: 'active',
  BILLING_ISSUE: 'billing_retry',
  EXPIRATION: 'expired',
  PRODUCT_CHANGE: 'active',
  SUBSCRIPTION_PAUSED: 'paused',
};

export function mapEventTypeToStatus(type: string): string | undefined {
  return STATUS_MAP[type];
}

// ============================================================================
// User-id resolution
// ============================================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Ordered, deduped list of uuid-shaped user-id candidates from an RC event.
 *
 * subscriptions.user_id is `uuid REFERENCES auth.users(id)`, but RC's
 * app_user_id is only a uuid when the purchase happened AFTER
 * Purchases.configure({ appUserID }) ran. A purchase that races identify
 * arrives as `$RCAnonymousID:...` — inserting that raw is the #787 500.
 * The real uuid is usually still present in `aliases` (RC merges ids on
 * identify), so we consider, in priority order:
 *   app_user_id → original_app_user_id → aliases[] (RC's order)
 * keeping only well-formed uuids. `$RCAnonymousID:...` never matches UUID_RE.
 */
export function collectUserIdCandidates(event: {
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: unknown;
}): string[] {
  const raw: unknown[] = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (!isValidUuid(value)) continue;
    const lower = value.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(value);
  }
  return out;
}

/**
 * Pick the winning user id: the highest-priority candidate that actually
 * exists in the DB (existingIds = profile ids found for the candidates).
 * Returns null when none exist — the event is unresolvable right now and the
 * handler must return non-2xx so RevenueCat retries instead of dropping it.
 */
export function pickResolvedUserId(
  candidates: string[],
  existingIds: string[],
): string | null {
  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  for (const candidate of candidates) {
    if (existing.has(candidate.toLowerCase())) return candidate;
  }
  return null;
}

// ============================================================================
// Upsert payload
// ============================================================================

/**
 * Build the subscriptions upsert row. Pure — caller supplies the resolved
 * user id, the mapped status, and the current time (determinism for tests).
 *
 * Idempotency: the table's unique key is (user_id, product_id,
 * store_transaction_id). Postgres treats NULLs as distinct there, so a null
 * store_transaction_id would insert a NEW row on every RC retry instead of
 * converging — we fall back to the RC event id so redelivery of the same
 * event always lands on the same row.
 */
export function buildSubscriptionUpsert(
  event: RevenueCatEvent,
  resolvedUserId: string,
  status: string,
  nowIso: string,
): SubscriptionUpsert {
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  const upsert: SubscriptionUpsert = {
    user_id: resolvedUserId,
    // Keep RC's id verbatim (even when anonymous) — it's the join key back
    // to the RC dashboard, not an auth uuid.
    revenuecat_customer_id: event.app_user_id,
    entitlement_id: 'plus', // v1: always plus
    product_id: event.product_id || 'unknown',
    store: (event.store || 'STRIPE').toLowerCase(),
    store_transaction_id: event.transaction_id || event.id || null,
    status,
    expires_at: expiresAt,
    is_trial: event.is_trial_period || false,
    environment: (event.environment || 'PRODUCTION').toLowerCase(),
    raw_event: event,
    updated_at: nowIso,
  };

  // Set canceled_at on cancellation, clear on uncancellation
  if (event.type === 'CANCELLATION') {
    upsert.canceled_at = nowIso;
  }
  if (event.type === 'UNCANCELLATION') {
    upsert.canceled_at = null;
  }

  // Track trial dates on initial trial purchase
  if (event.is_trial_period && event.type === 'INITIAL_PURCHASE') {
    upsert.trial_start_at = nowIso;
    upsert.trial_end_at = expiresAt;
  }

  return upsert;
}
