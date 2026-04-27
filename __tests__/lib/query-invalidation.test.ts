import { QueryClient } from '@tanstack/react-query';
import { invalidateUserMovieQueries } from '@/lib/query-invalidation';

describe('invalidateUserMovieQueries', () => {
  it('invalidates both userMovies list and watchlist-tmdb-ids on the same QueryClient', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateUserMovieQueries(queryClient);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['userMovies'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['watchlist-tmdb-ids'] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate any other keys', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    invalidateUserMovieQueries(queryClient);

    const calledKeys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    for (const key of calledKeys) {
      expect(['userMovies', 'watchlist-tmdb-ids']).toContain((key as unknown[])[0]);
    }
  });
});
