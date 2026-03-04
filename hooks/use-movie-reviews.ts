import { useQuery } from '@tanstack/react-query';
import { fetchMovieReviews, type MovieReviewsResponse } from '@/lib/review-service';

export function useMovieReviews(
  tmdbId: number,
  page: number = 1,
  enabled: boolean = true
) {
  return useQuery<MovieReviewsResponse, Error>({
    queryKey: ['movieReviews', tmdbId, page],
    queryFn: () => fetchMovieReviews(tmdbId, page),
    enabled: enabled && tmdbId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}
