// Mock supabase and widget-bridge so importing widget-cache.ts doesn't blow up in Jest
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

jest.mock('@/lib/widget-bridge', () => ({
  writeWidgetData: jest.fn(),
  writePosterFile: jest.fn(),
  reloadWidgetTimelines: jest.fn(),
}));

import { buildWidgetPayload } from '@/lib/widget-cache';

const baseRow = {
  user_tv_show_id: 'row-id',
  tmdb_id: 1,
  name: 'Show',
  poster_path: '/p.jpg',
  current_season: 1,
  current_episode: 1,
  number_of_seasons: 1,
  updated_at: '2026-04-10T00:00:00Z',
};

describe('buildWidgetPayload', () => {
  it('sorts by updated_at desc and limits to 3', () => {
    const rows = [
      { ...baseRow, user_tv_show_id: 'a', updated_at: '2026-04-10' },
      { ...baseRow, user_tv_show_id: 'b', updated_at: '2026-04-15' },
      { ...baseRow, user_tv_show_id: 'c', updated_at: '2026-04-12' },
      { ...baseRow, user_tv_show_id: 'd', updated_at: '2026-04-05' },
    ];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 10, shows_watched: 5 }, episodesBySeason: {} });
    expect(payload.shows).toHaveLength(3);
    expect(payload.shows.map((s) => s.user_tv_show_id)).toEqual(['b', 'c', 'a']);
  });

  it('assigns poster_filename by position when poster_path is set', () => {
    const rows = [
      { ...baseRow, user_tv_show_id: 'a', poster_path: '/a.jpg', updated_at: '2026-04-15' },
      { ...baseRow, user_tv_show_id: 'b', poster_path: null, updated_at: '2026-04-14' },
    ];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: {} });
    expect(payload.shows[0].poster_filename).toBe('poster_0.jpg');
    expect(payload.shows[1].poster_filename).toBeNull();
  });

  it('computes has_next_season and next_season_number from number_of_seasons', () => {
    const rows = [{ ...baseRow, user_tv_show_id: 'a', current_season: 2, number_of_seasons: 4, updated_at: '2026-04-15' }];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: {} });
    expect(payload.shows[0].has_next_season).toBe(true);
    expect(payload.shows[0].next_season_number).toBe(3);
  });

  it('computes has_next_season false when on final season', () => {
    const rows = [{ ...baseRow, user_tv_show_id: 'a', current_season: 3, number_of_seasons: 3, updated_at: '2026-04-15' }];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: {} });
    expect(payload.shows[0].has_next_season).toBe(false);
    expect(payload.shows[0].next_season_number).toBeNull();
  });

  it('flags season complete when episodesBySeason has the count and current_episode reaches it', () => {
    const rows = [{ ...baseRow, user_tv_show_id: 'a', current_season: 2, current_episode: 10, number_of_seasons: 3, updated_at: '2026-04-15' }];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: { 'a-2': 10 } });
    expect(payload.shows[0].is_season_complete).toBe(true);
    expect(payload.shows[0].is_show_complete).toBe(false); // still more seasons
  });

  it('flags show complete on last episode of final season', () => {
    const rows = [{ ...baseRow, user_tv_show_id: 'a', current_season: 3, current_episode: 8, number_of_seasons: 3, updated_at: '2026-04-15' }];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: { 'a-3': 8 } });
    expect(payload.shows[0].is_season_complete).toBe(true);
    expect(payload.shows[0].is_show_complete).toBe(true);
    expect(payload.shows[0].has_next_season).toBe(false);
  });

  it('Phase 1 default: empty episodesBySeason → season-complete flags all false', () => {
    const rows = [{ ...baseRow, user_tv_show_id: 'a', current_season: 2, current_episode: 10, number_of_seasons: 3, updated_at: '2026-04-15' }];
    const payload = buildWidgetPayload({ rows, stats: { films_watched: 0, shows_watched: 0 }, episodesBySeason: {} });
    expect(payload.shows[0].is_season_complete).toBe(false);
    expect(payload.shows[0].is_show_complete).toBe(false);
    // has_next_season still computes correctly
    expect(payload.shows[0].has_next_season).toBe(true);
  });

  it('passes stats through unchanged', () => {
    const payload = buildWidgetPayload({ rows: [], stats: { films_watched: 68, shows_watched: 12 }, episodesBySeason: {} });
    expect(payload.stats).toEqual({ films_watched: 68, shows_watched: 12 });
  });
});
