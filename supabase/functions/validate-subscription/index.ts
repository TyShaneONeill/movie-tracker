import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Types
// ============================================================================

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id: string;
  entitlement_ids: string[];
  expiration_at_ms: number;
  purchased_at_ms: number;
  store: string;
  transaction_id: string;
  environment: string;
  is_trial_period: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Map RevenueCat event types to subscription status values */
const STATUS_MAP: Record<string, string> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  CANCELLATION: 'canceled',
  UNCANCELLATION: 'active',
  BILLING_ISSUE: 'billing_retry',
  EXPIRATION: 'expired',
  PRODUCT_CHANGE: 'active',
  SUBSCRIPTION_PAUSED: 'paused',
};

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // 1. Validate webhook secret
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

    if (!expectedSecret) {
      console.error('[validate-subscription] REVENUECAT_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse event
    const body = await req.json();
    const event: RevenueCatEvent = body.event;

    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Missing event payload' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const {
      type,
      app_user_id,
      product_id,
      store,
      transaction_id,
      expiration_at_ms,
      is_trial_period,
      environment,
    } = event;

    // 3. Validate required fields
    if (!app_user_id || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: app_user_id and type' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 4. Check if this is an event type we handle
    const status = STATUS_MAP[type];
    if (!status) {
      // Unhandled event type -- acknowledge receipt but take no action
      console.log(`[validate-subscription] Ignoring unhandled event type: ${type}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, event_type: type }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 5. Create admin client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 6. Build upsert data
    const expiresAt = expiration_at_ms
      ? new Date(expiration_at_ms).toISOString()
      : null;

    const upsertData: Record<string, unknown> = {
      user_id: app_user_id,
      revenuecat_customer_id: app_user_id,
      entitlement_id: 'plus', // v1: always plus
      product_id: product_id || 'unknown',
      store: (store || 'STRIPE').toLowerCase(),
      store_transaction_id: transaction_id || null,
      status,
      expires_at: expiresAt,
      is_trial: is_trial_period || false,
      environment: (environment || 'PRODUCTION').toLowerCase(),
      raw_event: event,
      updated_at: new Date().toISOString(),
    };

    // Set canceled_at on cancellation, clear on uncancellation
    if (type === 'CANCELLATION') {
      upsertData.canceled_at = new Date().toISOString();
    }
    if (type === 'UNCANCELLATION') {
      upsertData.canceled_at = null;
    }

    // Track trial dates on initial trial purchase
    if (is_trial_period && type === 'INITIAL_PURCHASE') {
      upsertData.trial_start_at = new Date().toISOString();
      upsertData.trial_end_at = expiresAt;
    }

    // 7. Upsert subscription record
    const { error: subError } = await adminClient
      .from('subscriptions')
      .upsert(upsertData, {
        onConflict: 'user_id,product_id,store_transaction_id',
      });

    if (subError) {
      console.error('[validate-subscription] Upsert error:', subError);
      return new Response(
        JSON.stringify({ error: 'Failed to update subscription' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    // 8. Sync profile tier
    const { error: syncError } = await adminClient
      .rpc('sync_profile_tier', { p_user_id: app_user_id });

    if (syncError) {
      console.error('[validate-subscription] Sync error:', syncError);
      // Log but don't fail -- the subscription was saved successfully
    }

    console.log(`[validate-subscription] Processed ${type} for user ${app_user_id} -> status: ${status}`);

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('[validate-subscription] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});
