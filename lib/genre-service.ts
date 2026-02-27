import { supabase } from './supabase';
import type { Genre } from './database.types';

// In-memory cache for genres (they rarely change)
let genreCache: Map<number, Genre> | null = null;
let cachePromise: Promise<Map<number, Genre>> | null = null;

/**
 * Fetch all genres from Supabase and cache them in memory
 */
async function fetchGenres(): Promise<Map<number, Genre>> {
  const { data, error } = await supabase
    .from('genres')
    .select('*');

  if (error) {
    console.error('Failed to fetch genres:', error);
    // Return empty map on error, will fall back to hardcoded
    return new Map();
  }

  const genreMap = new Map<number, Genre>();
  // Use type assertion for the data since TypeScript doesn't infer the table correctly
  const genres = data as Genre[] | null;
  (genres ?? []).forEach((genre) => {
    genreMap.set(genre.id, genre);
  });

  return genreMap;
}

/**
 * Get the genre cache, initializing it if needed
 * Uses singleton pattern to avoid multiple fetches
 */
export async function getGenreCache(): Promise<Map<number, Genre>> {
  if (genreCache) {
    return genreCache;
  }

  // Avoid multiple concurrent fetches
  if (!cachePromise) {
    cachePromise = fetchGenres().then((cache) => {
      genreCache = cache;
      cachePromise = null;
      return cache;
    });
  }

  return cachePromise;
}

/**
 * Get genre name by ID
 * Falls back to hardcoded map if DB fetch fails
 */
export async function getGenreName(genreId: number): Promise<string> {
  const cache = await getGenreCache();
  const genre = cache.get(genreId);

  if (genre) {
    return genre.name;
  }

  // Fallback to hardcoded map (for resilience)
  return FALLBACK_GENRES[genreId] ?? 'Unknown';
}

/**
 * Get primary genre name from an array of genre IDs
 */
export async function getPrimaryGenreName(genreIds: number[]): Promise<string> {
  if (!genreIds?.length) return 'Movie';
  return getGenreName(genreIds[0]);
}

/**
 * Synchronous genre lookup (uses cache, returns fallback if not loaded)
 * Use this when you can't await (e.g., in render functions)
 */
export function getGenreNameSync(genreId: number): string {
  if (genreCache) {
    const genre = genreCache.get(genreId);
    if (genre) return genre.name;
  }
  return FALLBACK_GENRES[genreId] ?? 'Movie';
}

/**
 * Get primary genre name synchronously
 */
export function getPrimaryGenreSync(genreIds: number[]): string {
  if (!genreIds?.length) return 'Movie';
  return getGenreNameSync(genreIds[0]);
}

/**
 * Get all genre names synchronously for an array of genre IDs
 */
export function getGenreNamesByIds(genreIds: number[]): string[] {
  if (!genreIds?.length) return [];
  return genreIds.map(id => getGenreNameSync(id)).filter(name => name !== 'Movie');
}

/**
 * Preload the genre cache (call early in app lifecycle)
 */
export function preloadGenres(): void {
  getGenreCache().catch(console.error);
}

/**
 * Clear the genre cache (for testing or forced refresh)
 */
export function clearGenreCache(): void {
  genreCache = null;
  cachePromise = null;
}

// Hardcoded fallback in case DB is unavailable
const FALLBACK_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  // TV show genres
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};
