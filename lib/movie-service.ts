import { supabase } from './supabase';
import type { SearchMoviesResponse, TMDBMovie, SearchType } from './tmdb.types';
import type { UserMovie, UserMovieInsert, UserMovieUpdate, MovieStatus } from './database.types';

// Search movies (title or actor)
export async function searchMovies(
  query: string,
  page: number = 1,
  searchType: SearchType = 'title'
): Promise<SearchMoviesResponse> {
  const { data, error } = await supabase.functions.invoke<SearchMoviesResponse>(
    'search-movies',
    {
      body: { query, page, searchType },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to search movies');
  }

  if (!data) {
    throw new Error('No data returned from search');
  }

  return data;
}

// Fetch user's movies
export async function fetchUserMovies(
  userId: string,
  status?: MovieStatus
): Promise<UserMovie[]> {
  let query = supabase
    .from('user_movies')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch movies');
  }

  return data ?? [];
}

// Add movie to user's library
export async function addMovieToLibrary(
  userId: string,
  movie: TMDBMovie,
  status: MovieStatus = 'watchlist'
): Promise<UserMovie> {
  const insertData: UserMovieInsert = {
    user_id: userId,
    tmdb_id: movie.id,
    status,
    title: movie.title,
    overview: movie.overview || null,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average || null,
    genre_ids: movie.genre_ids || [],
  };

  const { data, error } = (await (supabase
    .from('user_movies') as any)
    .insert(insertData)
    .select()
    .single()) as { data: UserMovie; error: any };

  if (error) {
    // Check for unique constraint violation
    if (error.code === '23505') {
      throw new Error('DUPLICATE');
    }
    throw new Error(error.message || 'Failed to add movie');
  }

  return data;
}

// Update movie status
export async function updateMovieStatus(
  movieId: string,
  status: MovieStatus
): Promise<UserMovie> {
  const updateData: UserMovieUpdate = { status };

  const { data, error } = (await (supabase
    .from('user_movies') as any)
    .update(updateData)
    .eq('id', movieId)
    .select()
    .single()) as { data: UserMovie; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update movie');
  }

  return data;
}

// Remove movie from library
export async function removeMovieFromLibrary(movieId: string): Promise<void> {
  const { error } = await supabase
    .from('user_movies')
    .delete()
    .eq('id', movieId);

  if (error) {
    throw new Error(error.message || 'Failed to remove movie');
  }
}

// Check if movie exists in user's library
export async function getMovieByTmdbId(
  userId: string,
  tmdbId: number
): Promise<UserMovie | null> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check movie');
  }

  return data;
}
