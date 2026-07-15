import { matchShows, matchMovies, matchTvTimePayload } from '@/lib/tvtime-import/matcher';
import type { ParsedMovie, ParsedShow, TmdbGateway } from '@/lib/tvtime-import/types';
import type { TMDBMovie } from '@/lib/tmdb.types';

function tmdbMovie(id: number, title: string, release_date: string): TMDBMovie {
  return {
    id,
    title,
    overview: '',
    poster_path: null,
    backdrop_path: null,
    release_date,
    vote_average: 0,
    vote_count: 0,
    genre_ids: [],
  };
}

function show(tvdbId: number, name: string): ParsedShow {
  return { tvdbId, name, followed: true, favorited: false, episodes: [] };
}

function movie(title: string, releaseDate: string | null): ParsedMovie {
  return { title, releaseDate, status: 'watched', watchedAt: null, rewatchCount: 0 };
}

describe('matchShows', () => {
  it('resolves a TVDB id to a TMDB tv id (happy path)', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(async (id) =>
        id === 371572 ? { id: 94997, name: 'House of the Dragon' } : null
      ),
      searchMovie: jest.fn(),
    };

    const result = await matchShows([show(371572, 'House of the Dragon')], gateway);

    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);
    expect(result.matched[0]).toMatchObject({ tvdbId: 371572, tmdbId: 94997, tmdbName: 'House of the Dragon' });
  });

  it('routes shows with no TMDB mapping to unmatched', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(async () => null),
      searchMovie: jest.fn(),
    };
    const result = await matchShows([show(999999, 'Nonexistent')], gateway);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].tvdbId).toBe(999999);
  });

  it('treats a lookup that errors (after retry) as unmatched, not a throw', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(async () => {
        throw new Error('boom');
      }),
      searchMovie: jest.fn(),
    };
    const result = await matchShows([show(1, 'X')], gateway);
    expect(result.unmatched).toHaveLength(1);
  });
});

describe('matchMovies', () => {
  it('confidently matches on exact title + release year', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(),
      searchMovie: jest.fn(async () => [
        tmdbMovie(475557, 'Joker', '2019-10-04'),
        tmdbMovie(123, 'Joker', '2012-01-01'),
      ]),
    };
    const result = await matchMovies([movie('Joker', '2019-10-03')], gateway);
    expect(result.matched).toHaveLength(1);
    expect(result.needsReview).toHaveLength(0);
    expect(result.matched[0]).toMatchObject({ tmdbId: 475557 });
  });

  it('routes an ambiguous match (year mismatch) to needsReview with candidates', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(),
      searchMovie: jest.fn(async () => [
        tmdbMovie(1, 'Joker', '1989-06-23'),
        tmdbMovie(2, 'Joker Rising', '2013-01-01'),
      ]),
    };
    const result = await matchMovies([movie('Joker', '2019-10-03')], gateway);
    expect(result.matched).toHaveLength(0);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0].candidates).toHaveLength(2);
  });

  it('routes a title with no candidates to unmatched', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(),
      searchMovie: jest.fn(async () => []),
    };
    const result = await matchMovies([movie('No Such Film', '2000-01-01')], gateway);
    expect(result.unmatched).toHaveLength(1);
  });

  it('needsReview when the export has no year to confirm against', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(),
      searchMovie: jest.fn(async () => [tmdbMovie(1, 'Heat', '1995-12-15')]),
    };
    const result = await matchMovies([movie('Heat', null)], gateway);
    expect(result.matched).toHaveLength(0);
    expect(result.needsReview).toHaveLength(1);
  });

  it('retries exactly once on a 429 and then succeeds', async () => {
    let calls = 0;
    const searchMovie = jest.fn(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      return [tmdbMovie(475557, 'Joker', '2019-10-04')];
    });
    const gateway: TmdbGateway = { findTvByTvdbId: jest.fn(), searchMovie };

    const result = await matchMovies([movie('Joker', '2019-10-03')], gateway);
    expect(searchMovie).toHaveBeenCalledTimes(2);
    expect(result.matched).toHaveLength(1);
  });

  it('honors the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(),
      searchMovie: jest.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return [];
      }),
    };
    const movies = Array.from({ length: 12 }, (_, i) => movie(`Film ${i}`, '2020-01-01'));
    await matchMovies(movies, gateway, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(gateway.searchMovie).toHaveBeenCalledTimes(12);
  });
});

describe('matchTvTimePayload', () => {
  it('matches shows + movies together and carries warnings through', async () => {
    const gateway: TmdbGateway = {
      findTvByTvdbId: jest.fn(async () => ({ id: 94997, name: 'House of the Dragon' })),
      searchMovie: jest.fn(async () => [tmdbMovie(475557, 'Joker', '2019-10-04')]),
    };
    const result = await matchTvTimePayload(
      {
        shows: [show(371572, 'House of the Dragon')],
        movies: [movie('Joker', '2019-10-03')],
        warnings: ['a prior parse warning'],
      },
      gateway
    );
    expect(result.shows.matched).toHaveLength(1);
    expect(result.movies.matched).toHaveLength(1);
    expect(result.warnings).toEqual(['a prior parse warning']);
  });
});
