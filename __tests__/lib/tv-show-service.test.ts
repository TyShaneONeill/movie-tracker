import { mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/tv-show-cache-service', () => ({
  getTvShowDetailsWithCache: jest.fn(),
}));

import {
  searchTvShows,
  discoverTvShowsByGenre,
  getTvShowDetails,
  getTvShowList,
  getSeasonEpisodes,
  fetchUserTvShows,
  addTvShowToLibrary,
  updateTvShowStatus,
  removeTvShowFromLibrary,
  getTvShowByTmdbId,
  getTvShowLike,
  likeTvShow,
  unlikeTvShow,
  markEpisodeWatched,
  unmarkEpisodeWatched,
  markSeasonWatched,
  getWatchedEpisodes,
} from '@/lib/tv-show-service';
import { supabase } from '@/lib/supabase';
import { getTvShowDetailsWithCache } from '@/lib/tv-show-cache-service';
import type { UserTvShow, UserTvShowLike, UserEpisodeWatch } from '@/lib/database.types';
import type { TMDBTvShow, TvShowDetailResponse, TMDBEpisode } from '@/lib/tmdb.types';

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = (supabase as any).rpc as jest.Mock;

// ============================================================================
// Shared Constants & Helpers
// ============================================================================

const USER_ID = 'user-abc-123';
const USER_TV_SHOW_ID = 'user-tv-show-uuid-1';
const TMDB_ID = 1399;

function makeTMDBTvShow(overrides: Partial<TMDBTvShow> = {}): TMDBTvShow {
  return {
    id: TMDB_ID,
    name: 'Breaking Bad',
    overview: 'A high school chemistry teacher turned meth producer.',
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    vote_count: 12000,
    genre_ids: [18, 80],
    origin_country: ['US'],
    original_language: 'en',
    popularity: 150.0,
    ...overrides,
  };
}

function makeUserTvShow(overrides: Partial<UserTvShow> = {}): UserTvShow {
  return {
    id: USER_TV_SHOW_ID,
    user_id: USER_ID,
    tmdb_id: TMDB_ID,
    name: 'Breaking Bad',
    overview: 'A high school chemistry teacher turned meth producer.',
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    first_air_date: '2008-01-20',
    vote_average: 8.9,
    genre_ids: [18, 80],
    status: 'watchlist',
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_liked: null,
    current_season: null,
    current_episode: null,
    episodes_watched: null,
    number_of_seasons: null,
    number_of_episodes: null,
    started_watching_at: null,
    finished_at: null,
    user_rating: null,
    ...overrides,
  };
}

function makeTMDBEpisode(overrides: Partial<TMDBEpisode> = {}): TMDBEpisode {
  return {
    id: 62085,
    episode_number: 1,
    season_number: 1,
    name: 'Pilot',
    overview: 'Walter White is diagnosed with cancer.',
    air_date: '2008-01-20',
    runtime: 58,
    still_path: '/still.jpg',
    vote_average: 8.5,
    vote_count: 500,
    guest_stars: [],
    ...overrides,
  };
}

function makeUserEpisodeWatch(overrides: Partial<UserEpisodeWatch> = {}): UserEpisodeWatch {
  return {
    id: 'watch-uuid-1',
    user_id: USER_ID,
    user_tv_show_id: USER_TV_SHOW_ID,
    tmdb_show_id: TMDB_ID,
    season_number: 1,
    episode_number: 1,
    episode_name: 'Pilot',
    episode_runtime: 58,
    still_path: '/still.jpg',
    watched_at: '2024-06-15T00:00:00Z',
    created_at: '2024-06-15T00:00:00Z',
    notes: null,
    watch_number: null,
    ...overrides,
  };
}

function makeTvShowDetailResponse(): TvShowDetailResponse {
  return {
    show: {
      id: TMDB_ID, name: 'Breaking Bad', overview: 'A tale',
      poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg',
      first_air_date: '2008-01-20', last_air_date: '2013-09-29',
      vote_average: 8.9, vote_count: 12000,
      genre_ids: [18], genres: [{ id: 18, name: 'Drama' }],
      tagline: 'All Hail the King', status: 'Ended', type: 'Scripted',
      in_production: false, number_of_seasons: 5, number_of_episodes: 62,
      episode_run_time: [45, 47],
      networks: [{ id: 174, name: 'AMC', logo_path: '/amc.png' }],
      created_by: [{ id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }],
      seasons: [], original_language: 'en', origin_country: ['US'],
    },
    cast: [], crew: [], trailer: null,
    watchProviders: {}, seasons: [], recommendations: [],
  };
}

