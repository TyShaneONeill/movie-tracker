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
import { writeWidgetData, writePosterFile } from '@/lib/widget-bridge';

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

  it('builds payload when TMDB season fetch fails for one season', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u' } } });

    const tvRowsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'show-uuid',
          tmdb_id: 1399,
          name: 'Game of Thrones',
          poster_path: null,
          current_season: 2,
          current_episode: 5,
          number_of_seasons: 8,
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

    // get-season-episodes throws for season 2 specifically; succeeds for others.
    // get-tv-show-details succeeds.
    (supabase.functions.invoke as jest.Mock).mockImplementation((fn: string, opts: any) => {
      if (fn === 'get-tv-show-details') {
        return Promise.resolve({ data: { number_of_seasons: 8 }, error: null });
      }
      if (fn === 'get-season-episodes') {
        if (opts?.body?.seasonNumber === 2) {
          return Promise.reject(new Error('network timeout'));
        }
        return Promise.resolve({ data: { episodes: Array(10).fill({}) }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await syncWidgetCache();

    // Payload still writes despite one season fetch failing
    const call = (writeWidgetData as jest.Mock).mock.calls[0][0];
    expect(call.shows).toHaveLength(1);
    // Show is currently on season 2 (the failed one); is_season_complete
    // must default to false since we have no episode count for it
    expect(call.shows[0].is_season_complete).toBe(false);
    expect(call.shows[0].total_episodes_in_current_season).toBeNull();
  });

  it('skips poster download when Content-Length exceeds MAX_POSTER_BYTES', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u' } } });

    const tvRowsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'show-uuid',
          tmdb_id: 1,
          name: 'X',
          poster_path: '/poster.jpg',
          current_season: 1,
          current_episode: 1,
          number_of_seasons: 1,
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
      in: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    let fromCall = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCall++;
      if (table === 'user_tv_shows' && fromCall === 1) return tvRowsChain;
      if (table === 'user_movies') return filmsChain;
      return showsChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    // Mock global.fetch - returns oversized Content-Length
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'content-length' ? String(10_000_000) : null),
      },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10_000_000)),
    }) as any;

    try {
      await syncWidgetCache();
      expect(writePosterFile).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects poster_path that fails TMDB path regex (traversal attempt)', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u' } } });

    const maliciousPath = '/..%2F..%2Fetc%2Fpasswd';  // URL-encoded traversal

    const tvRowsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'show-uuid',
          tmdb_id: 1,
          name: 'X',
          poster_path: maliciousPath,
          current_season: 1,
          current_episode: 1,
          number_of_seasons: 1,
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
      in: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };
    let fromCall = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCall++;
      if (table === 'user_tv_shows' && fromCall === 1) return tvRowsChain;
      if (table === 'user_movies') return filmsChain;
      return showsChain;
    });
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: null });

    const originalFetch = global.fetch;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    try {
      await syncWidgetCache();
      // fetch should NOT have been called - path failed regex before URL construction
      expect(fetchMock).not.toHaveBeenCalled();
      expect(writePosterFile).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
