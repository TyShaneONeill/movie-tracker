import {
  type RevenueCatEvent,
  FAILURE_STATUS,
  STATUS_MAP,
  mapEventTypeToStatus,
  isValidUuid,
  collectUserIdCandidates,
  pickResolvedUserId,
  buildSubscriptionUpsert,
} from '../../supabase/functions/validate-subscription/logic';

const USER_UUID = '01234567-89ab-4cde-8f01-23456789abcd';
const OTHER_UUID = 'fedcba98-7654-4321-8fed-cba987654321';
const RC_ANON = '$RCAnonymousID:8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d';
const NOW = '2026-08-04T12:00:00.000Z';

function makeEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt-uuid-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER_UUID,
    product_id: 'ps_plus_annual',
    entitlement_ids: ['plus'],
    expiration_at_ms: 1780531200000, // 2026-06-04T08:00:00.000Z
    purchased_at_ms: 1749000000000,
    store: 'APP_STORE',
    transaction_id: 'txn-123',
    environment: 'PRODUCTION',
    is_trial_period: false,
    ...overrides,
  };
}

describe('FAILURE_STATUS matrix', () => {
  it('pins the entire reason → HTTP status decision table', () => {
    // RevenueCat retries ANY non-2xx; codes only exist to make logs and the
    // RC delivery dashboard self-explanatory. Changing any of these changes
    // whether RC redelivers a revenue event — do it deliberately.
    expect(FAILURE_STATUS).toEqual({
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
    });
  });

  it('only acknowledged-skip is 2xx — every other reason triggers an RC retry', () => {
    for (const [reason, status] of Object.entries(FAILURE_STATUS)) {
      if (reason === 'unhandled_event_type') {
        expect(status).toBe(200);
      } else {
        expect(status).toBeGreaterThanOrEqual(400);
      }
    }
  });
});

describe('mapEventTypeToStatus', () => {
  it('maps every handled RevenueCat event type', () => {
    expect(mapEventTypeToStatus('INITIAL_PURCHASE')).toBe('active');
    expect(mapEventTypeToStatus('RENEWAL')).toBe('active');
    expect(mapEventTypeToStatus('CANCELLATION')).toBe('canceled');
    expect(mapEventTypeToStatus('UNCANCELLATION')).toBe('active');
    expect(mapEventTypeToStatus('BILLING_ISSUE')).toBe('billing_retry');
    expect(mapEventTypeToStatus('EXPIRATION')).toBe('expired');
    expect(mapEventTypeToStatus('PRODUCT_CHANGE')).toBe('active');
    expect(mapEventTypeToStatus('SUBSCRIPTION_PAUSED')).toBe('paused');
  });

  it('returns undefined for unhandled types (handler acks and skips)', () => {
    expect(mapEventTypeToStatus('TEST')).toBeUndefined();
    expect(mapEventTypeToStatus('TRANSFER')).toBeUndefined();
    expect(mapEventTypeToStatus('')).toBeUndefined();
  });

  it('stays in sync with STATUS_MAP', () => {
    for (const [type, status] of Object.entries(STATUS_MAP)) {
      expect(mapEventTypeToStatus(type)).toBe(status);
    }
  });
});

describe('isValidUuid', () => {
  it('accepts canonical uuids in either case', () => {
    expect(isValidUuid(USER_UUID)).toBe(true);
    expect(isValidUuid(USER_UUID.toUpperCase())).toBe(true);
  });

  it('rejects RC anonymous ids, non-strings, and near-uuids', () => {
    expect(isValidUuid(RC_ANON)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(42)).toBe(false);
    expect(isValidUuid('01234567-89ab-4cde-8f01-23456789abc')).toBe(false); // short
    expect(isValidUuid(`x${USER_UUID.slice(1)}`)).toBe(false);
  });
});

describe('collectUserIdCandidates', () => {
  it('returns the app_user_id when it is already a uuid (identified purchase)', () => {
    expect(collectUserIdCandidates(makeEvent())).toEqual([USER_UUID]);
  });

  it('recovers the uuid from aliases when app_user_id is anonymous — the #787 window', () => {
    const event = makeEvent({
      app_user_id: RC_ANON,
      original_app_user_id: RC_ANON,
      aliases: [RC_ANON, USER_UUID],
    });
    expect(collectUserIdCandidates(event)).toEqual([USER_UUID]);
  });

  it('orders candidates app_user_id → original_app_user_id → aliases and dedupes case-insensitively', () => {
    const event = makeEvent({
      app_user_id: USER_UUID,
      original_app_user_id: OTHER_UUID,
      aliases: [USER_UUID.toUpperCase(), OTHER_UUID, RC_ANON],
    });
    expect(collectUserIdCandidates(event)).toEqual([USER_UUID, OTHER_UUID]);
  });

  it('returns empty when nothing uuid-shaped is present', () => {
    const event = makeEvent({ app_user_id: RC_ANON, aliases: [RC_ANON] });
    expect(collectUserIdCandidates(event)).toEqual([]);
  });

  it('tolerates a missing or malformed aliases field', () => {
    expect(collectUserIdCandidates({ app_user_id: USER_UUID })).toEqual([USER_UUID]);
    expect(
      collectUserIdCandidates({ app_user_id: USER_UUID, aliases: 'not-an-array' }),
    ).toEqual([USER_UUID]);
  });
});

