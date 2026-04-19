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

    // Mock supabase.functions.invoke for the get-season-episodes edge function
    (supabase.functions.invoke as jest.Mock).mockImplementation(
      (_fnName: string, options: { body: { showId: number; seasonNumber: number } }) => {
        const counts: Record<number, number> = { 1: 9, 2: 10, 3: 10 };
        const { seasonNumber } = options.body;
        return Promise.resolve({
          data: { episodes: Array(counts[seasonNumber] ?? 0).fill({}) },
          error: null,
        });
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
});
