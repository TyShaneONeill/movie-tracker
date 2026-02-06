import { useQuery } from '@tanstack/react-query';
import { getPersonDetails } from '@/lib/movie-service';
import type { TMDBPerson, TMDBPersonMovieCredit, TMDBPersonCrewCredit } from '@/lib/tmdb.types';

interface UsePersonDetailOptions {
  personId: string | number;
  enabled?: boolean;
}

interface UsePersonDetailResult {
  person: TMDBPerson | null;
  movieCredits: TMDBPersonMovieCredit[];
  crewCredits: TMDBPersonCrewCredit[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  refetch: () => void;
}

export function usePersonDetail({
  personId,
  enabled = true,
}: UsePersonDetailOptions): UsePersonDetailResult {
  const numericId = typeof personId === 'string' ? parseInt(personId, 10) : personId;
  const isValidId = !isNaN(numericId) && numericId > 0;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['person', numericId],
    queryFn: () => getPersonDetails(numericId),
    enabled: enabled && isValidId,
    staleTime: 1000 * 60 * 30, // 30 minutes - person data doesn't change often
  });

  return {
    person: data?.person ?? null,
    movieCredits: data?.movieCredits ?? [],
    crewCredits: data?.crewCredits ?? [],
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
