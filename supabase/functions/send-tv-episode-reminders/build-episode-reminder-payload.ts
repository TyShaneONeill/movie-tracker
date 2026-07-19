/**
 * Pure helper for the send-tv-episode-reminders consumer.
 * Groups RPC rows by (tmdb_id, season_number, episode_number) and constructs
 * Expo Push payloads suitable for posting to the internal `send-push-notification`
 * edge function.
 *
 * Lives inside supabase/functions/ so the Deno runtime can import it directly,
 * and is also Jest-testable via relative path from __tests__/edge-functions/.
 */

export interface PendingEpisodeReminder {
  user_id: string;
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  show_name: string;
}

export interface EpisodeReminderPayload {
  user_ids: string[];
  title: string;
  body: string;
  data: {
    url: string;
    tmdb_id: number;
    season: number;
    episode: number;
    feature: 'tv_episode_reminders';
  };
  feature: 'tv_episode_reminders';
  channel_id: 'reminders';
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function groupEpisodeRemindersByEpisode(
  reminders: readonly PendingEpisodeReminder[]
): EpisodeReminderPayload[] {
  const byKey = new Map<string, EpisodeReminderPayload>();
  for (const r of reminders) {
    const key = `${r.tmdb_id}|${r.season_number}|${r.episode_number}`;
    let payload = byKey.get(key);
    if (!payload) {
      payload = {
        user_ids: [],
        title: `📺 ${r.show_name} — S${pad2(r.season_number)}E${pad2(r.episode_number)} is out`,
        body: '',
        data: {
          // Stays /tv/{id} — this server payload reaches EVERY installed binary,
          // including bundles that predate the Episode Room route. The client
          // push-tap handler upgrades to /episode-room/{tmdb_id}-{season}-{episode}
          // when the flag is on, using these season/episode fields to build that
          // URL. Old bundles keep this destination no matter when this edge
          // function deploys.
          url: `/tv/${r.tmdb_id}`,
          tmdb_id: r.tmdb_id,
          season: r.season_number,
          episode: r.episode_number,
          feature: 'tv_episode_reminders',
        },
        feature: 'tv_episode_reminders',
        channel_id: 'reminders',
      };
      byKey.set(key, payload);
    }
    payload.user_ids.push(r.user_id);
  }
  return Array.from(byKey.values());
}
