import { supabase } from './supabase';
import type {
  SearchTvShowsResponse,
  TMDBTvShow,
  TvShowDetailResponse,
  TvShowListType,
  TvShowListResponse,
  SeasonDetailResponse,
  TMDBEpisode,
} from './tmdb.types';
import type {
  UserTvShow,
  UserTvShowInsert,
  UserTvShowUpdate,
  TvShowStatus,
  UserTvShowLike,
  UserTvShowLikeInsert,
  UserEpisodeWatch,
  UserEpisodeWatchInsert,
} from './database.types';
import { getTvShowDetailsWithCache } from './tv-show-cache-service';

// Search TV shows
export async function searchTvShows(
  query: string,
  page: number = 1
): Promise<SearchTvShowsResponse> {
  const { data, error } = await supabase.functions.invoke<SearchTvShowsResponse>(
    'search-tv-shows',
    {
      body: { query, page },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to search TV shows');
  }

  if (!data) {
    throw new Error('No data returned from search');
  }

  return data;
}

// Discover TV shows by genre
export async function discoverTvShowsByGenre(
  genreId: number,
  page: number = 1
): Promise<SearchTvShowsResponse> {
  const { data, error } = await supabase.functions.invoke<SearchTvShowsResponse>(
    'discover-tv-shows',
    {
      body: { genreId, page },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to discover TV shows');
  }

  if (!data) {
    throw new Error('No data returned from discover');
  }

  return data;
}

// Fetch TV show details directly from TMDB (via Edge Function)
async function fetchTvShowDetailsFromTMDB(
  showId: number
): Promise<TvShowDetailResponse> {
  const { data, error } = await supabase.functions.invoke<TvShowDetailResponse>(
    'get-tv-show-details',
    {
      body: { showId },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch TV show details');
  }

  if (!data) {
    throw new Error('No data returned from TV show details');
  }

  return data;
}

// Get TV show details by TMDB ID (cache-first strategy)
export async function getTvShowDetails(
  showId: number
): Promise<TvShowDetailResponse> {
  const { data } = await getTvShowDetailsWithCache(
    showId,
    fetchTvShowDetailsFromTMDB
  );
  return data;
}

// Get TV show list by type (trending, airing_today, on_the_air, top_rated)
export async function getTvShowList(
  type: TvShowListType,
  page: number = 1
): Promise<TvShowListResponse> {
  const { data, error } = await supabase.functions.invoke<TvShowListResponse>(
    'get-tv-show-lists',
    {
      body: { type, page },
    }
  );

  if (error) {
    throw new Error(error.message || `Failed to fetch ${type} TV shows`);
  }

  if (!data) {
    throw new Error('No data returned from TV show list');
  }

  return data;
}

// Get season episodes
export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number
): Promise<SeasonDetailResponse> {
  const { data, error } = await supabase.functions.invoke<SeasonDetailResponse>(
    'get-season-episodes',
    {
      body: { showId, seasonNumber },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch season episodes');
  }

  if (!data) {
    throw new Error('No data returned from season episodes');
  }

  return data;
}

// Fetch user's TV shows
export async function fetchUserTvShows(
  userId: string,
  status?: TvShowStatus
): Promise<UserTvShow[]> {
  let query = supabase
    .from('user_tv_shows')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to fetch TV shows');
  }

  return data ?? [];
}

// Add TV show to user's library
export async function addTvShowToLibrary(
  userId: string,
  show: TMDBTvShow,
  status: TvShowStatus = 'watchlist'
): Promise<UserTvShow> {
  const insertData: UserTvShowInsert = {
    user_id: userId,
    tmdb_id: show.id,
    status,
    name: show.name,
    overview: show.overview || null,
    poster_path: show.poster_path,
    backdrop_path: show.backdrop_path,
    first_air_date: show.first_air_date || null,
    vote_average: show.vote_average || null,
    genre_ids: show.genre_ids || [],
  };

  const { data, error } = (await (supabase
    .from('user_tv_shows') as any)
    .upsert(insertData, { onConflict: 'user_id,tmdb_id' })
    .select()
    .single()) as { data: UserTvShow; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to add TV show');
  }

  return data;
}

// Update TV show status
export async function updateTvShowStatus(
  userId: string,
  tmdbId: number,
  status: TvShowStatus
): Promise<UserTvShow> {
  const updateData: UserTvShowUpdate = { status };

  const { data, error } = (await (supabase
    .from('user_tv_shows') as any)
    .update(updateData)
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .select()
    .single()) as { data: UserTvShow; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to update TV show');
  }

  return data;
}

// Remove TV show from library
export async function removeTvShowFromLibrary(userId: string, tmdbId: number): Promise<void> {
  const { error } = await supabase
    .from('user_tv_shows')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId);

  if (error) {
    throw new Error(error.message || 'Failed to remove TV show');
  }
}

// Check if TV show exists in user's library
export async function getTvShowByTmdbId(
  userId: string,
  tmdbId: number
): Promise<UserTvShow | null> {
  const { data, error } = await supabase
    .from('user_tv_shows')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check TV show');
  }

  return data;
}

