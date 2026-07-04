import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { COMPLETE_GENRE_MAP } from '@/lib/tmdb.types';
import { OTHER_GENRE_ID } from '@/components/stats-v2/genre-display';

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

  // Map genre IDs to names using the complete movie + TV lookup. Any genre ID
  // still unknown (e.g. a brand-new TMDB genre) collapses into a SINGLE
  // trailing "Other" bucket rather than several duplicate "Other" rows — the
  // aggregate sentinel (OTHER_GENRE_ID) also makes the bar render it muted.
  const named = data.genres.map((genre) => ({
    genreId: genre.genreId,
    genreName: COMPLETE_GENRE_MAP[genre.genreId] || 'Other',
    count: genre.count,
    percentage: genre.percentage,
  }));
  const known = named.filter((g) => g.genreName !== 'Other');
  const unknown = named.filter((g) => g.genreName === 'Other');
  const genresWithNames: GenreStats[] = unknown.length
    ? [
        ...known,
        {
          genreId: OTHER_GENRE_ID,
          genreName: 'Other',
          count: unknown.reduce((sum, g) => sum + g.count, 0),
          percentage: unknown.reduce((sum, g) => sum + g.percentage, 0),
        },
      ]
    : known;

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
