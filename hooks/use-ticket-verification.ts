import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { supabase } from '@/lib/supabase';

/**
 * Hook to check if the current user has a verified ticket scan for a specific movie.
 *
 * Queries the theater_visits table for a row where:
 *   - user_id = auth user's id
 *   - tmdb_id = the given tmdbId
 *   - is_verified = true
 *
 * Returns { hasVerifiedTicket, isLoading }.
 */
export function useTicketVerification(tmdbId: number): {
  hasVerifiedTicket: boolean;
  isLoading: boolean;
} {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['ticket-verification', tmdbId],
    queryFn: async () => {
      if (!user) return null;
      const { data: visit, error } = await supabase
        .from('theater_visits')
        .select('id')
        .eq('user_id', user.id)
        .eq('tmdb_id', tmdbId)
        .eq('is_verified', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return visit;
    },
    enabled: !!user && tmdbId > 0,
  });

  return {
    hasVerifiedTicket: data !== null && data !== undefined,
    isLoading,
  };
}
