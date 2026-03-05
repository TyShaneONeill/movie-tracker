import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Review } from '@/lib/database.types';

export type ReviewSortOption = 'recent' | 'popular' | 'highest' | 'lowest';
export type ReviewMediaFilter = 'all' | 'movie' | 'tv_show';

interface UseUserReviewsParams {
  userId: string | undefined;
  viewerId?: string;
  enabled: boolean;
}

async function fetchUserReviews(userId: string, viewerId?: string): Promise<Review[]> {
  // If viewing own profile or no viewer specified, fetch all reviews
  if (!viewerId || viewerId === userId) {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  // Viewing another user's profile — check if viewer follows them
  const { count } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', viewerId)
    .eq('following_id', userId);

  const isFollowing = (count ?? 0) > 0;
  const allowedVisibilities = isFollowing
    ? ['public', 'followers_only']
    : ['public'];

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('user_id', userId)
    .in('visibility', allowedVisibilities)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export function useUserReviews({ userId, viewerId, enabled }: UseUserReviewsParams) {
  const { data, isLoading, isError, error, refetch } = useQuery<Review[]>({
    queryKey: ['userReviews', userId, viewerId],
    queryFn: () => fetchUserReviews(userId!, viewerId),
    enabled: !!userId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    reviews: data ?? [],
    isLoading,
    isError,
    error,
    refetch,
  };
}
