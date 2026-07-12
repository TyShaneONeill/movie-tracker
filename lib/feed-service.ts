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
import type { TopComment } from '@/lib/feed-v2-logic';

export const PAGE_SIZE = 20;
// Feed ad cadence (community section): first ad after AD_FIRST_SLOT activities,
// then one every AD_INTERVAL. Previously AD_INTERVAL=25 with the first ad only
// at item 25 — real (short) feeds never reached it, so the Feed showed ZERO ads.
// Lowered for the banner-ad audit (2026-06-27): first ad at item 3, then every 5.
export const AD_FIRST_SLOT = 3;
export const AD_INTERVAL = 5;

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
        created_at: c.created_at ?? new Date().toISOString(),
        target_type: 'review',
        target_id: c.review_id!,
        is_spoiler: c.is_spoiler ?? false,
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

/** A raw top-level comment row from the batched top-comment read. */
interface RawTopCommentRow {
  id: string;
  user_id: string;
  body: string;
  created_at: string | null;
  is_spoiler: boolean | null;
  like_count: number | null;
  review_id: string | null;
  first_take_id: string | null;
}

/**
 * Batch-fetch the TOP comment for each visible artifact (contract Decision 4):
 * one direct read of `review_comments` for the page's first-take + review ids,
 * ordered most-liked → newest, picked per artifact client-side. No N+1, and no
 * server deploy — the existing `review_comments` RLS already permits this direct
 * read (the same table `fetchFollowingComments` reads). Comments hidden by
 * moderation and replies (parent_comment_id set) are excluded.
 *
 * `blockedIds` is applied CLIENT-SIDE: SELECT RLS ignores blocks, so a blocked
 * user's comment can still be the most-liked row. Skipping blocked commenters
 * during the per-artifact pick means the top NON-blocked comment surfaces (or
 * none) — the standing "block-filter every new stream" check.
 *
 * Returns a Map keyed by artifact id (first_take id or review id).
 */
export async function fetchTopComments(
  artifacts: { id: string; activityType: 'first_take' | 'review' | 'comment' }[],
  blockedIds: string[] = []
): Promise<Map<string, TopComment>> {
  const firstTakeIds = artifacts
    .filter((a) => a.activityType === 'first_take')
    .map((a) => a.id);
  const reviewIds = artifacts
    .filter((a) => a.activityType === 'review')
    .map((a) => a.id);

  const result = new Map<string, TopComment>();
  if (firstTakeIds.length === 0 && reviewIds.length === 0) return result;

  let query = supabase
    .from('review_comments')
    .select('id, user_id, body, created_at, is_spoiler, like_count, review_id, first_take_id')
    .is('parent_comment_id', null)
    .eq('is_hidden', false);

  // Scope to the visible artifacts. `.or()` unions the two id lists; when only
  // one kind is present use a plain `.in()` (an empty `in.()` in an `.or()` is
  // invalid PostgREST syntax).
  if (firstTakeIds.length > 0 && reviewIds.length > 0) {
    query = query.or(
      `review_id.in.(${reviewIds.join(',')}),first_take_id.in.(${firstTakeIds.join(',')})`
    );
  } else if (reviewIds.length > 0) {
    query = query.in('review_id', reviewIds);
  } else {
    query = query.in('first_take_id', firstTakeIds);
  }

  // Most-liked first, newest as tiebreak — so the first row seen per artifact is
  // its top comment.
  const { data, error } = await query
    .order('like_count', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw error;
  const rows = (data ?? []) as RawTopCommentRow[];
  if (rows.length === 0) return result;

  // Drop blocked commenters BEFORE the per-artifact pick so the next-best
  // non-blocked comment (rows stay like_count-ordered) becomes the top.
  const blockedSet = new Set(blockedIds);
  const visibleRows = rows.filter((r) => !blockedSet.has(r.user_id));
  if (visibleRows.length === 0) return result;

  // Batch-fetch commenter profiles (no FK from review_comments → profiles).
  const commenterIds = [...new Set(visibleRows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', commenterIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  for (const row of visibleRows) {
    const artifactId = row.first_take_id ?? row.review_id;
    if (!artifactId || result.has(artifactId)) continue; // first seen = top
    const profile = profileMap.get(row.user_id);
    result.set(artifactId, {
      id: row.id,
      artifactId,
      artifactType: row.first_take_id ? 'first_take' : 'review',
      userId: row.user_id,
      body: row.body,
      isSpoiler: row.is_spoiler ?? false,
      createdAt: row.created_at ?? new Date().toISOString(),
      likeCount: row.like_count ?? 0,
      commenterName: profile?.full_name || profile?.username || 'Anonymous',
      commenterAvatarUrl: profile?.avatar_url ?? null,
    });
  }

  return result;
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
      return item.activityType === 'review';
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
    // First ad after AD_FIRST_SLOT activities, then one every AD_INTERVAL.
    if (
      adsEnabled &&
      counter >= AD_FIRST_SLOT &&
      (counter - AD_FIRST_SLOT) % AD_INTERVAL === 0
    ) {
      result.push({ type: 'ad', id: 'ad-community-' + counter });
    }
    result.push({ type: 'activity', data: item });
    counter++;
  }

  return result;
}
