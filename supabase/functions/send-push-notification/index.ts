import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface PushRequest {
  user_ids: string[];           // Users to notify
  title: string;
  body: string;
  data?: Record<string, any>;  // Must include `url` for deep linking
  feature: string;              // 'release_reminder' | 'social' | 'digest' | etc.
  channel_id?: string;          // Android channel (default: 'default')
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error: string };
}

Deno.serve(async (req: Request) => {
  // Supabase verify_jwt=true has already validated the JWT signature at the gateway.
  // We additionally require role=service_role so non-cron callers (anon/authenticated)
  // cannot trigger this internal function. Same pattern as send-release-reminders.
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  let payload: { role?: string };
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded + '=='.slice(0, (4 - padded.length % 4) % 4));
    payload = JSON.parse(decoded);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (payload.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // serviceRoleKey is still needed below for the supabase admin client
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  try {
    const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      user_ids, title, body, data, feature, channel_id,
    }: PushRequest = await req.json();

    // 1. Fetch push tokens for target users
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', user_ids);

    if (tokenError || !tokens?.length) {
      return new Response(
        JSON.stringify({
          sent: 0,
          error: tokenError?.message || 'No tokens found',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check per-user notification preferences
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, enabled')
      .in('user_id', user_ids)
      .eq('feature', feature);

    const disabledUsers = new Set(
      (prefs ?? []).filter(p => !p.enabled).map(p => p.user_id)
    );

    const eligibleTokens = tokens.filter(
      t => !disabledUsers.has(t.user_id)
    );

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 'all_opted_out' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build Expo push messages
    const messages = eligibleTokens.map(t => ({
      to: t.token,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
      channelId: channel_id ?? 'default',
      priority: 'high' as const,
    }));

    // 4. Send in batches of 100 (Expo API limit per request)
    const BATCH_SIZE = 100;
    const allTickets: {
      token: string; ticket: ExpoTicket; user_id: string;
    }[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const tokenBatch = eligibleTokens.slice(i, i + BATCH_SIZE);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
      }

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      const tickets = result.data ?? [];

      tickets.forEach((ticket: ExpoTicket, idx: number) => {
        allTickets.push({
          token: tokenBatch[idx].token,
          ticket,
          user_id: tokenBatch[idx].user_id,
        });
      });
    }

    // 5. Log results
    const logEntries = allTickets.map(({ token, ticket, user_id }) => ({
      user_id,
      token,
      ticket_id: ticket.id ?? null,
      feature,
      title,
      body,
      data: data ?? null,
      status: ticket.status === 'ok' ? 'sent' : 'failed',
      error_message: ticket.status === 'error' ? ticket.message : null,
      sent_at: new Date().toISOString(),
    }));

    await supabaseAdmin.from('push_notification_log').insert(logEntries);

    // 6. Remove tokens that got DeviceNotRegistered errors
    const invalidTokens = allTickets
      .filter(t => t.ticket.details?.error === 'DeviceNotRegistered')
      .map(t => t.token);

    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);

      await supabaseAdmin
        .from('push_notification_log')
        .update({ status: 'invalid_token' })
        .in('token', invalidTokens)
        .eq('feature', feature)
        .gte('created_at', new Date(Date.now() - 60_000).toISOString());
    }

    const sent = allTickets.filter(t => t.ticket.status === 'ok').length;
    const failed = allTickets.filter(t => t.ticket.status === 'error').length;

    return new Response(
      JSON.stringify({
        sent,
        failed,
        invalid_tokens_removed: invalidTokens.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-push-notification] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
