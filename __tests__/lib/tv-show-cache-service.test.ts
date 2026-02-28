import { mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
    },
  },
}));

import {
  getCachedTvShow,
  cacheTvShowData,
  cachedTvShowToDetail,
  getTvShowDetailsWithCache,
} from '@/lib/tv-show-cache-service';
import { supabase } from '@/lib/supabase';
import type { CachedTvShow } from '@/lib/database.types';
import type {
  TMDBTvShowDetail,
  TMDBCastMember,
  TMDBCrewMember,
  TMDBVideo,
  TMDBSeason,
  TvShowDetailResponse,
} from '@/lib/tmdb.types';

const mockFrom = supabase.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;

// ============================================================================
// Shared Constants & Helpers
// ============================================================================

const TMDB_ID = 1399;

// Reusable JSONB fixtures for cast/crew/seasons
const SAMPLE_CAST: TMDBCastMember[] = [
  { id: 17419, name: 'Bryan Cranston', character: 'Walter White', profile_path: '/bc.jpg', order: 0 },
];
const SAMPLE_CREW: TMDBCrewMember[] = [
  { id: 66633, name: 'Vince Gilligan', job: 'Creator', department: 'Writing', profile_path: '/vg.jpg' },
];
const SAMPLE_SEASONS: TMDBSeason[] = [
  { id: 3572, season_number: 1, name: 'Season 1', overview: 'The first season.', poster_path: '/s1.jpg', air_date: '2008-01-20', episode_count: 7, vote_average: 8.3 },
];
const SAMPLE_TRAILER: TMDBVideo = {
  id: 'v1', key: 'HhesaQXLuRY', site: 'YouTube', type: 'Trailer',
  official: true, name: 'Official Trailer', published_at: '2008-01-15',
};

