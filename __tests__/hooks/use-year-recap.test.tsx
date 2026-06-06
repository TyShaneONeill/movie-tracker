import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useYearRecap } from '@/hooks/use-year-recap';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useYearRecap', () => {
  beforeEach(() => mockRpc.mockReset());

  it('maps the RPC payload to typed camelCase with genre names', async () => {
    mockRpc.mockResolvedValue({
      data: {
        year: 2025, films_seen: 3, hours_watched: 310,
        genres: [{ genre_id: 878, count: 2 }],
        tv_shows: 1, episodes_watched: 2, tv_hours: 60,
        formats: [{ format: 'imax', count: 1 }],
        theaters_count: 2, chains_count: 1,
        first_film: { title: 'Alpha', date: '2025-03-01' },
        last_film: { title: 'NYE', date: '2025-12-31' },
        available_years: [2026, 2025],
      },
      error: null,
    });

    const { result } = renderHook(() => useYearRecap(2025), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const r = result.current.data!;
    expect(r.filmsSeen).toBe(3);
    expect(r.hoursWatched).toBe(310);
    expect(r.genres[0].genreName).toBe('Sci-Fi'); // 878 via TMDB_GENRE_MAP
    expect(r.formats[0].format).toBe('imax');
    expect(r.firstFilm?.title).toBe('Alpha');
    expect(r.availableYears).toEqual([2026, 2025]);
    expect(mockRpc).toHaveBeenCalledWith('get_user_year_recap', expect.objectContaining({ p_year: 2025 }));
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useYearRecap(2025), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
