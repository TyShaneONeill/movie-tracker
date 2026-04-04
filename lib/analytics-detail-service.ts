import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export type AnalyticsDetailType =
  | 'movies'
  | 'tv-shows'
  | 'episodes'
  | 'tv-watch-time'
  | 'first-takes'
  | 'ratings'
  | 'monthly'
  | 'genre'
  | 'other-genres';

export interface AnalyticsDetailFilter {
  month?: string;       // YYYY-MM
  genreId?: number;
  otherGenreIds?: number[]; // genre IDs beyond the top 5
}

export interface AnalyticsDetailItem {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string | null;
  mediaType: 'movie' | 'tv';
  /** Formatted date string, or null when no date exists (shows "Add watch date" CTA) */
  primaryMetric: string | null;
  secondaryMetric?: string;
  /** When set, compact view shows this instead of primaryMetric on the right side */
  compactMetric?: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Date unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function extractYear(dateStr: string | null): string | null {
  if (!dateStr || dateStr.length < 4) return null;
  return dateStr.slice(0, 4);
}

function getMonthRange(month: string): { start: string; end: string } {
  const [yearStr, monStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monStr, 10);
  const start = `${month}-01`;
  const endYear = mon === 12 ? year + 1 : year;
  const endMon = mon === 12 ? 1 : mon + 1;
  const end = `${endYear}-${String(endMon).padStart(2, '0')}-01`;
  return { start, end };
}

function sortByDateDesc(
  items: Array<AnalyticsDetailItem & { _sortDate: string }>
): AnalyticsDetailItem[] {
  items.sort((a, b) => b._sortDate.localeCompare(a._sortDate));
  return items.map(({ _sortDate: _, ...item }) => item as AnalyticsDetailItem);
}

// ============================================================================
// Query Functions
// ============================================================================

async function fetchMoviesWatched(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('id, tmdb_id, title, poster_path, release_date, watched_at, added_at, vote_average')
    .eq('user_id', userId)
    .eq('status', 'watched')
    .order('watched_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    tmdbId: row.tmdb_id,
    title: row.title,
    posterPath: row.poster_path,
    year: extractYear(row.release_date),
    mediaType: 'movie' as const,
    primaryMetric: row.watched_at
      ? `Watched ${formatDate(row.watched_at)}`
      : `Added ${formatDate(row.added_at)}`,
    secondaryMetric:
      row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
  }));
}

async function fetchTvShowsWatched(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('user_tv_shows')
    .select(
      'id, tmdb_id, name, poster_path, first_air_date, finished_at, added_at, episodes_watched, number_of_episodes, vote_average'
    )
    .eq('user_id', userId)
    .eq('status', 'watched')
    .order('finished_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const episodes = row.episodes_watched ?? 0;
    const total = row.number_of_episodes ?? 0;
    const episodeStr =
      total > 0 ? `${episodes} / ${total} episodes` : `${episodes} episodes`;
    return {
      id: row.id,
      tmdbId: row.tmdb_id,
      title: row.name,
      posterPath: row.poster_path,
      year: extractYear(row.first_air_date),
      mediaType: 'tv' as const,
      primaryMetric: row.finished_at
        ? `Finished ${formatDate(row.finished_at)}`
        : row.added_at
        ? `Added ${formatDate(row.added_at)}`
        : null,
      secondaryMetric: episodeStr,
    };
  });
}

async function fetchTvShowsByEpisodes(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, first_air_date, episodes_watched, number_of_episodes')
    .eq('user_id', userId)
    .eq('status', 'watched')
    .order('episodes_watched', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const episodes = row.episodes_watched ?? 0;
    const total = row.number_of_episodes ?? 0;
    const episodeStr =
      total > 0 ? `${episodes} / ${total} episodes` : `${episodes} episodes`;
    return {
      id: row.id,
      tmdbId: row.tmdb_id,
      title: row.name,
      posterPath: row.poster_path,
      year: extractYear(row.first_air_date),
      mediaType: 'tv' as const,
      primaryMetric: episodeStr,
    };
  });
}

async function fetchTvShowsByWatchTime(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('user_tv_shows')
    .select('id, tmdb_id, name, poster_path, first_air_date, episodes_watched, number_of_episodes')
    .eq('user_id', userId)
    .eq('status', 'watched')
    .order('episodes_watched', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const episodes = row.episodes_watched ?? 0;
    const estMinutes = episodes * 45;
    const estHours = Math.floor(estMinutes / 60);
    const estMins = estMinutes % 60;
    const timeStr = estHours > 0 ? `~${estHours}h ${estMins}m` : `~${estMins}m`;
    return {
      id: row.id,
      tmdbId: row.tmdb_id,
      title: row.name,
      posterPath: row.poster_path,
      year: extractYear(row.first_air_date),
      mediaType: 'tv' as const,
      primaryMetric: timeStr,
      secondaryMetric: `${episodes} episodes`,
    };
  });
}