function makeCachedTvShow(overrides: Partial<CachedTvShow> = {}): CachedTvShow {
  return {
    id: 1,
    tmdb_id: TMDB_ID,
    name: 'Breaking Bad',
    original_name: 'Breaking Bad',
    overview: 'A chemistry teacher turned meth producer.',
    tagline: 'All Hail the King',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2008-01-20',
    last_air_date: '2013-09-29',
    tmdb_vote_average: 8.9,
    tmdb_vote_count: 12000,
    tmdb_popularity: null,
    genre_ids: [18, 80],
    trailer_youtube_key: 'HhesaQXLuRY',
    trailer_name: 'Official Trailer',
    cached_cast: SAMPLE_CAST as any,
    cached_crew: SAMPLE_CREW as any,
    cached_seasons: SAMPLE_SEASONS as any,
    status: 'Ended',
    type: 'Scripted',
    in_production: false,
    number_of_seasons: 5,
    number_of_episodes: 62,
    episode_run_time: [45, 47],
    networks: [{ id: 174, name: 'AMC', logo_path: '/amc.png' }],
    created_by: [{ id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }],
    original_language: 'en',
    origin_country: ['US'],
    adult: null,
    tmdb_fetched_at: new Date().toISOString(),
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTMDBTvShowDetail(overrides: Partial<TMDBTvShowDetail> = {}): TMDBTvShowDetail {
  return {
    id: TMDB_ID,
    name: 'Breaking Bad',
    overview: 'A chemistry teacher turned meth producer.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2008-01-20',
    last_air_date: '2013-09-29',
    vote_average: 8.9,
    vote_count: 12000,
    genre_ids: [18, 80],
    genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
    tagline: 'All Hail the King',
    status: 'Ended',
    type: 'Scripted',
    in_production: false,
    number_of_seasons: 5,
    number_of_episodes: 62,
    episode_run_time: [45, 47],
    networks: [{ id: 174, name: 'AMC', logo_path: '/amc.png' }],
    created_by: [{ id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }],
    seasons: [],
    original_language: 'en',
    origin_country: ['US'],
    ...overrides,
  };
}

function makeTvShowDetailResponse(overrides: Partial<TvShowDetailResponse> = {}): TvShowDetailResponse {
  return {
    show: makeTMDBTvShowDetail(),
    cast: SAMPLE_CAST,
    crew: SAMPLE_CREW,
    trailer: SAMPLE_TRAILER,
    watchProviders: {},
    seasons: SAMPLE_SEASONS,
    recommendations: [{ id: 1396, name: 'Better Call Saul', poster_path: '/bcs.jpg', backdrop_path: '/bcsb.jpg', first_air_date: '2015-02-08', vote_average: 8.7, overview: 'A prequel.', genre_ids: [18, 80] }],
    ...overrides,
  };
}

/** Set up mockFrom to return a Supabase query chain with the given result. */
function setupQueryChain(result: { data: unknown; error: unknown }) {
  const chain = mockSupabaseQuery(result);
  mockFrom.mockReturnValue(chain);
  return chain;
}

/** Set up a fresh cache hit scenario. */
function setupFreshCacheHit(overrides: Partial<CachedTvShow> = {}) {
  const cached = makeCachedTvShow({
    tmdb_fetched_at: new Date().toISOString(),
    ...overrides,
  });
  setupQueryChain({ data: cached, error: null });
  return cached;
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
});

// ----------------------------------------------------------------------------
// getCachedTvShow
// ----------------------------------------------------------------------------

describe('getCachedTvShow', () => {
  it('returns cached TV show when found', async () => {
    const cached = makeCachedTvShow();
    const chain = setupQueryChain({ data: cached, error: null });

    const result = await getCachedTvShow(TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('tv_shows');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('returns null when not found (PGRST116)', async () => {
    setupQueryChain({ data: null, error: { code: 'PGRST116' } });
    expect(await getCachedTvShow(TMDB_ID)).toBeNull();
  });

  it('returns null on unexpected errors and logs', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    setupQueryChain({ data: null, error: { code: 'OTHER', message: 'DB error' } });

    expect(await getCachedTvShow(TMDB_ID)).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching cached TV show:', expect.any(Object));
    consoleSpy.mockRestore();
  });
});

// ----------------------------------------------------------------------------
// cacheTvShowData
// ----------------------------------------------------------------------------

describe('cacheTvShowData', () => {
  const showDetail = makeTMDBTvShowDetail();

  it('upserts TV show data with all fields', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await cacheTvShowData(showDetail, SAMPLE_TRAILER, SAMPLE_CAST, SAMPLE_CREW, SAMPLE_SEASONS);

    expect(mockFrom).toHaveBeenCalledWith('tv_shows');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdb_id: showDetail.id,
        name: showDetail.name,
        trailer_youtube_key: SAMPLE_TRAILER.key,
        trailer_name: SAMPLE_TRAILER.name,
        tmdb_fetched_at: expect.any(String),
      }),
      { onConflict: 'tmdb_id' }
    );
  });

  it('handles null trailer', async () => {
    const chain = setupQueryChain({ data: null, error: null });
    await cacheTvShowData(showDetail, null);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ trailer_youtube_key: null, trailer_name: null }),
      expect.any(Object)
    );
  });

  it('handles missing cast/crew/seasons', async () => {
    const chain = setupQueryChain({ data: null, error: null });
    await cacheTvShowData(showDetail);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ cached_cast: null, cached_crew: null, cached_seasons: null }),
      expect.any(Object)
    );
  });

  it('skips caching when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await cacheTvShowData(showDetail, SAMPLE_TRAILER, SAMPLE_CAST, SAMPLE_CREW, SAMPLE_SEASONS);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('logs error but does not throw on upsert failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    setupQueryChain({ data: null, error: { message: 'Upsert failed' } });

    await cacheTvShowData(showDetail, SAMPLE_TRAILER, SAMPLE_CAST, SAMPLE_CREW, SAMPLE_SEASONS);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to cache TV show:', expect.any(Object));
    consoleSpy.mockRestore();
  });
});

// ----------------------------------------------------------------------------
// cachedTvShowToDetail
// ----------------------------------------------------------------------------

describe('cachedTvShowToDetail', () => {
  it('converts cached TV show to TMDBTvShowDetail format', () => {
    const cached = makeCachedTvShow();
    const result = cachedTvShowToDetail(cached);

    // Direct field mappings
    expect(result.id).toBe(cached.tmdb_id);
    expect(result.name).toBe(cached.name);
    expect(result.overview).toBe(cached.overview);
    expect(result.poster_path).toBe(cached.poster_path);
    expect(result.backdrop_path).toBe(cached.backdrop_path);
    expect(result.first_air_date).toBe(cached.first_air_date);
    expect(result.status).toBe(cached.status);
    expect(result.type).toBe(cached.type);
    expect(result.in_production).toBe(cached.in_production);
    expect(result.original_language).toBe(cached.original_language);

    // Renamed fields
    expect(result.vote_average).toBe(cached.tmdb_vote_average);
    expect(result.vote_count).toBe(cached.tmdb_vote_count);

    // Array fields
    expect(result.genre_ids).toEqual(cached.genre_ids);
    expect(result.episode_run_time).toEqual(cached.episode_run_time);
    expect(result.origin_country).toEqual(cached.origin_country);

    // Always empty on cached
    expect(result.genres).toEqual([]);
  });

  it('uses defaults for null fields', () => {
    const nullOverrides: Partial<CachedTvShow> = {
      overview: null, first_air_date: null, tmdb_vote_average: null,
      tmdb_vote_count: null, genre_ids: null, status: null, type: null,
      in_production: null, number_of_seasons: null, number_of_episodes: null,
      episode_run_time: null, original_language: null, origin_country: null,
      networks: null, created_by: null, cached_seasons: null,
    };
    const result = cachedTvShowToDetail(makeCachedTvShow(nullOverrides));

    const expectedDefaults: Record<string, unknown> = {
      overview: '', first_air_date: '', vote_average: 0, vote_count: 0,
      genre_ids: [], status: '', type: '', in_production: false,
      number_of_seasons: 0, number_of_episodes: 0, episode_run_time: [],
      original_language: '', origin_country: [], networks: [],
      created_by: [], seasons: [],
    };

    for (const [key, expected] of Object.entries(expectedDefaults)) {
      expect((result as any)[key]).toEqual(expected);
    }
  });
});

