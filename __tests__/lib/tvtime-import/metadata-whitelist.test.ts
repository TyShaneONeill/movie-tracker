import { movieMetadata, showMetadata } from '../../../supabase/functions/import-tvtime/metadata';

// The self-heal UPDATE path applies whatever these builders return to an
// existing row. This test locks the whitelist: forbidden columns
// (status / watched_at / source) can NEVER appear, so a re-import can't
// downgrade a watch, clear a timestamp, or relabel a row. The Deno-level DB
// behaviour is additionally covered by the staging before/after proof on the PR.
const FORBIDDEN = ['status', 'watched_at', 'source', 'user_id', 'tmdb_id', 'watched_with'];

describe('metadata whitelist (self-heal safety boundary)', () => {
  it('movieMetadata never emits status/watched_at/source, even if present on input', () => {
    const meta = movieMetadata({
      // legitimate metadata
      posterPath: '/p.jpg',
      backdropPath: '/b.jpg',
      genreIds: [18, 53],
      voteAverage: 7.2,
      releaseDate: '2020-01-01',
      // forbidden fields smuggled in — must be ignored
      status: 'watchlist',
      watched_at: null,
      source: 'malicious',
      overview: 'a very long overview that should be dropped',
    } as never);
    for (const key of FORBIDDEN) expect(meta).not.toHaveProperty(key);
    expect(meta).not.toHaveProperty('overview'); // dropped end-to-end
    expect(meta).toEqual({ poster_path: '/p.jpg', backdrop_path: '/b.jpg', genre_ids: [18, 53], vote_average: 7.2, release_date: '2020-01-01' });
  });

  it('showMetadata never emits status/watched_at/source and includes episode counts', () => {
    const meta = showMetadata({
      posterPath: '/s.jpg',
      genreIds: [10765],
      numberOfEpisodes: 26,
      numberOfSeasons: 3,
      firstAirDate: '2022-08-21',
      voteAverage: 8.3,
      status: 'watching',
      source: 'x',
      overview: 'drop me',
    } as never);
    for (const key of FORBIDDEN) expect(meta).not.toHaveProperty(key);
    expect(meta).not.toHaveProperty('overview');
    expect(meta).toMatchObject({ poster_path: '/s.jpg', number_of_episodes: 26, number_of_seasons: 3, genre_ids: [10765] });
  });

  it('omits absent fields entirely so a heal never nulls an existing value', () => {
    // Only a poster provided — no other key should appear (not even as null).
    expect(movieMetadata({ posterPath: '/only.jpg' } as never)).toEqual({ poster_path: '/only.jpg' });
    expect(showMetadata({} as never)).toEqual({});
  });

  it('drops empty/blank values instead of emitting null keys', () => {
    expect(movieMetadata({ posterPath: '  ', genreIds: [], voteAverage: NaN } as never)).toEqual({});
  });
});
