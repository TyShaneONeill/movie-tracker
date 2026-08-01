import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AUTO_ADVANCE_PAGE_CAP } from '@/hooks/use-prioritized-feed';
import type { ActivityFeedItem, FirstTakeWithProfile } from './use-activity-feed';
import { ACTIVITY_FEED_SELECT, mapToFeedItem } from './use-activity-feed';
import { filterPubliclyVisibleBy } from '@/lib/first-take-visibility';

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
    .like('quote_text', '_%')
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
  // Cursor comes from the RAW page, not the filtered one: dropping wordless
  // takes must shorten the page, never stall pagination on a short page.
  const nextCursor =
    rows.length === PAGE_SIZE
      ? rows[rows.length - 1].created_at
      : null;

  const items = filterPubliclyVisibleBy(
    rows.map(mapToFeedItem),
    (item) => item.quoteText
  );

  return { items, nextCursor };
}

/**
 * Hook for infinite scroll pagination of the activity feed.
 * Uses cursor-based pagination with created_at timestamp.
 *
 * Auto-advances past pages that filter down to nothing, bounded by
 * AUTO_ADVANCE_PAGE_CAP — a page is fetched at PAGE_SIZE and filtered after, so
 * a full page can render empty, and an empty list never fires onEndReached to
 * ask for more. Same rule as the community feed in use-prioritized-feed.
 */
export function useInfiniteActivityFeed() {
  const query = useInfiniteQuery({
    queryKey: ['activity-feed', 'infinite'],
    queryFn: ({ pageParam }) => fetchActivityPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 5 * 60 * 1000,
  });

  const autoAdvancedPages = useRef(0);
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const pages = data?.pages;
    if (!pages || pages.length === 0) return;

    if (pages[pages.length - 1].items.length > 0) {
      autoAdvancedPages.current = 0;
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;
    if (autoAdvancedPages.current >= AUTO_ADVANCE_PAGE_CAP) return;

    autoAdvancedPages.current += 1;
    fetchNextPage();
  }, [data, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return query;
}