// Check if TV show is liked by user
export async function getTvShowLike(
  userId: string,
  tmdbId: number
): Promise<UserTvShowLike | null> {
  const { data, error } = await supabase
    .from('user_tv_show_likes')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to check like status');
  }

  return data;
}

// Like a TV show
export async function likeTvShow(
  userId: string,
  show: TMDBTvShow
): Promise<UserTvShowLike> {
  const insertData: UserTvShowLikeInsert = {
    user_id: userId,
    tmdb_id: show.id,
    name: show.name,
    poster_path: show.poster_path,
  };

  const { data, error } = (await (supabase
    .from('user_tv_show_likes') as any)
    .insert(insertData)
    .select()
    .single()) as { data: UserTvShowLike; error: any };

  if (error) {
    if (error.code === '23505') {
      throw new Error('ALREADY_LIKED');
    }
    throw new Error(error.message || 'Failed to like TV show');
  }

  return data;
}

// Unlike a TV show
export async function unlikeTvShow(
  userId: string,
  tmdbId: number
): Promise<void> {
  const { error } = await supabase
    .from('user_tv_show_likes')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId);

  if (error) {
    throw new Error(error.message || 'Failed to unlike TV show');
  }
}

// Mark an episode as watched
export async function markEpisodeWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episode: TMDBEpisode
): Promise<UserEpisodeWatch> {
  const insertData: UserEpisodeWatchInsert = {
    user_id: userId,
    user_tv_show_id: userTvShowId,
    tmdb_show_id: tmdbShowId,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    episode_name: episode.name,
    episode_runtime: episode.runtime,
    still_path: episode.still_path,
    watched_at: new Date().toISOString(),
  };

  const { data, error } = (await (supabase
    .from('user_episode_watches') as any)
    .insert(insertData)
    .select()
    .single()) as { data: UserEpisodeWatch; error: any };

  if (error) {
    throw new Error(error.message || 'Failed to mark episode as watched');
  }

  // Sync TV show progress
  await supabase.rpc('sync_tv_show_progress', { p_user_tv_show_id: userTvShowId });

  return data;
}

// Unmark an episode as watched
export async function unmarkEpisodeWatched(
  userId: string,
  userTvShowId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<void> {
  const { error } = await supabase
    .from('user_episode_watches')
    .delete()
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('season_number', seasonNumber)
    .eq('episode_number', episodeNumber);

  if (error) {
    throw new Error(error.message || 'Failed to unmark episode');
  }

  // Sync TV show progress
  await supabase.rpc('sync_tv_show_progress', { p_user_tv_show_id: userTvShowId });
}

// Mark an entire season as watched
export async function markSeasonWatched(
  userId: string,
  userTvShowId: string,
  tmdbShowId: number,
  episodes: TMDBEpisode[]
): Promise<void> {
  const insertData: UserEpisodeWatchInsert[] = episodes.map((episode) => ({
    user_id: userId,
    user_tv_show_id: userTvShowId,
    tmdb_show_id: tmdbShowId,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    episode_name: episode.name,
    episode_runtime: episode.runtime,
    still_path: episode.still_path,
    watched_at: new Date().toISOString(),
  }));

  const { error } = await (supabase
    .from('user_episode_watches') as any)
    .upsert(insertData, { onConflict: 'user_id,tmdb_show_id,season_number,episode_number', ignoreDuplicates: true });

  if (error) {
    throw new Error(error.message || 'Failed to mark season as watched');
  }

  // Sync TV show progress
  await supabase.rpc('sync_tv_show_progress', { p_user_tv_show_id: userTvShowId });
}

// Unmark an entire season as watched
export async function unmarkSeasonWatched(
  userId: string,
  userTvShowId: string,
  seasonNumber: number
): Promise<void> {
  const { error } = await supabase
    .from('user_episode_watches')
    .delete()
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('season_number', seasonNumber);

  if (error) {
    throw new Error(error.message || 'Failed to unmark season');
  }

  // Sync TV show progress
  await supabase.rpc('sync_tv_show_progress', { p_user_tv_show_id: userTvShowId });
}

// Get watched episodes for a specific season
export async function getWatchedEpisodes(
  userId: string,
  userTvShowId: string,
  seasonNumber: number
): Promise<UserEpisodeWatch[]> {
  const { data, error } = await supabase
    .from('user_episode_watches')
    .select('*')
    .eq('user_id', userId)
    .eq('user_tv_show_id', userTvShowId)
    .eq('season_number', seasonNumber);

  if (error) {
    throw new Error(error.message || 'Failed to fetch watched episodes');
  }

  return data ?? [];
}