async function fetchFirstTakes(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('first_takes')
    .select('id, tmdb_id, movie_title, poster_path, rating, quote_text, created_at, media_type')
    .eq('user_id', userId)
    .neq('quote_text', '')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const ratingStr = row.rating != null ? String(row.rating) : undefined;
    return {
    id: row.id,
    tmdbId: row.tmdb_id,
    title: row.movie_title,
    posterPath: row.poster_path,
    year: null,
    mediaType: (row.media_type === 'tv_show' ? 'tv' : 'movie') as 'movie' | 'tv',
    primaryMetric: row.created_at ? formatDate(row.created_at) : null,
    secondaryMetric: ratingStr,
    compactMetric: ratingStr ?? null, // compact view shows rating, not date
    };
  });
}

async function fetchRatings(userId: string): Promise<AnalyticsDetailItem[]> {
  const { data, error } = await supabase
    .from('first_takes')
    .select('id, tmdb_id, movie_title, poster_path, rating, created_at, media_type')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .order('rating', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => row.rating != null)
    .map((row) => ({
      id: row.id,
      tmdbId: row.tmdb_id,
      title: row.movie_title,
      posterPath: row.poster_path,
      year: null,
      mediaType: (row.media_type === 'tv_show' ? 'tv' : 'movie') as 'movie' | 'tv',
      primaryMetric: `★ ${row.rating}/5`,
      secondaryMetric: row.created_at ? formatDate(row.created_at) : undefined,
    }));
}

async function fetchMonthlyDetail(
  userId: string,
  month: string
): Promise<AnalyticsDetailItem[]> {
  const { start, end } = getMonthRange(month);

  const [moviesResult, tvResult] = await Promise.all([
    supabase
      .from('user_movies')
      .select('id, tmdb_id, title, poster_path, release_date, watched_at, added_at, vote_average')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .gte('watched_at', start)
      .lt('watched_at', end),
    supabase
      .from('user_tv_shows')
      .select('id, tmdb_id, name, poster_path, first_air_date, finished_at, added_at, vote_average')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .gte('finished_at', start)
      .lt('finished_at', end),
  ]);

  if (moviesResult.error) throw new Error(moviesResult.error.message);
  if (tvResult.error) throw new Error(tvResult.error.message);

  const withDates: Array<AnalyticsDetailItem & { _sortDate: string }> = [
    ...(moviesResult.data ?? []).map((row) => ({
      _sortDate: row.watched_at ?? row.added_at ?? '',
      id: `movie-${row.id}`,
      tmdbId: row.tmdb_id,
      title: row.title,
      posterPath: row.poster_path,
      year: extractYear(row.release_date),
      mediaType: 'movie' as const,
      primaryMetric: row.watched_at
        ? formatDate(row.watched_at)
        : `Added ${formatDate(row.added_at)}`,
      secondaryMetric:
        row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
    })),
    ...(tvResult.data ?? []).map((row) => ({
      _sortDate: row.finished_at ?? row.added_at ?? '',
      id: `tv-${row.id}`,
      tmdbId: row.tmdb_id,
      title: row.name,
      posterPath: row.poster_path,
      year: extractYear(row.first_air_date),
      mediaType: 'tv' as const,
      primaryMetric: row.finished_at
        ? formatDate(row.finished_at)
        : row.added_at
        ? `Added ${formatDate(row.added_at)}`
        : null,
      secondaryMetric:
        row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
    })),
  ];

  return sortByDateDesc(withDates);
}

async function fetchGenreDetail(
  userId: string,
  genreId: number
): Promise<AnalyticsDetailItem[]> {
  const [moviesResult, tvResult] = await Promise.all([
    supabase
      .from('user_movies')
      .select('id, tmdb_id, title, poster_path, release_date, watched_at, added_at, vote_average')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .contains('genre_ids', [genreId]),
    supabase
      .from('user_tv_shows')
      .select('id, tmdb_id, name, poster_path, first_air_date, finished_at, added_at, vote_average')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .contains('genre_ids', [genreId]),
  ]);

  if (moviesResult.error) throw new Error(moviesResult.error.message);
  if (tvResult.error) throw new Error(tvResult.error.message);

  const withDates: Array<AnalyticsDetailItem & { _sortDate: string }> = [
    ...(moviesResult.data ?? []).map((row) => ({
      _sortDate: row.watched_at ?? row.added_at ?? '',
      id: `movie-${row.id}`,
      tmdbId: row.tmdb_id,
      title: row.title,
      posterPath: row.poster_path,
      year: extractYear(row.release_date),
      mediaType: 'movie' as const,
      primaryMetric: row.watched_at
        ? formatDate(row.watched_at)
        : `Added ${formatDate(row.added_at)}`,
      secondaryMetric:
        row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
    })),
    ...(tvResult.data ?? []).map((row) => ({
      _sortDate: row.finished_at ?? row.added_at ?? '',
      id: `tv-${row.id}`,
      tmdbId: row.tmdb_id,
      title: row.name,
      posterPath: row.poster_path,
      year: extractYear(row.first_air_date),
      mediaType: 'tv' as const,
      primaryMetric: row.finished_at
        ? formatDate(row.finished_at)
        : row.added_at
        ? `Added ${formatDate(row.added_at)}`
        : null,
      secondaryMetric:
        row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
    })),
  ];

  return sortByDateDesc(withDates);
}

