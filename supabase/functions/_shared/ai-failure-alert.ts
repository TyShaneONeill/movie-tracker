/**
 * Discord alert for AI journey-art generation failures.
 *
 * Severity-coded so failures can be triaged at a glance: `critical` (model
 * deprecated/missing — act now) vs `warn` (infra/OpenAI) vs `info` (copyright,
 * timeout — usually ignorable).
 *
 * Posts to a dedicated #ai-alerts webhook (`DISCORD_AI_ALERTS_WEBHOOK_URL`),
 * falling back to #bugs (`DISCORD_WEBHOOK_BUGS_URL`) until the dedicated webhook
 * secret is set — so alerting works immediately either way.
 *
 * Fire-and-forget: never throws into the caller's response path.
 */

const AI_ALERTS_WEBHOOK = Deno.env.get('DISCORD_AI_ALERTS_WEBHOOK_URL');
const BUGS_WEBHOOK = Deno.env.get('DISCORD_WEBHOOK_BUGS_URL');
const WEBHOOK_URL = AI_ALERTS_WEBHOOK || BUGS_WEBHOOK;

export type AiFailureSeverity = 'critical' | 'warn' | 'info';

const SEVERITY_META: Record<AiFailureSeverity, { emoji: string; color: number }> = {
  critical: { emoji: '🚨', color: 0xdc2626 },
  warn: { emoji: '⚠️', color: 0xf59e0b },
  info: { emoji: 'ℹ️', color: 0x3b82f6 },
};

export interface AiFailureAlert {
  reason: string;
  severity: AiFailureSeverity;
  movieTitle?: string;
  userId?: string;
  detail?: string;
  /** What the user had at stake — confirms a failure consumed nothing. */
  creditNote?: string;
  /** Alert title prefix + embed footer; defaults to the original journey-art caller. */
  feature?: string;
}

export async function reportAiGenerationFailure(args: AiFailureAlert): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn(
      '[ai-failure-alert] no webhook set (DISCORD_AI_ALERTS_WEBHOOK_URL / DISCORD_WEBHOOK_BUGS_URL)',
    );
    return;
  }
  const meta = SEVERITY_META[args.severity] ?? SEVERITY_META.warn;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `${meta.emoji} ${args.feature ?? 'AI art generation'} failed — ${args.reason}`,
            color: meta.color,
            fields: [
              { name: 'Movie', value: (args.movieTitle || '—').slice(0, 100), inline: true },
              { name: 'Severity', value: args.severity, inline: true },
              // Short user prefix only — enough to correlate, not full PII.
              { name: 'User', value: args.userId ? args.userId.slice(0, 8) : '—', inline: true },
              { name: 'Credit', value: `✓ ${args.creditNote || 'not consumed'}`, inline: true },
              { name: 'Detail', value: (args.detail || '—').slice(0, 800) },
            ],
            footer: { text: args.feature ?? 'generate-journey-art' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      console.log(JSON.stringify({ event: 'ai_failure_alert_post_failed', status: res.status, reason: args.reason }));
    }
  } catch (e) {
    console.error('[ai-failure-alert] post failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Maps a thrown generation error to a stable reason code + severity, so both
 * the Discord alert and the client's PostHog `generate:art:fail` event use the
 * same taxonomy. `safetyRejection` is passed explicitly because the caller owns
 * that error class.
 */
export function categorizeGenerationFailure(
  error: unknown,
  isSafetyRejection: boolean,
): { reason: string; severity: AiFailureSeverity } {
  if (isSafetyRejection) return { reason: 'copyright', severity: 'info' };
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('timed out') || msg.includes('timeout')) {
    return { reason: 'timeout', severity: 'info' };
  }
  // The brand-critical case: model retired/renamed (mirrors the Gemini
  // deprecation incidents). OpenAI surfaces this as a 4xx with a message like
  // "The model `gpt-image-1.5` does not exist or you do not have access to it."
  if (
    msg.includes('model') &&
    (msg.includes('does not exist') ||
      msg.includes('deprecated') ||
      msg.includes('not found') ||
      msg.includes('no access') ||
      msg.includes('do not have access'))
  ) {
    return { reason: 'model_error', severity: 'critical' };
  }
  if (msg.includes('openai') || msg.includes('no image returned')) {
    return { reason: 'openai_error', severity: 'warn' };
  }
  if (msg.includes('poster')) return { reason: 'poster_fetch', severity: 'info' };
  if (msg.includes('upload') || msg.includes('storage')) {
    return { reason: 'storage_error', severity: 'warn' };
  }
  return { reason: 'unknown', severity: 'warn' };
}
