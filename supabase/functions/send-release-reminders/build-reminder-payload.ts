/**
 * Pure helper for the send-release-reminders consumer.
 * Groups RPC rows by (tmdb_id, category) and constructs Expo Push payloads
 * suitable for posting to the internal `send-push-notification` edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/.
 */

export type ReminderCategory = 'theatrical' | 'streaming';

export interface PendingReminder {
  user_id: string;
  tmdb_id: number;
  category: ReminderCategory;
  title: string;
}

export interface ReminderPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    tmdb_id: number;
    category: ReminderCategory;
    feature: 'release_reminders';
  };
  feature: 'release_reminders';
  channel_id: 'reminders';
}

export function groupRemindersByMovie(
  reminders: readonly PendingReminder[]
): ReminderPayload[] {
  const byKey = new Map<string, ReminderPayload>();
  for (const r of reminders) {
    const key = `${r.tmdb_id}|${r.category}`;
    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title:
          r.category === 'theatrical'
            ? `🎬 ${r.title} — now in theaters`
            : `🍿 ${r.title} — now streaming`,
        body: '',
        data: {
          url: `/movie/${r.tmdb_id}`,
          tmdb_id: r.tmdb_id,
          category: r.category,
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
