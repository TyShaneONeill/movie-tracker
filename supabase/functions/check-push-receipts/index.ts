import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ReceiptResult {
  status: 'ok' | 'error';
  message?: string;
  details?: { error: string };
}

interface ExpoReceiptsResponse {
  data: Record<string, ReceiptResult>;
}

Deno.serve(async (req: Request) => {
  // Only accept internal calls (service_role key in Authorization header)
  const authHeader = req.headers.get('authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!authHeader.includes(serviceRoleKey)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Query log rows that have been sent but not yet receipt-checked
    const { data: pendingRows, error: queryError } = await supabaseAdmin
      .from('push_notification_log')
      .select('id, ticket_id, token, user_id')
      .eq('status', 'sent')
      .not('ticket_id', 'is', null)
      .is('receipt_checked_at', null)
      .limit(1000);

    if (queryError) {
      throw new Error(`Failed to query pending receipts: ${queryError.message}`);
    }

    if (!pendingRows || pendingRows.length === 0) {
      return new Response(
        JSON.stringify({ checked: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Batch ticket IDs and POST to Expo receipts endpoint
    const BATCH_SIZE = 1000;
    const ticketIds = pendingRows.map(r => r.ticket_id as string);

    // Build a map: ticket_id -> log row
    const rowByTicketId = new Map(
      pendingRows.map(r => [r.ticket_id as string, r])
    );

    let delivered = 0;
    let failed = 0;
    let invalidTokensRemoved = 0;

    const receiptsMap: Record<string, ReceiptResult> = {};

    for (let i = 0; i < ticketIds.length; i += BATCH_SIZE) {
      const batch = ticketIds.slice(i, i + BATCH_SIZE);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
      }

      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: batch }),
      });

      const result: ExpoReceiptsResponse = await response.json();
      Object.assign(receiptsMap, result.data ?? {});
    }

    // 3. Process each receipt and update the log
    const invalidTokens: string[] = [];
    const now = new Date().toISOString();

    for (const [ticketId, receipt] of Object.entries(receiptsMap)) {
      const row = rowByTicketId.get(ticketId);
      if (!row) continue;

      const isDeviceNotRegistered =
        receipt.status === 'error' &&
        receipt.details?.error === 'DeviceNotRegistered';

      let newStatus: string;
      if (receipt.status === 'ok') {
        newStatus = 'delivered';
        delivered++;
      } else if (isDeviceNotRegistered) {
        newStatus = 'invalid_token';
        invalidTokens.push(row.token);
        failed++;
      } else {
        newStatus = 'failed';
        failed++;
      }

      await supabaseAdmin
        .from('push_notification_log')
        .update({
          status: newStatus,
          error_message: receipt.status === 'error' ? (receipt.message ?? null) : null,
          receipt_checked_at: now,
        })
        .eq('id', row.id);
    }

    // Mark any rows whose ticket_id wasn't in the receipt response as checked
    // (Expo may not return receipts for very recent sends yet — they will be retried next cycle)
    const checkedTicketIds = new Set(Object.keys(receiptsMap));
    const uncheckedRows = pendingRows.filter(
      r => !checkedTicketIds.has(r.ticket_id as string)
    );
    if (uncheckedRows.length > 0) {
      const uncheckedIds = uncheckedRows.map(r => r.id);
      await supabaseAdmin
        .from('push_notification_log')
        .update({ receipt_checked_at: now })
        .in('id', uncheckedIds);
    }

    // 4. Remove DeviceNotRegistered tokens from push_tokens
    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);

      invalidTokensRemoved = invalidTokens.length;
    }

    return new Response(
      JSON.stringify({
        checked: pendingRows.length,
        delivered,
        failed,
        invalid_tokens_removed: invalidTokensRemoved,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-push-receipts] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
