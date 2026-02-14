import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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

/** Shape returned by the JOINed Supabase query */
export interface FirstTakeWithProfile {
  id: string;
  user_id: string;
  tmdb_id: number;
  movie_title: string;
  poster_path: string | null;
  rating: number | null;
  quote_text: string;
  is_spoiler: boolean | null;
  created_at: string | null;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

/** The JOINed select string used by both hooks */
export const ACTIVITY_FEED_SELECT =
  'id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, created_at, profiles(full_name, username, avatar_url)';

/** Map a JOINed row to an ActivityFeedItem */
export function mapToFeedItem(row: FirstTakeWithProfile): ActivityFeedItem {
  return {
    id: row.id,
    userId: row.user_id,
    tmdbId: row.tmdb_id,
    movieTitle: row.movie_title,
    posterPath: row.poster_path,
    rating: row.rating,
    quoteText: row.quote_text,
    isSpoiler: row.is_spoiler,
    createdAt: row.created_at,
    userDisplayName:
      row.profiles?.full_name || row.profiles?.username || 'Anonymous',
    userAvatarUrl: row.profiles?.avatar_url ?? null,
  };
}

/**
 * Hook to fetch the global activity feed of recent First Takes from all users.
 * Uses a single JOINed query (first_takes + profiles) instead of N+1 queries.
 */
export function useActivityFeed(limit: number = 20) {
  return useQuery({
    queryKey: ['activity-feed', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('first_takes')
        .select(ACTIVITY_FEED_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      return (data as unknown as FirstTakeWithProfile[]).map(mapToFeedItem);
    },
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