/** Set up mockFrom to return a Supabase query chain with the given result. */
function setupQueryChain(result: { data: unknown; error: unknown }) {
  const chain = mockSupabaseQuery(result);
  mockFrom.mockReturnValue(chain);
  return chain;
}

/** Assert that sync_tv_show_progress RPC was called for the user TV show. */
function expectSyncProgressRpc() {
  expect(mockRpc).toHaveBeenCalledWith('sync_tv_show_progress', {
    p_user_tv_show_id: USER_TV_SHOW_ID,
  });
}

/**
 * Shared error-handling tests for edge function wrappers.
 * Each edge function follows the same pattern: error.message -> fallback -> null data.
 */
function describeEdgeFunctionErrors(
  callFn: () => Promise<unknown>,
  fallbackMessage: string,
  nullDataMessage: string,
) {
  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Network fail' } });
    await expect(callFn()).rejects.toThrow('Network fail');
  });

  it('throws fallback message when error has no message', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });
    await expect(callFn()).rejects.toThrow(fallbackMessage);
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    await expect(callFn()).rejects.toThrow(nullDataMessage);
  });
}

/**
 * Shared error-handling tests for database operations (supabase.from() pattern).
 */
function describeDbErrors(
  callFn: () => Promise<unknown>,
  fallbackMessage: string,
) {
  it('throws on error', async () => {
    setupQueryChain({ data: null, error: { message: 'DB error' } });
    await expect(callFn()).rejects.toThrow('DB error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: {} });
    await expect(callFn()).rejects.toThrow(fallbackMessage);
  });
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

// ----------------------------------------------------------------------------
// Edge Function wrappers (functions.invoke pattern)
// ----------------------------------------------------------------------------

describe('searchTvShows', () => {
  const response = { shows: [makeTMDBTvShow()], page: 1, totalPages: 5, totalResults: 100 };

  it('returns search results on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await searchTvShows('breaking', 1);

    expect(mockInvoke).toHaveBeenCalledWith('search-tv-shows', {
      body: { query: 'breaking', page: 1 },
    });
    expect(result).toEqual(response);
  });

  it('uses default page=1', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });
    await searchTvShows('breaking');
    expect(mockInvoke).toHaveBeenCalledWith('search-tv-shows', {
      body: { query: 'breaking', page: 1 },
    });
  });

  describeEdgeFunctionErrors(
    () => searchTvShows('breaking'),
    'Failed to search TV shows',
    'No data returned from search',
  );
});

describe('discoverTvShowsByGenre', () => {
  const response = { shows: [makeTMDBTvShow()], page: 1, totalPages: 3, totalResults: 60 };

  it('returns discover results on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await discoverTvShowsByGenre(18, 2);

    expect(mockInvoke).toHaveBeenCalledWith('discover-tv-shows', {
      body: { genreId: 18, page: 2 },
    });
    expect(result).toEqual(response);
  });

  it('defaults page to 1', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });
    await discoverTvShowsByGenre(18);
    expect(mockInvoke).toHaveBeenCalledWith('discover-tv-shows', {
      body: { genreId: 18, page: 1 },
    });
  });

  describeEdgeFunctionErrors(
    () => discoverTvShowsByGenre(18),
    'Failed to discover TV shows',
    'No data returned from discover',
  );
});

