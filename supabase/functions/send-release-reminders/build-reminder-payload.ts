/**
 * Pure helper for the send-release-reminders consumer.
 * Groups RPC rows by (tmdb_id, category) and constructs Expo Push payloads
 * suitable for posting to the internal `send-push-notification` edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/.
 */

export type ReminderCategory = 'theatrical' | 'streaming';

// PS-15 PR 1: 'day_before' is the new "opens tomorrow" nudge (component C).
// Absent/undefined on a reminder means 'day_of' — matches the RPC's
// COALESCE(..., 'day_of') dedup default for pre-migration log rows.
export type ReminderVariant = 'day_of' | 'day_before';

export interface PendingReminder {
  user_id: string;
  tmdb_id: number;
  category: ReminderCategory;
  title: string;
  variant?: ReminderVariant;
}

export interface ReminderPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    tmdb_id: number;
    category: ReminderCategory;
    variant: ReminderVariant;
    feature: 'release_reminders';
  };
  feature: 'release_reminders';
  channel_id: 'reminders';
}

// DRAFT copy — FOR CONTENT QUEUE REVIEW (PS-15 PR 1, 2026-07-06).
function buildTitle(category: ReminderCategory, variant: ReminderVariant, title: string): string {
  if (variant === 'day_before') {
    return category === 'theatrical'
      ? `🎬 ${title} — opens tomorrow`
      : `🍿 ${title} — streaming tomorrow`;
  }
  return category === 'theatrical'
    ? `🎬 ${title} — now in theaters`
    : `🍿 ${title} — now streaming`;
}

export function groupRemindersByMovie(
  reminders: readonly PendingReminder[]
): ReminderPayload[] {
  const byKey = new Map<string, ReminderPayload>();
  for (const r of reminders) {
    const variant: ReminderVariant = r.variant ?? 'day_of';
    const key = `${r.tmdb_id}|${r.category}|${variant}`;
    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title: buildTitle(r.category, variant, r.title),
        body: '',
        data: {
          url: `/movie/${r.tmdb_id}`,
          tmdb_id: r.tmdb_id,
          category: r.category,
          variant,
          feature: 'release_reminders',
        },
        feature: 'release_reminders',
        channel_id: 'reminders',
      };
      byKey.set(key, payload);
    }
    payload.user_ids.push(r.user_id);
  }
  return Array.from(byKey.values());
}
