import { supabase } from './supabase';
import type { CachedTvShow, CachedTvShowInsert } from './database.types';
import type { TvShowDetailResponse, TMDBTvShowDetail, TMDBCastMember, TMDBCrewMember, TMDBVideo, TMDBSeason } from './tmdb.types';

// Cache staleness threshold (30 days in milliseconds)
const CACHE_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a cached TV show is still fresh (less than 30 days old)
 */
function isCacheFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;

  const fetchedDate = new Date(fetchedAt);
  const now = new Date();
  const ageMs = now.getTime() - fetchedDate.getTime();

  return ageMs < CACHE_STALE_THRESHOLD_MS;
}

/**
 * Fetch TV show from local cache by TMDB ID
 */
export async function getCachedTvShow(tmdbId: number): Promise<CachedTvShow | null> {
  const { data, error } = await supabase
    .from('tv_shows')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .single();

  if (error) {
    // PGRST116 = not found, which is expected for uncached shows
    if (error.code !== 'PGRST116') {
      console.error('Error fetching cached TV show:', error);
    }
    return null;
  }

  return data as CachedTvShow;
}

/**
 * Upsert TV show data to the cache
 */
export async function cacheTvShowData(
  showDetail: TMDBTvShowDetail,
  trailer?: TMDBVideo | null,
  cast?: TMDBCastMember[],
  crew?: TMDBCrewMember[],
  seasons?: TMDBSeason[]
): Promise<void> {
  // Skip caching if user is not authenticated (e.g., guest mode)
  // RLS policies only allow authenticated users to INSERT/UPDATE
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return;
  }

  const insertData: CachedTvShowInsert = {
    tmdb_id: showDetail.id,
    name: showDetail.name,
    original_name: showDetail.name,
    tagline: showDetail.tagline,
    overview: showDetail.overview,
    first_air_date: showDetail.first_air_date || null,
    last_air_date: showDetail.last_air_date || null,
    tmdb_vote_average: showDetail.vote_average,
    tmdb_vote_count: showDetail.vote_count,
    genre_ids: showDetail.genre_ids,
    poster_path: showDetail.poster_path,
    backdrop_path: showDetail.backdrop_path,
    trailer_youtube_key: trailer?.key ?? null,
    trailer_name: trailer?.name ?? null,
    cached_cast: cast ? JSON.parse(JSON.stringify(cast)) : null,
    cached_crew: crew ? JSON.parse(JSON.stringify(crew)) : null,
    cached_seasons: seasons ? JSON.parse(JSON.stringify(seasons)) : null,
    status: showDetail.status,
    type: showDetail.type,
    in_production: showDetail.in_production,
    number_of_seasons: showDetail.number_of_seasons,
    number_of_episodes: showDetail.number_of_episodes,
    episode_run_time: showDetail.episode_run_time,
    networks: JSON.parse(JSON.stringify(showDetail.networks)),
    created_by: JSON.parse(JSON.stringify(showDetail.created_by)),
    original_language: showDetail.original_language,
    origin_country: showDetail.origin_country,
    tmdb_fetched_at: new Date().toISOString(),
  };

  // Use type assertion for the upsert operation
  const { error } = await (supabase
    .from('tv_shows') as ReturnType<typeof supabase.from>)
    .upsert(insertData as Record<string, unknown>, {
      onConflict: 'tmdb_id',
    });

  if (error) {
    // Log but don't throw - caching failures shouldn't break the app
    console.error('Failed to cache TV show:', error);
  }
}

/**
 * Convert cached TV show to TMDB TV show detail format
 */
export function cachedTvShowToDetail(cached: CachedTvShow): TMDBTvShowDetail {
  return {
    id: cached.tmdb_id,
    name: cached.name,
    overview: cached.overview ?? '',
    poster_path: cached.poster_path,
    backdrop_path: cached.backdrop_path,
    first_air_date: cached.first_air_date ?? '',
    last_air_date: cached.last_air_date ?? null,
    vote_average: cached.tmdb_vote_average ?? 0,
    vote_count: cached.tmdb_vote_count ?? 0,
    genre_ids: cached.genre_ids ?? [],
    genres: [],
    tagline: cached.tagline,
    status: cached.status ?? '',
    type: cached.type ?? '',
    in_production: cached.in_production ?? false,
    number_of_seasons: cached.number_of_seasons ?? 0,
    number_of_episodes: cached.number_of_episodes ?? 0,
    episode_run_time: cached.episode_run_time ?? [],
    networks: (cached.networks as TMDBTvShowDetail['networks']) ?? [],
    created_by: (cached.created_by as TMDBTvShowDetail['created_by']) ?? [],
    seasons: (cached.cached_seasons as unknown as TMDBSeason[]) ?? [],
    original_language: cached.original_language ?? '',
    origin_country: cached.origin_country ?? [],
  };
}

/**
 * Get TV show details with cache-first strategy
 *
 * 1. Check local cache first
 * 2. If cached and fresh (< 30 days), return it
 * 3. Otherwise fetch from TMDB
 * 4. Cache the result async (don't block)
 * 5. Return TMDB data
 */
export async function getTvShowDetailsWithCache(
  tmdbId: number,
  fetchFromTMDB: (id: number) => Promise<TvShowDetailResponse>
): Promise<{ data: TvShowDetailResponse; fromCache: boolean }> {
  // Step 1: Check local cache
  const cached = await getCachedTvShow(tmdbId);

  // Step 2: If cached and fresh, return it
  if (cached && isCacheFresh(cached.tmdb_fetched_at)) {
    const cachedTrailer: TMDBVideo | null = cached.trailer_youtube_key
      ? {
          id: '',
          key: cached.trailer_youtube_key,
          site: 'YouTube',
          type: 'Trailer',
          official: true,
          name: cached.trailer_name ?? 'Trailer',
          published_at: '',
        }
      : null;

    const cachedCast = (cached.cached_cast as TMDBCastMember[] | null) ?? [];
    const cachedCrew = (cached.cached_crew as TMDBCrewMember[] | null) ?? [];
    const cachedSeasons = (cached.cached_seasons as TMDBSeason[] | null) ?? [];

    return {
      data: {
        show: cachedTvShowToDetail(cached),
        cast: cachedCast,
        crew: cachedCrew,
        trailer: cachedTrailer,
        watchProviders: {},
        seasons: cachedSeasons,
      },
      fromCache: true,
    };
  }

  // Step 3: Fetch from TMDB
  const tmdbData = await fetchFromTMDB(tmdbId);

  // Step 4: Cache the result async (don't wait)
  cacheTvShowData(tmdbData.show, tmdbData.trailer, tmdbData.cast, tmdbData.crew, tmdbData.seasons).catch((err) =>
    console.error('Background cache failed:', err)
  );

  // Step 5: Return TMDB data
  return {
    data: tmdbData,
    fromCache: false,
  };
}
