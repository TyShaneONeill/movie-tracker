import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TMDB_GENRE_MAP } from '@/lib/tmdb.types';

// ============================================================================
// Types
// ============================================================================

interface GenreStats {
  genreId: number;
  genreName: string;
  count: number;
  percentage: number;
}

interface MonthlyActivity {
  month: string;
  monthLabel: string;
  count: number;
}

interface UserStats {
  summary: {
    totalWatched: number;
    totalTvWatched: number;
    totalFirstTakes: number;
    averageRating: number | null;
    totalEpisodesWatched: number;
    totalWatchTimeMinutes: number;
  };
  genres: GenreStats[];
  monthlyActivity: MonthlyActivity[];
}

interface EdgeFunctionResponse {
  summary: {
    totalWatched: number;
    totalTvWatched: number;
    totalFirstTakes: number;
    averageRating: number | null;
    totalEpisodesWatched: number;
    totalWatchTimeMinutes: number;
  };
  genres: Array<{
    genreId: number;
    count: number;
    percentage: number;
  }>;
  monthlyActivity: MonthlyActivity[];
}

// ============================================================================
// Fetch Function
// ============================================================================

async function fetchUserStats(): Promise<UserStats> {
  const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse>(
    'get-user-stats'
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch user stats');
  }

  if (!data) {
    throw new Error('No data returned from stats endpoint');
  }

  // Map genre IDs to names
  const genresWithNames: GenreStats[] = data.genres.map((genre) => ({
    genreId: genre.genreId,
    genreName: TMDB_GENRE_MAP[genre.genreId] || 'Other',
    count: genre.count,
    percentage: genre.percentage,
  }));

  return {
    summary: data.summary,
    genres: genresWithNames,
    monthlyActivity: data.monthlyActivity,
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useUserStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userStats', user?.id],
    queryFn: fetchUserStats,
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes — stats change infrequently
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    refetchOnMount: false, // Only refresh via pull-to-refresh
  });
}

// Export types for use in components
export type { UserStats, GenreStats, MonthlyActivity };
