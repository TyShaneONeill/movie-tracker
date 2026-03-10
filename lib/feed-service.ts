import { supabase } from '@/lib/supabase';
import type {
  ActivityFeedItem,
  FirstTakeWithProfile,
  FeedListItem,
  FeedFilter,
  ReviewWithProfile,
  CommentWithContext,
} from '@/hooks/use-activity-feed';
import {
  ACTIVITY_FEED_SELECT,
  REVIEW_FEED_SELECT,
  mapToFeedItem,
  mapReviewToFeedItem,
  mapCommentToFeedItem,
} from '@/hooks/use-activity-feed';

export const PAGE_SIZE = 20;
export const AD_INTERVAL = 25;

export interface BuildFeedListParams {
  followingItems: ActivityFeedItem[];
  communityItems: ActivityFeedItem[];
  isAllCaughtUp: boolean;
  adsEnabled: boolean;
  filter: FeedFilter;
}

/**
 * Fetch the list of user IDs that the given user follows.
 */
export async function getFollowingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (error) throw error;
  if (!data) return [];

  return data.map((row) => row.following_id);
}

/**
 * Fetch the activity feed for users the current user follows.
 */
export async function fetchFollowingFeed(
  followingIds: string[]
): Promise<ActivityFeedItem[]> {
  if (followingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('first_takes')
    .select(ACTIVITY_FEED_SELECT)
    .in('user_id', followingIds)
    .in('visibility', ['public', 'followers_only'])
    .like('quote_text', '_%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data as unknown as FirstTakeWithProfile[]).map(mapToFeedItem);
}

/**
 * Fetch a paginated community feed, excluding the current user and their follows.
 */
export async function fetchCommunityFeedPage(
  userId: string,
  followingIds: string[],
  cursor?: string
): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> {
  const excludedIds = [...followingIds, userId];

  let query = supabase
    .from('first_takes')
    .select(ACTIVITY_FEED_SELECT)
    .not('user_id', 'in', '(' + excludedIds.join(',') + ')')
    .eq('visibility', 'public')
    .like('quote_text', '_%')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) throw error;

  const items = (data as unknown as FirstTakeWithProfile[]).map(mapToFeedItem);
  const nextCursor =
    items.length === PAGE_SIZE
      ? (items[items.length - 1].createdAt ?? null)
      : null;

  return { items, nextCursor };
}

/**
 * Fetch reviews from users the current user follows.
 */
export async function fetchFollowingReviews(
  followingIds: string[]
): Promise<ActivityFeedItem[]> {
  if (followingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_FEED_SELECT)
    .in('user_id', followingIds)
    .in('visibility', ['public', 'followers_only'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as unknown as ReviewWithProfile[]).map(mapReviewToFeedItem);
}

/**
 * Fetch comments from users the current user follows, with review context.
 */
export async function fetchFollowingComments(
  followingIds: string[]
): Promise<ActivityFeedItem[]> {
  if (followingIds.length === 0) return [];

  // Fetch recent top-level comments from followed users on reviews (not hidden)
  const { data: comments, error: commentsError } = await supabase
    .from('review_comments')
    .select('id, user_id, body, created_at, review_id, is_spoiler')
    .in('user_id', followingIds)
    .not('review_id', 'is', null)
    .eq('is_hidden', false)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: false })
    .limit(30);

  if (commentsError) throw commentsError;
  if (!comments || comments.length === 0) return [];

  // Get unique review IDs and batch-fetch review info
  const reviewIds = [
    ...new Set(
      comments.map((c) => c.review_id).filter((id): id is string => id !== null)
    ),
  ];
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, title, movie_title, poster_path, tmdb_id, user_id, profiles(full_name, username)')
    .in('id', reviewIds);

  const reviewMap = new Map(
    (reviews ?? []).map((r) => [r.id, r])
  );

  // Batch-fetch commenter profiles (no FK from review_comments to profiles)
  const commenterIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: commenterProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', commenterIds);

  const profileMap = new Map(
    (commenterProfiles ?? []).map((p) => [p.id, p])
  );

  return comments
    .filter((c) => c.review_id !== null)
    .map((c) => {
      const review = reviewMap.get(c.review_id!);
      const reviewAuthor = (review as Record<string, unknown>)?.profiles as {
        full_name: string | null;
        username: string | null;
      } | null;
      const commenterProfile = profileMap.get(c.user_id);
      return mapCommentToFeedItem({
        id: c.id,
        user_id: c.user_id,
        body: c.body,
        created_at: c.created_at,
        target_type: 'review',
        target_id: c.review_id!,
        is_spoiler: c.is_spoiler,
        profiles: commenterProfile
          ? {
              full_name: commenterProfile.full_name,
              username: commenterProfile.username,
              avatar_url: commenterProfile.avatar_url,
            }
          : null,
        review_title: review?.title ?? null,
        review_movie_title: review?.movie_title ?? null,
        review_poster_path: review?.poster_path ?? null,
        review_tmdb_id: review?.tmdb_id ?? null,
        review_author_name:
          reviewAuthor?.full_name || reviewAuthor?.username || null,
      });
    });
}

/**
 * Fetch a paginated community reviews feed, excluding the current user and their follows.
 */
export async function fetchCommunityReviewsPage(
  userId: string,
  followingIds: string[],
  cursor?: string
): Promise<{ items: ActivityFeedItem[]; nextCursor: string | null }> {
  const excludedIds = [...followingIds, userId];

  let query = supabase
    .from('reviews')
    .select(REVIEW_FEED_SELECT)
    .not('user_id', 'in', '(' + excludedIds.join(',') + ')')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data as unknown as ReviewWithProfile[]).map(
    mapReviewToFeedItem
  );
  const nextCursor =
    items.length === PAGE_SIZE
      ? (items[items.length - 1].createdAt ?? null)
      : null;

  return { items, nextCursor };
}

/**
 * Get the timestamp of when the user last viewed the feed.
 */
export async function getFeedLastSeen(
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('feed_last_seen_at')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return data?.feed_last_seen_at ?? null;
}

/**
 * Update the feed_last_seen_at timestamp to now.
 */
export async function updateFeedLastSeen(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ feed_last_seen_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Pure function to build the final feed list from following and community items.
 */
export function buildFeedList(params: BuildFeedListParams): FeedListItem[] {
  const { followingItems, communityItems, isAllCaughtUp, adsEnabled, filter } =
    params;

  // Apply filter to items
  const filterFn = (item: ActivityFeedItem): boolean => {
    if (filter === 'all') return true;
    if (filter === 'reviews')
      return item.activityType === 'review' || item.activityType === 'first_take';
    // 'friends' filter is handled by only using followingItems (community is excluded below)
    return true;
  };

  const filteredFollowing = followingItems.filter(filterFn);
  const filteredCommunity =
    filter === 'friends' ? [] : communityItems.filter(filterFn);

  const result: FeedListItem[] = [];

  for (const item of filteredFollowing) {
    result.push({ type: 'activity', data: item });
  }

  if (filteredFollowing.length > 0) {
    if (isAllCaughtUp) {
      result.push({ type: 'caught-up' });
    }
    if (filteredCommunity.length > 0) {
      result.push({ type: 'community-header' });
    }
  }

  let counter = 0;
  for (const item of filteredCommunity) {
    if (adsEnabled && counter > 0 && counter % AD_INTERVAL === 0) {
      result.push({ type: 'ad', id: 'ad-community-' + counter });
    }
    result.push({ type: 'activity', data: item });
    counter++;
  }

  return result;
}