describe('pickResolvedUserId', () => {
  it('picks the highest-priority candidate that exists in the DB', () => {
    expect(pickResolvedUserId([USER_UUID, OTHER_UUID], [OTHER_UUID, USER_UUID])).toBe(USER_UUID);
    expect(pickResolvedUserId([USER_UUID, OTHER_UUID], [OTHER_UUID])).toBe(OTHER_UUID);
  });

  it('matches existing ids case-insensitively', () => {
    expect(pickResolvedUserId([USER_UUID], [USER_UUID.toUpperCase()])).toBe(USER_UUID);
  });

  it('returns null when no candidate exists — handler must return non-2xx so RC retries', () => {
    expect(pickResolvedUserId([USER_UUID], [])).toBeNull();
    expect(pickResolvedUserId([], [USER_UUID])).toBeNull();
  });
});

describe('buildSubscriptionUpsert', () => {
  it('builds the full row for an identified INITIAL_PURCHASE', () => {
    const event = makeEvent();
    const row = buildSubscriptionUpsert(event, USER_UUID, 'active', NOW);
    expect(row).toEqual({
      user_id: USER_UUID,
      revenuecat_customer_id: USER_UUID,
      entitlement_id: 'plus',
      product_id: 'ps_plus_annual',
      store: 'app_store',
      store_transaction_id: 'txn-123',
      status: 'active',
      expires_at: new Date(1780531200000).toISOString(),
      is_trial: false,
      environment: 'production',
      raw_event: event,
      updated_at: NOW,
    });
  });

  it('writes the resolved uuid as user_id but keeps the raw RC id as revenuecat_customer_id', () => {
    const event = makeEvent({ app_user_id: RC_ANON, aliases: [RC_ANON, USER_UUID] });
    const row = buildSubscriptionUpsert(event, USER_UUID, 'active', NOW);
    expect(row.user_id).toBe(USER_UUID);
    expect(row.revenuecat_customer_id).toBe(RC_ANON);
  });

  it('falls back to the RC event id when transaction_id is missing, so retries stay idempotent', () => {
    const event = makeEvent({ transaction_id: '' });
    expect(buildSubscriptionUpsert(event, USER_UUID, 'active', NOW).store_transaction_id).toBe('evt-uuid-1');
  });

  it('is null only when both transaction_id and event id are missing', () => {
    const event = makeEvent({ transaction_id: '', id: undefined });
    expect(buildSubscriptionUpsert(event, USER_UUID, 'active', NOW).store_transaction_id).toBeNull();
  });

  it('produces an identical row when the same event is redelivered (retry idempotency)', () => {
    const event = makeEvent();
    const first = buildSubscriptionUpsert(event, USER_UUID, 'active', NOW);
    const retry = buildSubscriptionUpsert(makeEvent(), USER_UUID, 'active', NOW);
    expect(retry).toEqual(first);
  });

  it('sets canceled_at on CANCELLATION and clears it on UNCANCELLATION', () => {
    const canceled = buildSubscriptionUpsert(
      makeEvent({ type: 'CANCELLATION' }), USER_UUID, 'canceled', NOW,
    );
    expect(canceled.canceled_at).toBe(NOW);

    const uncanceled = buildSubscriptionUpsert(
      makeEvent({ type: 'UNCANCELLATION' }), USER_UUID, 'active', NOW,
    );
    expect(uncanceled.canceled_at).toBeNull();
  });

  it('tracks trial dates only on an INITIAL_PURCHASE trial', () => {
    const trial = buildSubscriptionUpsert(
      makeEvent({ is_trial_period: true }), USER_UUID, 'active', NOW,
    );
    expect(trial.is_trial).toBe(true);
    expect(trial.trial_start_at).toBe(NOW);
    expect(trial.trial_end_at).toBe(new Date(1780531200000).toISOString());

    const renewal = buildSubscriptionUpsert(
      makeEvent({ is_trial_period: true, type: 'RENEWAL' }), USER_UUID, 'active', NOW,
    );
    expect(renewal.trial_start_at).toBeUndefined();
    expect(renewal.trial_end_at).toBeUndefined();
  });

  it('nulls expires_at when expiration_at_ms is absent and applies store/env defaults', () => {
    const event = makeEvent({ expiration_at_ms: 0, store: '', environment: '' });
    const row = buildSubscriptionUpsert(event, USER_UUID, 'active', NOW);
    expect(row.expires_at).toBeNull();
    expect(row.store).toBe('stripe');
    expect(row.environment).toBe('production');
  });
});
