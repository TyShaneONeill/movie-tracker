import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ReviewVisibility } from '@/lib/database.types';

/**
 * Discriminated union for all feed list item types.
 * Used by both the legacy and prioritized feed renderers.
 */
export type FeedListItem =
  | { type: 'activity'; data: ActivityFeedItem }
  | { type: 'ad'; id: string }
  | { type: 'caught-up' }
  | { type: 'community-header' };

/**
 * Filter types for the activity feed.
 */
export type FeedFilter = 'all' | 'reviews' | 'friends';

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
  visibility: ReviewVisibility;
  createdAt: string | null;
  mediaType: string;
  // Profile information
  userDisplayName: string | null;
  userAvatarUrl: string | null;
  // Activity type discriminator
  activityType: 'first_take' | 'review' | 'comment';
  // Review-specific fields
  reviewTitle?: string;
  // Comment-specific fields
  commentText?: string;
  targetReviewId?: string;
  targetReviewTitle?: string;
  targetReviewAuthorName?: string;
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
  visibility: ReviewVisibility;
  created_at: string | null;
  media_type: string | null;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

/** The JOINed select string used by both hooks */
export const ACTIVITY_FEED_SELECT =
  'id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, visibility, created_at, media_type, profiles(full_name, username, avatar_url)';

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
    visibility: row.visibility ?? 'public',
    createdAt: row.created_at,
    mediaType: row.media_type || 'movie',
    userDisplayName:
      row.profiles?.full_name || row.profiles?.username || 'Anonymous',
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    activityType: 'first_take',
  };
}

/** Shape returned by the JOINed Supabase query for reviews */
export interface ReviewWithProfile {
  id: string;
  user_id: string;
  tmdb_id: number;
  movie_title: string;
  poster_path: string | null;
  rating: number;
  title: string;
  review_text: string;
  is_spoiler: boolean;
  visibility: ReviewVisibility;
  created_at: string | null;
  like_count: number;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

/** The JOINed select string for review feed queries */
export const REVIEW_FEED_SELECT =
  'id, user_id, tmdb_id, movie_title, poster_path, rating, title, review_text, is_spoiler, visibility, created_at, like_count, profiles(full_name, username, avatar_url)';

/** Map a review row to an ActivityFeedItem */
export function mapReviewToFeedItem(row: ReviewWithProfile): ActivityFeedItem {
  return {
    id: row.id,
    userId: row.user_id,
    tmdbId: row.tmdb_id,
    movieTitle: row.movie_title,
    posterPath: row.poster_path,
    rating: row.rating,
    quoteText: row.review_text?.slice(0, 140) || '',
    isSpoiler: row.is_spoiler,
    visibility: row.visibility ?? 'public',
    createdAt: row.created_at,
    mediaType: 'movie',
    userDisplayName:
      row.profiles?.full_name || row.profiles?.username || 'Anonymous',
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    activityType: 'review',
    reviewTitle: row.title,
  };
}

/** Shape for comment feed items with joined review context */
export interface CommentWithContext {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  target_type: string;
  target_id: string;
  is_spoiler: boolean;
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
  // From batch-fetched review data
  review_title: string | null;
  review_movie_title: string | null;
  review_poster_path: string | null;
  review_tmdb_id: number | null;
  review_author_name: string | null;
}

/** Map a comment row to an ActivityFeedItem */
export function mapCommentToFeedItem(
  row: CommentWithContext
): ActivityFeedItem {
  return {
    id: `comment-${row.id}`,
    userId: row.user_id,
    tmdbId: row.review_tmdb_id ?? 0,
    movieTitle: row.review_movie_title ?? '',
    posterPath: row.review_poster_path ?? null,
    rating: null,
    quoteText: '',
    isSpoiler: row.is_spoiler,
    visibility: 'public',
    createdAt: row.created_at,
    mediaType: 'movie',
    userDisplayName:
      row.profiles?.full_name || row.profiles?.username || 'Anonymous',
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    activityType: 'comment',
    commentText: row.body,
    targetReviewId: row.target_id,
    targetReviewTitle: row.review_title ?? undefined,
    targetReviewAuthorName: row.review_author_name ?? undefined,
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
        .like('quote_text', '_%')
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
  if (diffInDays < 30) {
    return `${diffInWeeks}w ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}
