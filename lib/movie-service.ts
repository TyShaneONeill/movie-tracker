import { supabase } from './supabase';
import type { SearchMoviesResponse, TMDBMovie, SearchType, MovieDetailResponse, MovieListType, MovieListResponse } from './tmdb.types';
import type { UserMovie, UserMovieInsert, UserMovieUpdate, MovieStatus, UserMovieLike, UserMovieLikeInsert, JourneyUpdate } from './database.types';
import { getMovieDetailsWithCache } from './movie-cache-service';

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

// Fetch movie details directly from TMDB (via Edge Function)
async function fetchMovieDetailsFromTMDB(
  movieId: number
): Promise<MovieDetailResponse> {
  const { data, error } = await supabase.functions.invoke<MovieDetailResponse>(
    'get-movie-details',
    {
      body: { movieId },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch movie details');
  }

  if (!data) {
    throw new Error('No data returned from movie details');
  }

  return data;
}

// Get movie details by TMDB ID (cache-first strategy)
// Checks Supabase cache first, falls back to TMDB if not cached or stale
export async function getMovieDetails(
  movieId: number
): Promise<MovieDetailResponse> {
  const { data } = await getMovieDetailsWithCache(
    movieId,
    fetchMovieDetailsFromTMDB
  );
  return data;
}

// Get movie list by type (trending, now_playing, upcoming)
export async function getMovieList(
  type: MovieListType,
  page: number = 1
): Promise<MovieListResponse> {
  const { data, error } = await supabase.functions.invoke<MovieListResponse>(
    'get-movie-lists',
    {
      body: { type, page },
    }
  );

  if (error) {
    throw new Error(error.message || `Failed to fetch ${type} movies`);
  }

  if (!data) {
    throw new Error('No data returned from movie list');
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

// Check if movie is liked by user
export async function getMovieLike(
  userId: string,
  tmdbId: number
): Promise<UserMovieLike | null> {
  const { data, error } = await supabase
    .from('user_movie_likes')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check like status');
  }

  return data;
}

// Like a movie (add to likes table)
export async function likeMovie(
  userId: string,
  movie: TMDBMovie
): Promise<UserMovieLike> {
  const insertData: UserMovieLikeInsert = {
    user_id: userId,
    tmdb_id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
  };

  const { data, error } = (await (supabase
    .from('user_movie_likes') as any)
    .insert(insertData)
    .select()
    .single()) as { data: UserMovieLike; error: any };

  if (error) {
    if (error.code === '23505') {
      throw new Error('ALREADY_LIKED');
    }
    throw new Error(error.message || 'Failed to like movie');
  }

  return data;
}

// Unlike a movie (remove from likes table)
export async function unlikeMovie(
  userId: string,
  tmdbId: number
): Promise<void> {
  const { error } = await supabase
    .from('user_movie_likes')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId);

  if (error) {
    throw new Error(error.message || 'Failed to unlike movie');
  }
}

// Fetch a single journey by its user_movies.id
export async function fetchJourneyById(
  journeyId: string
): Promise<UserMovie | null> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('id', journeyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch journey');
  }

  return data;
}

// Update journey fields
export async function updateJourney(
  journeyId: string,
  data: JourneyUpdate
): Promise<UserMovie> {
  const updateData: UserMovieUpdate = {
    ...data,
    journey_updated_at: new Date().toISOString(),
  };

  const { data: updatedJourney, error } = (await (supabase
    .from('user_movies') as any)
    .update(updateData)
    .eq('id', journeyId)
    .select()
    .single()) as { data: UserMovie; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update journey');
  }

  return updatedJourney;
}

// Delete a journey record and clean up associated storage files
export async function deleteJourney(journeyId: string): Promise<void> {
  // First, fetch the journey to get user_id and check for AI art
  const { data: journey, error: fetchError } = await supabase
    .from('user_movies')
    .select('user_id, ai_poster_url')
    .eq('id', journeyId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message || 'Failed to fetch journey for deletion');
  }

  // If there's an AI poster stored in Supabase Storage, delete it
  if (journey?.ai_poster_url && journey.ai_poster_url.includes('/storage/')) {
    const filePath = `${journey.user_id}/${journeyId}.png`;
    const { error: storageError } = await supabase.storage
      .from('journey-art')
      .remove([filePath]);

    if (storageError) {
      // Log but don't fail the deletion - orphaned files are less critical
      console.warn('Failed to delete AI art from storage:', storageError);
    }
  }

  // Delete the database record
  const { error } = await supabase
    .from('user_movies')
    .delete()
    .eq('id', journeyId);

  if (error) {
    throw new Error(error.message || 'Failed to delete journey');
  }
}

// Fetch all journeys for a specific movie (for rewatches)
export async function fetchJourneysByTmdbId(
  userId: string,
  tmdbId: number
): Promise<UserMovie[]> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('status', 'watched')
    .order('journey_number', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch journeys');
  }

  return data ?? [];
}

// Create a new journey for an existing movie (rewatch)
export async function createNewJourney(
  userId: string,
  existingJourney: UserMovie
): Promise<UserMovie> {
  // First, get all existing journeys to determine the next journey number
  const existingJourneys = await fetchJourneysByTmdbId(userId, existingJourney.tmdb_id);
  const maxJourneyNumber = existingJourneys.reduce(
    (max, j) => Math.max(max, j.journey_number || 1),
    0
  );

  const insertData: UserMovieInsert = {
    user_id: userId,
    tmdb_id: existingJourney.tmdb_id,
    status: 'watched',
    title: existingJourney.title,
    overview: existingJourney.overview,
    poster_path: existingJourney.poster_path,
    backdrop_path: existingJourney.backdrop_path,
    release_date: existingJourney.release_date,
    vote_average: existingJourney.vote_average,
    genre_ids: existingJourney.genre_ids,
    journey_number: maxJourneyNumber + 1,
    journey_created_at: new Date().toISOString(),
  };

  const { data, error } = (await (supabase
    .from('user_movies') as any)
    .insert(insertData)
    .select()
    .single()) as { data: UserMovie; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to create new journey');
  }

  return data;
}
