import { supabase } from '@/lib/supabase';
import type {
  ActivityFeedItem,
  FirstTakeWithProfile,
  FeedListItem,
} from '@/hooks/use-activity-feed';
import { ACTIVITY_FEED_SELECT, mapToFeedItem } from '@/hooks/use-activity-feed';

export const PAGE_SIZE = 20;
export const AD_INTERVAL = 25;

export interface BuildFeedListParams {
  followingItems: ActivityFeedItem[];
  communityItems: ActivityFeedItem[];
  isAllCaughtUp: boolean;
  adsEnabled: boolean;
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
  const { followingItems, communityItems, isAllCaughtUp, adsEnabled } = params;

  const result: FeedListItem[] = [];

  for (const item of followingItems) {
    result.push({ type: 'activity', data: item });
  }

  if (followingItems.length > 0) {
    if (isAllCaughtUp) {
      result.push({ type: 'caught-up' });
    }
    result.push({ type: 'community-header' });
  }

  let counter = 0;
  for (const item of communityItems) {
    if (adsEnabled && counter > 0 && counter % AD_INTERVAL === 0) {
      result.push({ type: 'ad', id: 'ad-community-' + counter });
    }
    result.push({ type: 'activity', data: item });
    counter++;
  }

  return result;
}