describe('getTvShowList', () => {
  const response = { shows: [makeTMDBTvShow()], page: 1, totalPages: 1, totalResults: 1 };

  it('returns TV show list on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await getTvShowList('trending', 2);

    expect(mockInvoke).toHaveBeenCalledWith('get-tv-show-lists', {
      body: { type: 'trending', page: 2 },
    });
    expect(result).toEqual(response);
  });

  it('defaults page to 1', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });
    await getTvShowList('airing_today');
    expect(mockInvoke).toHaveBeenCalledWith('get-tv-show-lists', {
      body: { type: 'airing_today', page: 1 },
    });
  });

  test.each([
    ['trending', 'Failed to fetch trending TV shows'],
    ['top_rated', 'Failed to fetch top_rated TV shows'],
    ['airing_today', 'Failed to fetch airing_today TV shows'],
  ] as const)('throws fallback with type "%s" in message', async (type, expected) => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });
    await expect(getTvShowList(type)).rejects.toThrow(expected);
  });

  it('throws on invoke error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Server error' } });
    await expect(getTvShowList('trending')).rejects.toThrow('Server error');
  });

  it('throws when data is null', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    await expect(getTvShowList('trending')).rejects.toThrow('No data returned from TV show list');
  });
});

describe('getTvShowDetails', () => {
  it('delegates to getTvShowDetailsWithCache and returns data', async () => {
    const tvShowDetail = makeTvShowDetailResponse();
    (getTvShowDetailsWithCache as jest.Mock).mockResolvedValue({ data: tvShowDetail });

    const result = await getTvShowDetails(TMDB_ID);

    expect(getTvShowDetailsWithCache).toHaveBeenCalledWith(TMDB_ID, expect.any(Function));
    expect(result).toEqual(tvShowDetail);
  });
});

describe('getSeasonEpisodes', () => {
  const response = {
    episodes: [makeTMDBEpisode()],
    seasonNumber: 1,
    name: 'Season 1',
    overview: 'The first season.',
    posterPath: '/season1.jpg',
  };

  it('returns season episodes on success', async () => {
    mockInvoke.mockResolvedValue({ data: response, error: null });

    const result = await getSeasonEpisodes(TMDB_ID, 1);

    expect(mockInvoke).toHaveBeenCalledWith('get-season-episodes', {
      body: { showId: TMDB_ID, seasonNumber: 1 },
    });
    expect(result).toEqual(response);
  });

  describeEdgeFunctionErrors(
    () => getSeasonEpisodes(TMDB_ID, 1),
    'Failed to fetch season episodes',
    'No data returned from season episodes',
  );
});

// ----------------------------------------------------------------------------
// Database operations (supabase.from() pattern)
// ----------------------------------------------------------------------------

describe('fetchUserTvShows', () => {
  it('returns user TV shows ordered by added_at desc', async () => {
    const shows = [makeUserTvShow()];
    const chain = setupQueryChain({ data: shows, error: null });

    const result = await fetchUserTvShows(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_shows');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.order).toHaveBeenCalledWith('added_at', { ascending: false });
    expect(result).toEqual(shows);
  });

  test.each(['watching', 'watched', 'watchlist'] as const)(
    'filters by status "%s" when provided',
    async (status) => {
      const chain = setupQueryChain({ data: [], error: null });
      await fetchUserTvShows(USER_ID, status);
      expect(chain.eq).toHaveBeenCalledWith('status', status);
    }
  );

  it('returns empty array when data is null', async () => {
    setupQueryChain({ data: null, error: null });
    expect(await fetchUserTvShows(USER_ID)).toEqual([]);
  });

  describeDbErrors(
    () => fetchUserTvShows(USER_ID),
    'Failed to fetch TV shows',
  );
});

describe('addTvShowToLibrary', () => {
  const show = makeTMDBTvShow();
  const upserted = makeUserTvShow({ status: 'watchlist' });

  it('upserts and returns the user TV show', async () => {
    const chain = setupQueryChain({ data: upserted, error: null });

    const result = await addTvShowToLibrary(USER_ID, show);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_shows');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tmdb_id: show.id,
        status: 'watchlist',
        name: show.name,
      }),
      { onConflict: 'user_id,tmdb_id' }
    );
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(upserted);
  });

  test.each([
    [undefined, 'watchlist'],
    ['watching' as const, 'watching'],
    ['watched' as const, 'watched'],
  ])('uses status %s (resolves to "%s")', async (input, expected) => {
    const chain = setupQueryChain({ data: upserted, error: null });
    await addTvShowToLibrary(USER_ID, show, input as any);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected }),
      expect.any(Object)
    );
  });

  describeDbErrors(
    () => addTvShowToLibrary(USER_ID, show),
    'Failed to add TV show',
  );
});