// Fetch content from any of the "other" genres (beyond top 5).
// Fetches all watched content then filters client-side for items that contain
// at least one of the given genre IDs — avoids needing complex OR queries.
async function fetchOtherGenresDetail(
  userId: string,
  genreIds: number[]
): Promise<AnalyticsDetailItem[]> {
  if (genreIds.length === 0) return [];

  const genreSet = new Set(genreIds);

  const [moviesResult, tvResult] = await Promise.all([
    supabase
      .from('user_movies')
      .select('id, tmdb_id, title, poster_path, release_date, watched_at, added_at, vote_average, genre_ids')
      .eq('user_id', userId)
      .eq('status', 'watched'),
    supabase
      .from('user_tv_shows')
      .select('id, tmdb_id, name, poster_path, first_air_date, finished_at, added_at, vote_average, genre_ids')
      .eq('user_id', userId)
      .eq('status', 'watched'),
  ]);

  if (moviesResult.error) throw new Error(moviesResult.error.message);
  if (tvResult.error) throw new Error(tvResult.error.message);

  const withDates: Array<AnalyticsDetailItem & { _sortDate: string }> = [
    ...(moviesResult.data ?? [])
      .filter((row) => (row.genre_ids ?? []).some((id) => genreSet.has(id)))
      .map((row) => ({
        _sortDate: row.watched_at ?? row.added_at ?? '',
        id: `movie-${row.id}`,
        tmdbId: row.tmdb_id,
        title: row.title,
        posterPath: row.poster_path,
        year: extractYear(row.release_date),
        mediaType: 'movie' as const,
        primaryMetric: row.watched_at
          ? formatDate(row.watched_at)
          : `Added ${formatDate(row.added_at)}`,
        secondaryMetric:
          row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
      })),
    ...(tvResult.data ?? [])
      .filter((row) => (row.genre_ids ?? []).some((id) => genreSet.has(id)))
      .map((row) => ({
        _sortDate: row.finished_at ?? row.added_at ?? '',
        id: `tv-${row.id}`,
        tmdbId: row.tmdb_id,
        title: row.name,
        posterPath: row.poster_path,
        year: extractYear(row.first_air_date),
        mediaType: 'tv' as const,
        primaryMetric: row.finished_at
          ? formatDate(row.finished_at)
          : row.added_at
          ? `Added ${formatDate(row.added_at)}`
          : null,
        secondaryMetric:
          row.vote_average != null ? `★ ${row.vote_average.toFixed(1)}` : undefined,
      })),
  ];

  return sortByDateDesc(withDates);
}

// ============================================================================
// Main Dispatcher
// ============================================================================

export async function fetchAnalyticsDetail(
  type: AnalyticsDetailType,
  filter: AnalyticsDetailFilter | undefined,
  userId: string
): Promise<AnalyticsDetailItem[]> {
  switch (type) {
    case 'movies':
      return fetchMoviesWatched(userId);
    case 'tv-shows':
      return fetchTvShowsWatched(userId);
    case 'episodes':
      return fetchTvShowsByEpisodes(userId);
    case 'tv-watch-time':
      return fetchTvShowsByWatchTime(userId);
    case 'first-takes':
      return fetchFirstTakes(userId);
    case 'ratings':
      return fetchRatings(userId);
    case 'monthly': {
      const month = filter?.month;
      if (!month) throw new Error('month filter required for monthly type');
      return fetchMonthlyDetail(userId, month);
    }
    case 'genre': {
      const genreId = filter?.genreId;
      if (genreId == null) throw new Error('genreId filter required for genre type');
      return fetchGenreDetail(userId, genreId);
    }
    case 'other-genres': {
      const otherGenreIds = filter?.otherGenreIds;
      if (!otherGenreIds?.length) throw new Error('otherGenreIds filter required for other-genres type');
      return fetchOtherGenresDetail(userId, otherGenreIds);
    }
    default: {
      const _exhausted: never = type;
      throw new Error(`Unknown analytics detail type: ${String(_exhausted)}`);
    }
  }
}
