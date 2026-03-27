// notify-new-user — Database Webhook handler
//
// Setup (after deploying this function):
//   Dashboard → Database → Webhooks → Create new webhook
//   Name:    notify-new-user
//   Table:   public.profiles
//   Events:  INSERT only
//   URL:     https://wliblwulvsrfgqcnbzeh.supabase.co/functions/v1/notify-new-user
//   Method:  POST
//   No extra headers needed (verify_jwt = false)
//
// Secret:
//   supabase secrets set NEW_USERS_DISCORD_WEBHOOK_URL=<url> --project-ref wliblwulvsrfgqcnbzeh

interface ProfileRecord {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface WebhookPayload {
  type: 'INSERT';
  table: 'profiles';
  schema: 'public';
  record: ProfileRecord;
  old_record: null;
}

Deno.serve(async (req: Request) => {
  // Supabase may send HEAD checks — acknowledge and return early
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { username, full_name, created_at } = payload.record;
  const displayName = full_name || username || 'Anonymous';

  const signupDate = new Date(created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const webhookUrl = Deno.env.get('NEW_USERS_DISCORD_WEBHOOK_URL');
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: '🎉 New PocketStubs User',
              description: displayName,
              color: 0xb91c3c,
              fields: [
                {
                  name: 'Signed up',
                  value: signupDate,
                  inline: false,
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // Never let a Discord failure block the webhook acknowledgement
    }
  }

  return new Response('OK', { status: 200 });
});
