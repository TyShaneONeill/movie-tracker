import { supabase } from './supabase';
import type { CachedMovie, CachedMovieInsert } from './database.types';
import type { MovieDetailResponse, TMDBMovieDetail } from './tmdb.types';

// Cache staleness threshold (30 days in milliseconds)
const CACHE_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a cached movie is still fresh (less than 30 days old)
 */
function isCacheFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;

  const fetchedDate = new Date(fetchedAt);
  const now = new Date();
  const ageMs = now.getTime() - fetchedDate.getTime();

  return ageMs < CACHE_STALE_THRESHOLD_MS;
}

/**
 * Fetch movie from local cache by TMDB ID
 */
export async function getCachedMovie(tmdbId: number): Promise<CachedMovie | null> {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .single();

  if (error) {
    // PGRST116 = not found, which is expected for uncached movies
    if (error.code !== 'PGRST116') {
      console.error('Error fetching cached movie:', error);
    }
    return null;
  }

  return data as CachedMovie;
}

/**
 * Check if we have a fresh cached version of a movie
 */
export async function hasFreshCache(tmdbId: number): Promise<boolean> {
  const cached = await getCachedMovie(tmdbId);
  return cached !== null && isCacheFresh(cached.tmdb_fetched_at);
}

/**
 * Upsert movie data to the cache
 * This is async and non-blocking - caller doesn't need to wait
 */
export async function cacheMovieData(
  movieDetail: TMDBMovieDetail
): Promise<void> {
  // Skip caching if user is not authenticated (e.g., guest mode)
  // RLS policies only allow authenticated users to INSERT/UPDATE
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return;
  }

  const insertData: CachedMovieInsert = {
    tmdb_id: movieDetail.id,
    title: movieDetail.title,
    original_title: movieDetail.title, // TMDB returns same field for basic detail
    tagline: movieDetail.tagline,
    overview: movieDetail.overview,
    release_date: movieDetail.release_date || null,
    runtime_minutes: movieDetail.runtime,
    tmdb_vote_average: movieDetail.vote_average,
    tmdb_vote_count: movieDetail.vote_count,
    genre_ids: movieDetail.genre_ids,
    poster_path: movieDetail.poster_path,
    backdrop_path: movieDetail.backdrop_path,
    tmdb_fetched_at: new Date().toISOString(),
  };

  // Use type assertion for the upsert operation
  const { error } = await (supabase
    .from('movies') as ReturnType<typeof supabase.from>)
    .upsert(insertData as Record<string, unknown>, {
      onConflict: 'tmdb_id',
    });

  if (error) {
    // Log but don't throw - caching failures shouldn't break the app
    console.error('Failed to cache movie:', error);
  }
}

/**
 * Convert cached movie to TMDB movie detail format
 * This ensures compatibility with existing UI components
 */
export function cachedMovieToTMDBDetail(cached: CachedMovie): TMDBMovieDetail {
  return {
    id: cached.tmdb_id,
    title: cached.title,
    overview: cached.overview ?? '',
    poster_path: cached.poster_path,
    backdrop_path: cached.backdrop_path,
    release_date: cached.release_date ?? '',
    vote_average: cached.tmdb_vote_average ?? 0,
    vote_count: cached.tmdb_vote_count ?? 0,
    genre_ids: cached.genre_ids ?? [],
    runtime: cached.runtime_minutes,
    genres: [], // Will be populated from genres table if needed
    tagline: cached.tagline,
  };
}

/**
 * Get movie details with cache-first strategy
 *
 * 1. Check local cache first
 * 2. If cached and fresh (< 30 days), return it
 * 3. Otherwise fetch from TMDB
 * 4. Cache the result async (don't block)
 * 5. Return TMDB data
 */
export async function getMovieDetailsWithCache(
  tmdbId: number,
  fetchFromTMDB: (id: number) => Promise<MovieDetailResponse>
): Promise<{ data: MovieDetailResponse; fromCache: boolean }> {
  // Step 1: Check local cache
  const cached = await getCachedMovie(tmdbId);

  // Step 2: If cached and fresh, return it
  if (cached && isCacheFresh(cached.tmdb_fetched_at)) {
    return {
      data: {
        movie: cachedMovieToTMDBDetail(cached),
        cast: [], // Cast not cached yet - will need TMDB for full cast
        trailer: null, // Trailer not cached - will need TMDB for trailer
      },
      fromCache: true,
    };
  }

  // Step 3: Fetch from TMDB
  const tmdbData = await fetchFromTMDB(tmdbId);

  // Step 4: Cache the result async (don't wait)
  cacheMovieData(tmdbData.movie).catch((err) =>
    console.error('Background cache failed:', err)
  );

  // Step 5: Return TMDB data
  return {
    data: tmdbData,
    fromCache: false,
  };
}
