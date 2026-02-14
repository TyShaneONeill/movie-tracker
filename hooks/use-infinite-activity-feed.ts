import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ActivityFeedItem, FirstTakeWithProfile } from './use-activity-feed';
import { ACTIVITY_FEED_SELECT, mapToFeedItem } from './use-activity-feed';

const PAGE_SIZE = 20;

interface ActivityFeedPage {
  items: ActivityFeedItem[];
  nextCursor: string | null;
}

/**
 * Fetches a single page of activity feed items with cursor-based pagination.
 * Uses a single JOINed query (first_takes + profiles) instead of N+1 queries.
 */
async function fetchActivityPage(cursor?: string): Promise<ActivityFeedPage> {
  let query = supabase
    .from('first_takes')
    .select(ACTIVITY_FEED_SELECT)
    .neq('quote_text', '')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (!data || data.length === 0) {
    return { items: [], nextCursor: null };
  }

  const rows = data as unknown as FirstTakeWithProfile[];
  const items = rows.map(mapToFeedItem);

  const nextCursor =
    rows.length === PAGE_SIZE
      ? rows[rows.length - 1].created_at
      : null;

  return { items, nextCursor };
}

/**
 * Hook for infinite scroll pagination of the activity feed.
 * Uses cursor-based pagination with created_at timestamp.
 */
export function useInfiniteActivityFeed() {
  return useInfiniteQuery({
    queryKey: ['activity-feed', 'infinite'],
    queryFn: ({ pageParam }) => fetchActivityPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 5 * 60 * 1000,
  });
}
