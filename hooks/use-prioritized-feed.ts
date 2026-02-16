import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useEffect, useRef } from 'react';

import {
  getFollowingIds,
  fetchFollowingFeed,
  fetchCommunityFeedPage,
  getFeedLastSeen,
  updateFeedLastSeen,
  buildFeedList,
} from '@/lib/feed-service';
import { useAds } from '@/lib/ads-context';

export function usePrioritizedFeed(userId: string | undefined) {
  const { adsEnabled } = useAds();
  const queryClient = useQueryClient();

  // Query 1: Get followed user IDs (lightweight, enables subsequent queries)
  const followingIdsQuery = useQuery({
    queryKey: ['following-ids', userId],
    queryFn: () => getFollowingIds(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const followingIds = followingIdsQuery.data ?? [];

  // Query 2: Following feed (all at once, depends on followingIds)
  const followingFeedQuery = useQuery({
    queryKey: ['activity-feed', 'following', followingIds],
    queryFn: () => fetchFollowingFeed(followingIds),
    enabled: followingIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Query 3: Community feed (paginated, depends on followingIds for exclusion)
  // When user has no follows, this becomes the whole feed (no exclusion)
  const communityQuery = useInfiniteQuery({
    queryKey: ['activity-feed', 'community', userId, followingIds],
    queryFn: ({ pageParam }) =>
      fetchCommunityFeedPage(userId!, followingIds, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!userId && followingIdsQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
  });

  // Query 4: Feed last seen timestamp
  const feedLastSeenQuery = useQuery({
    queryKey: ['feed-last-seen', userId],
    queryFn: () => getFeedLastSeen(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  });

  // Side effect: Update feed_last_seen_at after following items load
  // Use a ref to ensure we only update once per feed load (not on re-renders)
  const hasUpdatedLastSeen = useRef(false);
  useEffect(() => {
    if (followingFeedQuery.isSuccess && userId && !hasUpdatedLastSeen.current) {
      hasUpdatedLastSeen.current = true;
      updateFeedLastSeen(userId);
    }
  }, [followingFeedQuery.isSuccess, userId]);

  // Reset the ref when the query is refetched
  useEffect(() => {
    if (followingFeedQuery.isRefetching) {
      hasUpdatedLastSeen.current = false;
    }
  }, [followingFeedQuery.isRefetching]);

  // Compute caught-up state
  const isAllCaughtUp = useMemo(() => {
    const feedLastSeen = feedLastSeenQuery.data;
    const followingItems = followingFeedQuery.data;
    if (!feedLastSeen || !followingItems || followingItems.length === 0)
      return false;
    // All caught up if every following item was created before or at the last seen time
    return followingItems.every(
      (item) => item.createdAt && item.createdAt <= feedLastSeen
    );
  }, [feedLastSeenQuery.data, followingFeedQuery.data]);

  // Flatten community pages
  const communityItems = useMemo(
    () => communityQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [communityQuery.data]
  );

  const followingItems = followingFeedQuery.data ?? [];

  // Build merged feed list
  const feedItems = useMemo(
    () =>
      buildFeedList({
        followingItems,
        communityItems,
        isAllCaughtUp,
        adsEnabled,
      }),
    [followingItems, communityItems, isAllCaughtUp, adsEnabled]
  );

  // Loading state: show loading if either the following IDs query or community query is loading
  const isLoading =
    (!!userId && followingIdsQuery.isLoading) || communityQuery.isLoading;

  // Refetch all queries
  const refetch = async () => {
    hasUpdatedLastSeen.current = false;
    queryClient.invalidateQueries({ queryKey: ['feed-last-seen', userId] });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['following-ids', userId] }),
      queryClient.invalidateQueries({
        queryKey: ['activity-feed', 'following'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['activity-feed', 'community'],
      }),
    ]);
  };

  return {
    feedItems,
    isLoading,
    refetch,
    fetchNextPage: communityQuery.fetchNextPage,
    hasNextPage: communityQuery.hasNextPage ?? false,
    isFetchingNextPage: communityQuery.isFetchingNextPage,
    hasFollowing: followingIds.length > 0,
  };
}
