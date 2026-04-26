/**
 * Discord webhook client for the #bugs channel.
 * Env: DISCORD_WEBHOOK_BUGS_URL
 * Docs: https://discord.com/developers/docs/resources/webhook
 */

const WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_BUGS_URL');
if (!WEBHOOK_URL) console.warn('[discord-webhook] DISCORD_WEBHOOK_BUGS_URL not set');

export interface InitialBugReportEmbed {
  eventId: string;
  title: string;
  descriptionPreview: string;   // Already truncated + sanitized
  platform: string;
  appVersion: string;
  route: string;
  accountTier: string;
  sentryUrl: string;
}

/**
 * Post the initial notification to #bugs. Fire-and-forget: caller should not
 * await this in the user-request critical path. Returns the message_id on
 * success (needed later to post a threaded reply with AI analysis), or null
 * on failure.
 */
export async function postInitialBugReport(
  args: InitialBugReportEmbed,
): Promise<{ messageId: string } | null> {
  if (!WEBHOOK_URL) return null;
  try {
    // ?wait=true causes Discord to return the created message object so we
    // get the id for threading.
    const res = await fetch(`${WEBHOOK_URL}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🐛 ${args.title}`,
          description: args.descriptionPreview,
          url: args.sentryUrl,
          color: 0xe11d48,
          footer: {
            text: `${args.platform} · v${args.appVersion} · ${args.route} · ${args.accountTier}`,
          },
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      console.log(JSON.stringify({
        event: 'discord_initial_post_failed',
        status: res.status,
        event_id: args.eventId,
      }));
      return null;
    }
    const json = await res.json() as { id?: string };
    return json.id ? { messageId: json.id } : null;
  } catch (err) {
    console.log(JSON.stringify({
      event: 'discord_initial_post_exception',
      error: (err as Error).message,
      event_id: args.eventId,
    }));
    return null;
  }
}

/**
 * Post a threaded reply to a previous webhook message with the AI analysis.
 * Discord requires creating a thread from the parent message first, then
 * posting a follow-up to the thread.
 */
export async function postAnalysisThread(
  parentMessageId: string,
  threadTitle: string,
  analysisMarkdown: string,
): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    // Webhook threads are scoped under the webhook URL with thread_id.
    // Easiest path: use the webhook's "Create Thread from Message" via a
    // regular message with `thread_name` which opens a forum-style thread.
    // Alternative: POST with ?thread_id=<id> if you pre-create the thread.
    // For a standard text channel, use the Discord REST API thread endpoint.
    // Simplest robust approach: post a normal follow-up message that
    // references the original message id in content, and let humans glance.
    // This is documented trade-off; do the simple thing for MVP.
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🤖 **AI Analysis** (re: message ID \`${parentMessageId}\`)\n\n**${threadTitle}**\n\n${analysisMarkdown}`,
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (err) {
    console.log(JSON.stringify({
      event: 'discord_analysis_post_failed',
      error: (err as Error).message,
      parent_message_id: parentMessageId,
    }));
  }
}
