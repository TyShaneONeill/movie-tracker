import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TMDB_GENRE_MAP } from '@/lib/tmdb.types';

// ============================================================================
// Types
// ============================================================================

export interface RecapGenre {
  genreId: number;
  genreName: string;
  count: number;
}

export interface RecapFormat {
  format: string;
  count: number;
}

export interface RecapFilmRef {
  title: string;
  date: string;
}

export interface YearRecap {
  year: number;
  filmsSeen: number;
  hoursWatched: number; // minutes (movies)
  genres: RecapGenre[];
  tvShows: number;
  episodesWatched: number;
  tvHours: number; // minutes
  formats: RecapFormat[];
  theatersCount: number;
  chainsCount: number;
  firstFilm: RecapFilmRef | null;
  lastFilm: RecapFilmRef | null;
  availableYears: number[];
}

interface RawYearRecap {
  year: number;
  films_seen: number;
  hours_watched: number;
  genres: Array<{ genre_id: number; count: number }>;
  tv_shows: number;
  episodes_watched: number;
  tv_hours: number;
  formats: Array<{ format: string; count: number }>;
  theaters_count: number;
  chains_count: number;
  first_film: RecapFilmRef | null;
  last_film: RecapFilmRef | null;
  available_years: number[];
}

// ============================================================================
// Helpers
// ============================================================================

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function mapRecap(raw: RawYearRecap): YearRecap {
  return {
    year: raw.year,
    filmsSeen: raw.films_seen,
    hoursWatched: raw.hours_watched,
    genres: (raw.genres ?? []).map((g) => ({
      genreId: g.genre_id,
      genreName: TMDB_GENRE_MAP[g.genre_id] || 'Other',
      count: g.count,
    })),
    tvShows: raw.tv_shows,
    episodesWatched: raw.episodes_watched,
    tvHours: raw.tv_hours,
    formats: raw.formats ?? [],
    theatersCount: raw.theaters_count,
    chainsCount: raw.chains_count,
    firstFilm: raw.first_film,
    lastFilm: raw.last_film,
    availableYears: raw.available_years ?? [],
  };
}

async function fetchYearRecap(year: number): Promise<YearRecap> {
  const { data, error } = await supabase.rpc('get_user_year_recap', {
    p_year: year,
    p_timezone: getDeviceTimezone(),
  });
  if (error) throw new Error(error.message || 'Failed to load year recap');
  if (!data) throw new Error('No recap data returned');
  return mapRecap(data as unknown as RawYearRecap);
}

// ============================================================================
// Hook
// ============================================================================

export function useYearRecap(year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['yearRecap', user?.id, year],
    queryFn: () => fetchYearRecap(year),
    enabled: !!user && Number.isFinite(year),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
