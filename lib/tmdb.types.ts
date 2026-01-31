// Movie list type for different TMDB endpoints
export type MovieListType = 'trending' | 'now_playing' | 'upcoming';

// Response from movie list endpoints
export interface MovieListResponse {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  dates?: { minimum: string; maximum: string };
}

// Genre lookup - uses local Supabase cache with hardcoded fallback
// Import the sync version for use in render functions
import { getPrimaryGenreSync } from './genre-service';

// Re-export for backwards compatibility
export const getPrimaryGenre = getPrimaryGenreSync;

// Hardcoded fallback map (kept for reference, actual lookup uses genre-service)
export const TMDB_GENRE_MAP: Record<number, string> = {
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
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

// TMDB Movie from API response
export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

// Actor info returned from actor search
export interface TMDBActor {
  id: number;
  name: string;
  profile_path: string | null;
}

// Search type for toggling between title and actor search
export type SearchType = 'title' | 'actor';

// Response from our Edge Function
export interface SearchMoviesResponse {
  movies: TMDBMovie[];
  page: number;
  totalPages: number;
  totalResults: number;
  actor?: TMDBActor; // Present when searchType is 'actor'
}

// Extended movie detail with cast info
export interface TMDBMovieDetail {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  runtime: number | null;
  genres: { id: number; name: string }[];
  tagline: string | null;
}

// Cast member in movie credits
export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

// Response from get-movie-details Edge Function
export interface MovieDetailResponse {
  movie: TMDBMovieDetail;
  cast: TMDBCastMember[];
}

// TMDB image URL helpers
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export type TMDBImageSize =
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'original';

export function getTMDBImageUrl(
  path: string | null,
  size: TMDBImageSize = 'w342'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}
