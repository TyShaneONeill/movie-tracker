import {
  groupRemindersByMovie,
  type PendingReminder,
  type ReminderPayload,
} from '../../supabase/functions/send-release-reminders/build-reminder-payload';

describe('groupRemindersByMovie', () => {
  it('returns empty array for empty input', () => {
    expect(groupRemindersByMovie([])).toEqual([]);
  });

  it('builds a theatrical payload with film emoji and "now in theaters" suffix', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 12345, category: 'theatrical', title: 'Dune: Part Two' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<ReminderPayload>({
      user_ids: ['u1'],
      title: '🎬 Dune: Part Two — now in theaters',
      body: '',
      data: {
        url: '/movie/12345',
        tmdb_id: 12345,
        category: 'theatrical',
        feature: 'release_reminders',
      },
      feature: 'release_reminders',
      channel_id: 'reminders',
    });
  });

  it('builds a streaming payload with popcorn emoji and "now streaming" suffix', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 999, category: 'streaming', title: 'Some Series' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result[0].title).toBe('🍿 Some Series — now streaming');
    expect(result[0].data.url).toBe('/movie/999');
    expect(result[0].data.category).toBe('streaming');
  });

  it('groups two users for the same movie+category into one payload with two user_ids', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 42, category: 'theatrical', title: 'Movie A' },
      { user_id: 'u2', tmdb_id: 42, category: 'theatrical', title: 'Movie A' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u1', 'u2']);
  });

  it('separates the same user across two different movies into two payloads', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 1, category: 'theatrical', title: 'Movie A' },
      { user_id: 'u1', tmdb_id: 2, category: 'theatrical', title: 'Movie B' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.data.tmdb_id).sort()).toEqual([1, 2]);
  });

  it('separates the same user+movie across two different categories into two payloads', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u1', tmdb_id: 7, category: 'theatrical', title: 'X' },
      { user_id: 'u1', tmdb_id: 7, category: 'streaming', title: 'X' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(2);
    const cats = result.map(p => p.data.category).sort();
    expect(cats).toEqual(['streaming', 'theatrical']);
  });

  it('preserves user order within a group (insertion order)', () => {
    const reminders: PendingReminder[] = [
      { user_id: 'u3', tmdb_id: 5, category: 'theatrical', title: 'M' },
      { user_id: 'u1', tmdb_id: 5, category: 'theatrical', title: 'M' },
      { user_id: 'u2', tmdb_id: 5, category: 'theatrical', title: 'M' },
    ];
    const result = groupRemindersByMovie(reminders);
    expect(result).toHaveLength(1);
    expect(result[0].user_ids).toEqual(['u3', 'u1', 'u2']);
  });
});
