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