// ----------------------------------------------------------------------------
// getTvShowDetailsWithCache
// ----------------------------------------------------------------------------

describe('getTvShowDetailsWithCache', () => {
  const mockFetchFromTMDB = jest.fn();

  beforeEach(() => {
    mockFetchFromTMDB.mockReset();
  });

  describe('cache hit (fresh data)', () => {
    it('returns cached data without calling TMDB', async () => {
      setupFreshCacheHit();

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.fromCache).toBe(true);
      expect(result.data.show.id).toBe(TMDB_ID);
      expect(result.data.recommendations).toEqual([]);
      expect(result.data.watchProviders).toEqual({});
      expect(mockFetchFromTMDB).not.toHaveBeenCalled();
    });

    it('reconstructs trailer from cached youtube key', async () => {
      setupFreshCacheHit({ trailer_youtube_key: 'abc123', trailer_name: 'Official Trailer' });

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.data.trailer).toEqual({
        id: '', key: 'abc123', site: 'YouTube', type: 'Trailer',
        official: true, name: 'Official Trailer', published_at: '',
      });
    });

    it('returns null trailer when no trailer_youtube_key cached', async () => {
      setupFreshCacheHit({ trailer_youtube_key: null, trailer_name: null });

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.data.trailer).toBeNull();
    });

    it('uses default trailer name when trailer_name is null', async () => {
      setupFreshCacheHit({ trailer_youtube_key: 'xyz789', trailer_name: null });

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.data.trailer!.name).toBe('Trailer');
    });

    it('reconstructs cast, crew, seasons from cached JSONB', async () => {
      const cast = [{ id: 1, name: 'Actor', character: 'Role', profile_path: '/a.jpg', order: 0 }];
      const crew = [{ id: 2, name: 'Dir', job: 'Director', department: 'Directing', profile_path: '/d.jpg' }];
      const seasons = [{ id: 100, season_number: 1, name: 'S1', overview: '', poster_path: null, air_date: null, episode_count: 10, vote_average: 8.0 }];

      setupFreshCacheHit({
        cached_cast: cast as any,
        cached_crew: crew as any,
        cached_seasons: seasons as any,
      });

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.data.cast).toEqual(cast);
      expect(result.data.crew).toEqual(crew);
      expect(result.data.seasons).toEqual(seasons);
    });
  });

  describe('cache miss (stale/missing data)', () => {
    test.each([
      ['cache is stale (> 30 days)', () => {
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - 31);
        const cached = makeCachedTvShow({ tmdb_fetched_at: staleDate.toISOString() });
        setupQueryChain({ data: cached, error: null });
      }],
      ['no cache exists', () => {
        setupQueryChain({ data: null, error: { code: 'PGRST116' } });
      }],
      ['tmdb_fetched_at is null', () => {
        const cached = makeCachedTvShow({ tmdb_fetched_at: null });
        setupQueryChain({ data: cached, error: null });
      }],
    ])('fetches from TMDB when %s', async (_label, setupFn) => {
      setupFn();
      const tmdbResponse = makeTvShowDetailResponse();
      mockFetchFromTMDB.mockResolvedValue(tmdbResponse);

      const result = await getTvShowDetailsWithCache(TMDB_ID, mockFetchFromTMDB);

      expect(result.fromCache).toBe(false);
      expect(result.data).toEqual(tmdbResponse);
      expect(mockFetchFromTMDB).toHaveBeenCalledWith(TMDB_ID);
    });
  });
});
