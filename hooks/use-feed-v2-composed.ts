import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usePrioritizedFeed } from '@/hooks/use-prioritized-feed';
import { useSuggestedUsers } from '@/hooks/use-suggested-users';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import { useAds } from '@/lib/ads-context';
import { fetchTopComments } from '@/lib/feed-service';
import { buildFeedV2Items, type FeedV2Filter, type FeedV2Item } from '@/lib/feed-v2-logic';
import type { SuggestedUser } from '@/lib/suggested-users-service';

/**
 * Data composer for the Feed v2 screen. Reuses the existing prioritized-feed
 * queries (byte-identical data source), adds one batched top-comment read, and
 * folds the raw streams into the flat typed item list via the pure builder.
 *
 * Returns the same paging/refresh surface the legacy screen consumes, plus the
 * composed `items` and the filtered `suggestions` for the "Shared taste" rail.
 */
export function useFeedV2Composed(userId: string | undefined, filter: FeedV2Filter) {
  const feed = usePrioritizedFeed(userId, filter === 'friends' ? 'friends' : 'all');
  const { followingItems, communityItems } = feed;

  const { suggestions: rawSuggestions } = useSuggestedUsers();
  const { blockedIds } = useBlockedUsers();
  const { adsEnabled } = useAds();
  const suggestions: SuggestedUser[] = useMemo(
    () => rawSuggestions.filter((u) => !blockedIds.includes(u.id)),
    [rawSuggestions, blockedIds]
  );

  // Artifact refs across both streams drive the batched top-comment read. Key on
  // the sorted id set so the query only re-runs when the visible artifacts change
  // (e.g. a new page loads), not on every render.
  const artifactRefs = useMemo(
    () =>
      [...followingItems, ...communityItems]
        .filter((i) => i.activityType !== 'comment')
        .map((i) => ({ id: i.id, activityType: i.activityType })),
    [followingItems, communityItems]
  );

  const topCommentsKey = useMemo(
    () => artifactRefs.map((a) => a.id).sort().join(','),
    [artifactRefs]
  );

  const topCommentsQuery = useQuery({
    queryKey: ['feed-v2-top-comments', topCommentsKey],
    queryFn: () => fetchTopComments(artifactRefs),
    enabled: artifactRefs.length > 0,
    staleTime: 60 * 1000,
  });

  const items: FeedV2Item[] = useMemo(
    () =>
      buildFeedV2Items({
        followingItems,
        communityItems,
        topComments: topCommentsQuery.data ?? new Map(),
        railEnabled: suggestions.length > 0,
        adsEnabled,
        filter,
        now: new Date(),
      }),
    [followingItems, communityItems, topCommentsQuery.data, suggestions.length, adsEnabled, filter]
  );

  const hasContent = items.some((i) => i.kind === 'artifact' || i.kind === 'murmur');

  return {
    items,
    suggestions,
    hasContent,
    isLoading: feed.isLoading,
    isError: feed.isError,
    refetch: feed.refetch,
    refreshIfStale: feed.refreshIfStale,
    fetchNextPage: feed.fetchNextPage,
    hasNextPage: feed.hasNextPage,
    isFetchingNextPage: feed.isFetchingNextPage,
  };
}
