import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FirstTake, Profile } from '@/lib/database.types';

/**
 * Activity feed item with user profile information
 */
export interface ActivityFeedItem {
  id: string;
  userId: string;
  tmdbId: number;
  movieTitle: string;
  posterPath: string | null;
  rating: number | null;
  quoteText: string;
  isSpoiler: boolean | null;
  createdAt: string | null;
  // Profile information
  userDisplayName: string | null;
  userAvatarUrl: string | null;
}

// Type for the first_takes query result
type FirstTakeQueryResult = Pick<
  FirstTake,
  'id' | 'user_id' | 'tmdb_id' | 'movie_title' | 'poster_path' | 'rating' | 'quote_text' | 'is_spoiler' | 'created_at'
>;

// Type for the profiles query result
type ProfileQueryResult = Pick<Profile, 'id' | 'full_name' | 'username' | 'avatar_url'>;

/**
 * Hook to fetch the global activity feed of recent First Takes from all users
 *
 * Since there's no foreign key relationship between first_takes and profiles,
 * we fetch the data in two separate queries and merge them client-side.
 *
 * @returns Query result with activity feed items, loading state, and error state
 */
export function useActivityFeed(limit: number = 20) {
  return useQuery({
    queryKey: ['activity-feed', limit],
    queryFn: async () => {
      // Step 1: Fetch recent First Takes from all users
      const { data: firstTakesData, error: firstTakesError } = await supabase
        .from('first_takes')
        .select('id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (firstTakesError) throw firstTakesError;

      const firstTakes = firstTakesData as FirstTakeQueryResult[] | null;

      if (!firstTakes || firstTakes.length === 0) {
        return [];
      }

      // Step 2: Get unique user IDs from the first takes
      const userIds = [...new Set(firstTakes.map((ft) => ft.user_id))];

      // Step 3: Fetch profiles for those users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      const profiles = profilesData as ProfileQueryResult[] | null;

      // Step 4: Create a lookup map for profiles by user ID
      const profileMap = new Map<string, ProfileQueryResult>();
      (profiles ?? []).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });

      // Step 5: Merge first takes with profile data
      const feedItems: ActivityFeedItem[] = firstTakes.map((item) => {
        const profile = profileMap.get(item.user_id);
        return {
          id: item.id,
          userId: item.user_id,
          tmdbId: item.tmdb_id,
          movieTitle: item.movie_title,
          posterPath: item.poster_path,
          rating: item.rating,
          quoteText: item.quote_text,
          isSpoiler: item.is_spoiler,
          createdAt: item.created_at,
          // Use full_name first, fallback to username
          userDisplayName: profile?.full_name || profile?.username || 'Anonymous',
          userAvatarUrl: profile?.avatar_url ?? null,
        };
      });

      return feedItems;
    },
    // Refetch every 5 minutes to keep feed fresh
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Format a timestamp into a relative time string (e.g., "2h ago", "1d ago")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}
