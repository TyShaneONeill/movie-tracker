// RevenueCat webhook receiver — writes subscriptions rows + syncs profile tier.
//
// ⚠️ DEPLOY with --no-verify-jwt. RevenueCat authenticates with a static
// bearer secret (REVENUECAT_WEBHOOK_SECRET), not a Supabase session JWT, so
// gateway JWT verification would 401 every delivery before this code runs:
//
//   supabase functions deploy validate-subscription --no-verify-jwt --project-ref wliblwulvsrfgqcnbzeh
//
// Failure contract (#787): a real purchase must NEVER be silently dropped.
// Every failure path returns non-2xx (matrix: FAILURE_STATUS in logic.ts) so
// RevenueCat retries the delivery. Revenue-critical failures — config, DB,
// resolution, sync, wrong-secret auth — additionally fire a Sentry error
// event (direct envelope POST — npm:@sentry/deno no-ops in Edge Runtime)
// plus a REVENUE-CRITICAL log line; headerless scanner 401s and malformed
// 400s stay log-only so noise can't drown real alerts. The upsert is
// idempotent, so retries converge on the same row.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';
import { captureEdgeException } from '../_shared/sentry-capture.ts';
import {
  type RevenueCatEvent,
  type FailureReason,
  FAILURE_STATUS,
  mapEventTypeToStatus,
  collectUserIdCandidates,
  pickResolvedUserId,
  buildSubscriptionUpsert,
} from './logic.ts';

const FN = 'validate-subscription';

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/**
 * Non-2xx (per FAILURE_STATUS) + Sentry + loud log: RevenueCat retries
 * anything that isn't 2xx.
 */
async function failLoudly(
  req: Request,
  reason: FailureReason,
  error: unknown,
  extra: Record<string, unknown>,
): Promise<Response> {
  console.error(`[${FN}] REVENUE-CRITICAL ${reason}:`, error, JSON.stringify(extra));
  await captureEdgeException(error, {
    functionName: FN,
    tags: { reason },
    extra,
  });
  return jsonResponse(req, FAILURE_STATUS[reason], { error: reason });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    // 1. Validate webhook secret
    const authHeader = req.headers.get('Authorization');
    const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

    if (!expectedSecret) {
      return await failLoudly(req, 'webhook_secret_not_configured',
        new Error('REVENUECAT_WEBHOOK_SECRET not configured'), {});
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      if (authHeader) {
        // A bearer token was PRESENTED and it's wrong. If that's RevenueCat
        // with a stale/mistyped secret, every delivery is bouncing — the till
        // is broken. Sentry + loud log (never the header value itself).
        console.error(`[${FN}] REVENUE-CRITICAL unauthorized: wrong webhook secret presented`);
        await captureEdgeException(new Error('Webhook auth failed with a bearer token present'), {
          functionName: FN,
          tags: { reason: 'unauthorized' },
        });
      } else {
        // No Authorization header at all: scanner noise on a public URL.
        // Log-only so it can't drown real alerts.
        console.error(`[${FN}] unauthorized: request without Authorization header`);
      }
      return jsonResponse(req, FAILURE_STATUS.unauthorized, { error: 'Unauthorized' });
    }

    // 2. Parse event
    const body = await req.json();
    const event: RevenueCatEvent = body.event;

    if (!event) {
      return jsonResponse(req, FAILURE_STATUS.missing_event_payload, { error: 'Missing event payload' });
    }

    const { type, app_user_id } = event;

    // 3. Validate required fields
    if (!app_user_id || !type) {
      return jsonResponse(req, FAILURE_STATUS.missing_required_fields,
        { error: 'Missing required fields: app_user_id and type' });
    }

    // 4. Check if this is an event type we handle
    const status = mapEventTypeToStatus(type);
    if (!status) {
      // Unhandled event type -- acknowledge receipt but take no action
      console.log(`[${FN}] Ignoring unhandled event type: ${type}`);
      return jsonResponse(req, FAILURE_STATUS.unhandled_event_type,
        { ok: true, skipped: true, event_type: type });
    }

    // 5. Create admin client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 6. Resolve app_user_id → auth uuid (#787 root cause).
    // subscriptions.user_id is uuid REFERENCES auth.users(id); RC sends
    // `$RCAnonymousID:...` when a purchase races identify. The real uuid is
    // usually in aliases/original_app_user_id — verify candidates against
    // profiles (id = auth.users.id) before writing.
    const candidates = collectUserIdCandidates(event);

    let resolvedUserId: string | null = null;
    if (candidates.length > 0) {
      const { data: profileRows, error: profileError } = await adminClient
        .from('profiles')
        .select('id')
        .in('id', candidates);

      if (profileError) {
        return await failLoudly(req, 'user_lookup_failed', profileError, {
          event_type: type, app_user_id, candidates,
        });
      }
      resolvedUserId = pickResolvedUserId(
        candidates,
        (profileRows ?? []).map((r: { id: string }) => r.id),
      );
    }

    if (!resolvedUserId) {
      // No known user yet (e.g. purchase before identify, aliases not merged).
      // Non-2xx → RevenueCat redelivers with backoff; by then identify has
      // usually run and aliases carry the uuid. The Sentry event makes each
      // miss loud so an exhausted retry window can be reconciled from the RC
      // dashboard.
      return await failLoudly(req, 'unresolvable_app_user_id',
        new Error(`No auth user found for RevenueCat app_user_id ${app_user_id}`), {
          event_type: type,
          app_user_id,
          aliases: event.aliases ?? [],
          candidates,
          transaction_id: event.transaction_id ?? null,
        });
    }

    // 7. Idempotent upsert of the subscription record
    const upsertData = buildSubscriptionUpsert(event, resolvedUserId, status, new Date().toISOString());

    const { error: subError } = await adminClient
      .from('subscriptions')
      .upsert(upsertData, {
        onConflict: 'user_id,product_id,store_transaction_id',
      });

    if (subError) {
      return await failLoudly(req, 'subscription_upsert_failed', subError, {
        event_type: type, app_user_id, user_id: resolvedUserId,
      });
    }

    // 8. Sync profile tier — this is what actually grants premium, so a
    // failure here is as revenue-critical as the upsert. Non-2xx → RC
    // redelivers; the upsert above is idempotent so the retry is safe.
    const { error: syncError } = await adminClient
      .rpc('sync_profile_tier', { p_user_id: resolvedUserId });

    if (syncError) {
      return await failLoudly(req, 'profile_tier_sync_failed', syncError, {
        event_type: type, app_user_id, user_id: resolvedUserId,
      });
    }

    console.log(`[${FN}] Processed ${type} for user ${resolvedUserId} (rc id: ${app_user_id}) -> status: ${status}`);

    return jsonResponse(req, 200, { ok: true });

  } catch (error) {
    return await failLoudly(req, 'unhandled_error', error, {});
  }
});
