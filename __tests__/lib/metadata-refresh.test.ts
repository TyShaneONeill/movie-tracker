jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

import { refreshStaleWatchingShows, refreshSingleShow } from '@/lib/metadata-refresh';
import { supabase } from '@/lib/supabase';

describe('metadata-refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('refreshStaleWatchingShows', () => {
    it('queries only status=watching shows with stale metadata_refreshed_at', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as jest.Mock).mockReturnValue(selectChain);

      await refreshStaleWatchingShows();

      expect(supabase.from).toHaveBeenCalledWith('user_tv_shows');
      expect(selectChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      // status now encoded via .or() to include Returning Series watched rows
      const orArgs = selectChain.or.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(orArgs.some((s) => s.includes('status.eq.watching'))).toBe(true);
      // The .or() call contains the OR of NULL + stale (24h) — verify it was called
      expect(selectChain.or).toHaveBeenCalled();
      expect(selectChain.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('refreshStaleWatchingShows concurrency', () => {
    it('caps parallel TMDB fetches at 5', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const mockRows = Array.from({ length: 10 }, (_, i) => ({
        id: `utv-${i}`,
        tmdb_id: 100 + i,
        name: `Show ${i}`,
        poster_path: null,
        number_of_seasons: 1,
        number_of_episodes: 8,
        metadata_refreshed_at: null,
      }));

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as jest.Mock).mockImplementation(() => {
        // First call is the select; subsequent calls are updates.
        return selectChain.limit.mock.calls.length === 0 ? selectChain : updateChain;
      });

      let concurrent = 0;
      let maxConcurrent = 0;
      (supabase.functions.invoke as jest.Mock).mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return { data: { number_of_seasons: 2 }, error: null };
      });

      await refreshStaleWatchingShows();

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(10);
    });
  });

  describe('refreshShowMetadata TMDB failure', () => {
    it('does not update metadata_refreshed_at on TMDB failure', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [{ id: 'utv-1', tmdb_id: 101, name: 'Test', poster_path: null, number_of_seasons: 1, number_of_episodes: 8, metadata_refreshed_at: null }], error: null }),
      };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      let fromCallCount = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        fromCallCount++;
        return fromCallCount === 1 ? selectChain : updateChain;
      });
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('network') });

      const count = await refreshStaleWatchingShows();

      expect(count).toBe(0);
      expect(updateChain.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshSingleShow staleness check', () => {
    it('skips fetch when row is fresh (<24h)', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const freshTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h ago
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'utv-1', tmdb_id: 101, name: 'Fresh', poster_path: null, number_of_seasons: 1, number_of_episodes: 8, metadata_refreshed_at: freshTime },
          error: null,
        }),
      };
      (supabase.from as jest.Mock).mockReturnValue(selectChain);

      const result = await refreshSingleShow('utv-1');

      expect(result).toBe(false);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  describe('refreshStaleWatchingShows query scope', () => {
    it('includes watched+Returning Series rows via .or() expression', async () => {
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as jest.Mock).mockReturnValue(selectChain);

      await refreshStaleWatchingShows();

      // First .or() should encode the status scope: watching OR (watched AND Returning Series)
      const orCalls = selectChain.or.mock.calls.map((c: unknown[]) => c[0] as string);
      const statusOr = orCalls.find((s) => s.includes('status.eq.watching'));
      expect(statusOr).toBeDefined();
      expect(statusOr).toContain('status.eq.watched');
      expect(statusOr).toContain('tmdb_status.eq.Returning Series');
      // status='watching' should NOT be an .eq() filter anymore (moved into .or())
      expect(selectChain.eq).not.toHaveBeenCalledWith('status', 'watching');
    });
  });
});
