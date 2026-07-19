import {
  groupEpisodeRemindersByEpisode,
  type PendingEpisodeReminder,
  type EpisodeReminderPayload,
} from '../../supabase/functions/send-tv-episode-reminders/build-episode-reminder-payload';

describe('groupEpisodeRemindersByEpisode', () => {
  it('returns empty array for empty input', () => {
    expect(groupEpisodeRemindersByEpisode([])).toEqual([]);
  });

  it('builds a payload with the correct title format and full data shape', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1396, season_number: 3, episode_number: 4, show_name: 'Breaking Bad' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<EpisodeReminderPayload>({
      user_ids: ['u1'],
      title: '📺 Breaking Bad — S03E04 is out',
      body: '',
      data: {
        url: '/tv/1396',
        tmdb_id: 1396,
        season: 3,
        episode: 4,
        feature: 'tv_episode_reminders',
      },
      feature: 'tv_episode_reminders',
      channel_id: 'reminders',
    });
  });

  it('groups two users watching the same episode into one payload with two user_ids', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 42, season_number: 1, episode_number: 1, show_name: 'Show' },
      { user_id: 'u2', tmdb_id: 42, season_number: 1, episode_number: 1, show_name: 'Show' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u1', 'u2']);
  });

  it('separates the same user across two different shows into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 1, episode_number: 1, show_name: 'A' },
      { user_id: 'u1', tmdb_id: 2, season_number: 1, episode_number: 1, show_name: 'B' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.data.tmdb_id).sort()).toEqual([1, 2]);
  });

  it('separates same user+show across two different episodes into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 1, show_name: 'X' },
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 2, show_name: 'X' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    const eps = result.map(p => p.data.episode).sort();
    expect(eps).toEqual([1, 2]);
  });

  it('separates same user+show across two different seasons into two payloads', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 7, season_number: 2, episode_number: 1, show_name: 'X' },
      { user_id: 'u1', tmdb_id: 7, season_number: 3, episode_number: 1, show_name: 'X' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(2);
    const seasons = result.map(p => p.data.season).sort();
    expect(seasons).toEqual([2, 3]);
  });

  it('zero-pads single-digit season and episode numbers in the title', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 1, episode_number: 4, show_name: 'A' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result[0].title).toBe('📺 A — S01E04 is out');
  });

  it('does not pad two-digit numbers', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u1', tmdb_id: 1, season_number: 12, episode_number: 25, show_name: 'A' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result[0].title).toBe('📺 A — S12E25 is out');
  });

  it('preserves user order within a group (insertion order)', () => {
    const reminders: PendingEpisodeReminder[] = [
      { user_id: 'u3', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
      { user_id: 'u1', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
      { user_id: 'u2', tmdb_id: 5, season_number: 1, episode_number: 1, show_name: 'M' },
    ];
    const result = groupEpisodeRemindersByEpisode(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u3', 'u1', 'u2']);
  });
});