describe('updateTvShowStatus', () => {
  it('updates status by user_id and tmdb_id and returns updated show', async () => {
    const updated = makeUserTvShow({ status: 'watching' });
    const chain = setupQueryChain({ data: updated, error: null });

    const result = await updateTvShowStatus(USER_ID, TMDB_ID, 'watching');

    expect(mockFrom).toHaveBeenCalledWith('user_tv_shows');
    expect(chain.update).toHaveBeenCalledWith({ status: 'watching' });
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(updated);
  });

  describeDbErrors(
    () => updateTvShowStatus(USER_ID, TMDB_ID, 'watching'),
    'Failed to update TV show',
  );
});

describe('removeTvShowFromLibrary', () => {
  it('deletes the TV show by user_id and tmdb_id', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await removeTvShowFromLibrary(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_shows');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
  });

  it('does not throw when no row exists', async () => {
    setupQueryChain({ data: null, error: null });
    await expect(removeTvShowFromLibrary(USER_ID, TMDB_ID)).resolves.toBeUndefined();
  });

  describeDbErrors(
    () => removeTvShowFromLibrary(USER_ID, TMDB_ID),
    'Failed to remove TV show',
  );
});

describe('getTvShowByTmdbId', () => {
  it('returns user TV show when found', async () => {
    const show = makeUserTvShow();
    const chain = setupQueryChain({ data: show, error: null });

    const result = await getTvShowByTmdbId(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_shows');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(show);
  });

  it('returns null when TV show not found', async () => {
    setupQueryChain({ data: null, error: null });
    expect(await getTvShowByTmdbId(USER_ID, 999)).toBeNull();
  });

  describeDbErrors(
    () => getTvShowByTmdbId(USER_ID, TMDB_ID),
    'Failed to check TV show',
  );
});

// ----------------------------------------------------------------------------
// Like operations
// ----------------------------------------------------------------------------

describe('getTvShowLike', () => {
  const like: UserTvShowLike = {
    id: 'like-1', user_id: USER_ID, tmdb_id: TMDB_ID,
    name: 'Breaking Bad', poster_path: '/poster.jpg', created_at: '2024-01-01',
  };

  it('returns like record when found', async () => {
    const chain = setupQueryChain({ data: like, error: null });

    const result = await getTvShowLike(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_show_likes');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual(like);
  });

  it('returns null when not liked', async () => {
    setupQueryChain({ data: null, error: null });
    expect(await getTvShowLike(USER_ID, 999)).toBeNull();
  });

  describeDbErrors(
    () => getTvShowLike(USER_ID, TMDB_ID),
    'Failed to check like status',
  );
});

describe('likeTvShow', () => {
  const show = makeTMDBTvShow();

  it('inserts a like and returns the record', async () => {
    const likeRecord: UserTvShowLike = {
      id: 'like-1', user_id: USER_ID, tmdb_id: TMDB_ID,
      name: 'Breaking Bad', poster_path: show.poster_path, created_at: '2024-01-01',
    };
    const chain = setupQueryChain({ data: likeRecord, error: null });

    const result = await likeTvShow(USER_ID, show);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_show_likes');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID, tmdb_id: show.id,
        name: show.name, poster_path: show.poster_path,
      })
    );
    expect(result).toEqual(likeRecord);
  });

  it('throws ALREADY_LIKED on duplicate (23505)', async () => {
    setupQueryChain({ data: null, error: { code: '23505', message: 'duplicate' } });
    await expect(likeTvShow(USER_ID, show)).rejects.toThrow('ALREADY_LIKED');
  });

  it('throws error message for other errors', async () => {
    setupQueryChain({ data: null, error: { message: 'Insert error' } });
    await expect(likeTvShow(USER_ID, show)).rejects.toThrow('Insert error');
  });

  it('throws fallback message when error has no message', async () => {
    setupQueryChain({ data: null, error: { code: 'OTHER' } });
    await expect(likeTvShow(USER_ID, show)).rejects.toThrow('Failed to like TV show');
  });
});

