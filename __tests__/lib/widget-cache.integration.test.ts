// Integration test for syncWidgetCache orchestrator.
// Task 3 fills in TMDB-fetch assertions; this scaffold wires mocks + covers signout.

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('@/lib/widget-bridge', () => ({
  writeWidgetData: jest.fn().mockResolvedValue(undefined),
  writePosterFile: jest.fn().mockResolvedValue(undefined),
  reloadWidgetTimelines: jest.fn().mockResolvedValue(undefined),
}));

import { syncWidgetCache } from '@/lib/widget-cache';
import { supabase } from '@/lib/supabase';
import { writeWidgetData } from '@/lib/widget-bridge';

describe('syncWidgetCache orchestrator (integration)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes empty payload when user is not authed (signout clear)', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null } });
    await syncWidgetCache();
    expect(writeWidgetData).toHaveBeenCalledTimes(1);
    const call = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(call.shows).toEqual([]);
    expect(call.stats).toEqual({ films_watched: 0, shows_watched: 0 });
  });

  it('populates episodes_by_season and total_episodes_in_current_season from TMDB', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    // Chain of from() calls: user_tv_shows then two count queries
    const tvRowsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'utv-abc-def-123',
          tmdb_id: 95396,
          name: 'Severance',
          poster_path: null,
          current_season: 2,
          current_episode: 10,
          number_of_seasons: 3,
          updated_at: '2026-04-17',
        }],
        error: null,
      }),
    };
    const filmsCountChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    // .eq('user_id') returns chain, .eq('status') resolves
    filmsCountChain.eq
      .mockReturnValueOnce(filmsCountChain)
      .mockResolvedValueOnce({ count: 5, error: null });

    const showsCountChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ count: 3, error: null }),
    };
    let fromCallIdx = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCallIdx++;
      if (table === 'user_tv_shows' && fromCallIdx === 1) return tvRowsChain;
      if (table === 'user_movies') return filmsCountChain;
      if (table === 'user_tv_shows') return showsCountChain;
      return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
    });

    // Mock supabase.functions.invoke — dispatch on function name
    (supabase.functions.invoke as jest.Mock).mockImplementation(
      (fn: string, options: { body: { showId: number; seasonNumber?: number } }) => {
        if (fn === 'get-season-episodes') {
          const counts: Record<number, number> = { 1: 9, 2: 10, 3: 10 };
          const { seasonNumber } = options.body;
          return Promise.resolve({
            data: { episodes: Array(counts[seasonNumber ?? 0] ?? 0).fill({}) },
            error: null,
          });
        }
        if (fn === 'get-tv-show-details') {
          return Promise.resolve({ data: { number_of_seasons: 3 }, error: null });
        }
        return Promise.resolve({ data: null, error: new Error('unknown fn') });
      }
    );

    await syncWidgetCache();

    const writeCall = (writeWidgetData as jest.Mock).mock.calls[0][0];
    const show = writeCall.shows[0];
    expect(show.total_episodes_in_current_season).toBe(10);
    expect(show.episodes_by_season).toEqual({ '1': 9, '2': 10, '3': 10 });
    expect(show.is_season_complete).toBe(true);
    expect(show.is_show_complete).toBe(false); // has_next_season true (season 2 of 3)
  });

  it('uses live TMDB number_of_seasons instead of stale DB value for has_next_season', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u' } } });

    // DB row has stale number_of_seasons = 1. TMDB says 2.
    const tvRowsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'show-uuid',
          tmdb_id: 95396,
          name: 'Severance',
          poster_path: null,
          current_season: 1,
          current_episode: 9,
          number_of_seasons: 1,  // Stale
          updated_at: '2026-04-18',
        }],
        error: null,
      }),
    };
    const filmsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    filmsChain.eq
      .mockReturnValueOnce(filmsChain)
      .mockResolvedValueOnce({ count: 0, error: null });
    const showsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ count: 1, error: null }),
    };
    let fromCall = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCall++;
      if (table === 'user_tv_shows' && fromCall === 1) return tvRowsChain;
      if (table === 'user_movies') return filmsChain;
      return showsChain;
    });

    // Mock both edge function calls
    (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string) => {
      if (fn === 'get-season-episodes') {
        return Promise.resolve({ data: { episodes: Array(9).fill({}) }, error: null });
      }
      if (fn === 'get-tv-show-details') {
        return Promise.resolve({ data: { number_of_seasons: 2 }, error: null });
      }
      return Promise.resolve({ data: null, error: new Error('unknown fn') });
    });

    await syncWidgetCache();

    const call = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(call.shows[0].total_seasons).toBe(2);  // Live value, not stale 1
    expect(call.shows[0].has_next_season).toBe(true);
    expect(call.shows[0].next_season_number).toBe(2);
  });
});
