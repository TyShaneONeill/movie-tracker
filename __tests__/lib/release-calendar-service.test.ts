// Mock supabase before importing the service
jest.mock('@/lib/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn(),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
      auth: { getUser: jest.fn() },
    },
    __chain: chain,
  };
});

import { supabase } from '@/lib/supabase';
import { getReleaseCalendar } from '@/lib/release-calendar-service';

const chain = (jest.requireMock('@/lib/supabase') as { __chain: {
  select: jest.Mock; eq: jest.Mock; gte: jest.Mock; lte: jest.Mock; not: jest.Mock; order: jest.Mock;
} }).__chain;

describe('getReleaseCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries release_calendar with correct month range + region + null filter', async () => {
    chain.order.mockResolvedValueOnce({ data: [], error: null });

    await getReleaseCalendar(4, 2026, 'US');

    expect(supabase.from).toHaveBeenCalledWith('release_calendar');
    expect(chain.eq).toHaveBeenCalledWith('region', 'US');
    expect(chain.gte).toHaveBeenCalledWith('release_date', '2026-04-01');
    expect(chain.lte).toHaveBeenCalledWith('release_date', '2026-04-30');
    expect(chain.not).toHaveBeenCalledWith('title', 'is', null);
    expect(chain.order).toHaveBeenCalledWith('release_date', { ascending: true });
  });

  it('groups rows by date into days', async () => {
    chain.order.mockResolvedValueOnce({
      data: [
        { tmdb_id: 1, title: 'Movie A', poster_path: '/a.jpg', backdrop_path: null, genre_ids: [28], vote_average: 7.5, release_type: 3, release_date: '2026-04-29', certification: 'PG-13' },
        { tmdb_id: 2, title: 'Movie B', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 3, release_date: '2026-04-29', certification: null },
        { tmdb_id: 3, title: 'Movie C', poster_path: '/c.jpg', backdrop_path: null, genre_ids: [18], vote_average: 8.1, release_type: 6, release_date: '2026-04-30', certification: null },
      ],
      error: null,
    });

    const result = await getReleaseCalendar(4, 2026);

    expect(result.days).toHaveLength(2);
    expect(result.days[0].date).toBe('2026-04-29');
    expect(result.days[0].releases).toHaveLength(2);
    expect(result.days[0].releases.map((r) => r.tmdb_id)).toEqual([1, 2]);
    expect(result.days[1].date).toBe('2026-04-30');
    expect(result.days[1].releases[0].tmdb_id).toBe(3);
    expect(result.dates_with_releases).toEqual(['2026-04-29', '2026-04-30']);
    expect(result.total_results).toBe(3);
  });

  it('maps release_type integer to human label', async () => {
    chain.order.mockResolvedValueOnce({
      data: [
        { tmdb_id: 1, title: 'Theatrical', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 3, release_date: '2026-04-29', certification: null },
        { tmdb_id: 2, title: 'Digital', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 4, release_date: '2026-04-29', certification: null },
        { tmdb_id: 3, title: 'TV', poster_path: null, backdrop_path: null, genre_ids: [], vote_average: 0, release_type: 6, release_date: '2026-04-29', certification: null },
      ],
      error: null,
    });

    const result = await getReleaseCalendar(4, 2026);
    const labels = result.days[0].releases.map((r) => r.release_type_label);
    expect(labels).toEqual(['Theatrical', 'Digital', 'TV']);
  });

  it('throws when supabase returns an error', async () => {
    chain.order.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(getReleaseCalendar(4, 2026)).rejects.toThrow('boom');
  });

  it('returns empty days when no rows returned', async () => {
    chain.order.mockResolvedValueOnce({ data: [], error: null });
    const result = await getReleaseCalendar(4, 2026);
    expect(result.days).toEqual([]);
    expect(result.dates_with_releases).toEqual([]);
    expect(result.total_results).toBe(0);
  });

  it('coalesces null vote_average and genre_ids to defaults', async () => {
    // TMDB sometimes omits these fields; warming worker passes null through
    // (schema is nullable). Client defaults to 0 and [] at render time.
    chain.order.mockResolvedValueOnce({
      data: [
        { tmdb_id: 1, title: 'Unrated Movie', poster_path: null, backdrop_path: null, genre_ids: null, vote_average: null, release_type: 3, release_date: '2026-04-29' },
      ],
      error: null,
    });

    const result = await getReleaseCalendar(4, 2026);
    expect(result.days[0].releases[0].genre_ids).toEqual([]);
    expect(result.days[0].releases[0].vote_average).toBe(0);
  });
});
