import { useQuery } from '@tanstack/react-query';
import { getPersonDetails } from '@/lib/person-service';
import type {
  PersonDetailResponse,
  TMDBPerson,
  TMDBMovieCredit,
} from '@/lib/tmdb.types';

interface UsePersonDetailOptions {
  personId: string | number;
  enabled?: boolean;
}

interface UsePersonDetailResult {
  person: TMDBPerson | null;
  filmography: TMDBMovieCredit[];
  knownFor: TMDBMovieCredit[];
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

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    PersonDetailResponse,
    Error
  >({
    queryKey: ['person', numericId],
    queryFn: () => getPersonDetails(numericId),
    enabled: enabled && isValidId,
    staleTime: 1000 * 60 * 30, // 30 minutes - person data doesn't change often
  });

  return {
    person: data?.person ?? null,
    filmography: data?.filmography ?? [],
    knownFor: data?.knownFor ?? [],
    isLoading,
    isError,
    error: error ?? null,
    isFetching,
    refetch,
  };
}