describe('unlikeTvShow', () => {
  it('deletes the like by user_id and tmdb_id', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await unlikeTvShow(USER_ID, TMDB_ID);

    expect(mockFrom).toHaveBeenCalledWith('user_tv_show_likes');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('tmdb_id', TMDB_ID);
  });

  describeDbErrors(
    () => unlikeTvShow(USER_ID, TMDB_ID),
    'Failed to unlike TV show',
  );
});

// ----------------------------------------------------------------------------
// Episode tracking operations
// ----------------------------------------------------------------------------

describe('markEpisodeWatched', () => {
  const episode = makeTMDBEpisode();
  const watchRecord = makeUserEpisodeWatch();

  it('inserts episode watch and syncs progress', async () => {
    const chain = setupQueryChain({ data: watchRecord, error: null });

    const result = await markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode);

    expect(mockFrom).toHaveBeenCalledWith('user_episode_watches');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        user_tv_show_id: USER_TV_SHOW_ID,
        tmdb_show_id: TMDB_ID,
        season_number: episode.season_number,
        episode_number: episode.episode_number,
        episode_name: episode.name,
        episode_runtime: episode.runtime,
        still_path: episode.still_path,
        watched_at: expect.any(String),
      })
    );
    expect(chain.select).toHaveBeenCalled();
    expect(result).toEqual(watchRecord);
    expectSyncProgressRpc();
  });

  describeDbErrors(
    () => markEpisodeWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episode),
    'Failed to mark episode as watched',
  );
});

describe('unmarkEpisodeWatched', () => {
  it('deletes the episode watch and syncs progress', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await unmarkEpisodeWatched(USER_ID, USER_TV_SHOW_ID, 1, 1);

    expect(mockFrom).toHaveBeenCalledWith('user_episode_watches');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('user_tv_show_id', USER_TV_SHOW_ID);
    expect(chain.eq).toHaveBeenCalledWith('season_number', 1);
    expect(chain.eq).toHaveBeenCalledWith('episode_number', 1);
    expectSyncProgressRpc();
  });

  describeDbErrors(
    () => unmarkEpisodeWatched(USER_ID, USER_TV_SHOW_ID, 1, 1),
    'Failed to unmark episode',
  );
});

describe('markSeasonWatched', () => {
  const episodes = [
    makeTMDBEpisode({ episode_number: 1 }),
    makeTMDBEpisode({ episode_number: 2, id: 62086, name: "Cat's in the Bag..." }),
    makeTMDBEpisode({ episode_number: 3, id: 62087, name: "...And the Bag's in the River" }),
  ];

  it('inserts all episodes for the season and syncs progress', async () => {
    const chain = setupQueryChain({ data: null, error: null });

    await markSeasonWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episodes);

    expect(mockFrom).toHaveBeenCalledWith('user_episode_watches');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.arrayContaining(
        episodes.map((ep) =>
          expect.objectContaining({
            user_id: USER_ID,
            user_tv_show_id: USER_TV_SHOW_ID,
            tmdb_show_id: TMDB_ID,
            episode_number: ep.episode_number,
          })
        )
      )
    );
    expectSyncProgressRpc();
  });

  describeDbErrors(
    () => markSeasonWatched(USER_ID, USER_TV_SHOW_ID, TMDB_ID, episodes),
    'Failed to mark season as watched',
  );
});

describe('getWatchedEpisodes', () => {
  it('returns watched episodes for a season', async () => {
    const watches = [makeUserEpisodeWatch()];
    const chain = setupQueryChain({ data: watches, error: null });

    const result = await getWatchedEpisodes(USER_ID, USER_TV_SHOW_ID, 1);

    expect(mockFrom).toHaveBeenCalledWith('user_episode_watches');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('user_tv_show_id', USER_TV_SHOW_ID);
    expect(chain.eq).toHaveBeenCalledWith('season_number', 1);
    expect(result).toEqual(watches);
  });

  it('returns empty array when data is null', async () => {
    setupQueryChain({ data: null, error: null });
    expect(await getWatchedEpisodes(USER_ID, USER_TV_SHOW_ID, 1)).toEqual([]);
  });

  describeDbErrors(
    () => getWatchedEpisodes(USER_ID, USER_TV_SHOW_ID, 1),
    'Failed to fetch watched episodes',
  );
});
