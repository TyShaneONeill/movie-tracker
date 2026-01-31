import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FirstTake, Profile } from '@/lib/database.types';
import type { ActivityFeedItem } from './use-activity-feed';

const PAGE_SIZE = 20;

// Type for the first_takes query result
type FirstTakeQueryResult = Pick<
  FirstTake,
  'id' | 'user_id' | 'tmdb_id' | 'movie_title' | 'poster_path' | 'rating' | 'quote_text' | 'is_spoiler' | 'created_at'
>;

// Type for the profiles query result
type ProfileQueryResult = Pick<Profile, 'id' | 'full_name' | 'username' | 'avatar_url'>;

interface ActivityFeedPage {
  items: ActivityFeedItem[];
  nextCursor: string | null;
}

/**
 * Fetches a single page of activity feed items with cursor-based pagination
 */
async function fetchActivityPage(cursor?: string): Promise<ActivityFeedPage> {
  // Build query with cursor pagination
  let query = supabase
    .from('first_takes')
    .select(
      'id, user_id, tmdb_id, movie_title, poster_path, rating, quote_text, is_spoiler, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  // Apply cursor filter for pagination
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: firstTakesData, error: firstTakesError } = await query;
  if (firstTakesError) throw firstTakesError;

  const firstTakes = firstTakesData as FirstTakeQueryResult[] | null;

  // Return empty page if no results
  if (!firstTakes || firstTakes.length === 0) {
    return { items: [], nextCursor: null };
  }

  // Fetch profiles for all users in this page
  const userIds = [...new Set(firstTakes.map((ft) => ft.user_id))];
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', userIds);

  if (profilesError) throw profilesError;

  const profiles = profilesData as ProfileQueryResult[] | null;

  // Create lookup map for profiles
  const profileMap = new Map<string, ProfileQueryResult>();
  (profiles ?? []).forEach((profile) => {
    profileMap.set(profile.id, profile);
  });

  // Merge first takes with profile data
  const items: ActivityFeedItem[] = firstTakes.map((item) => {
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
      userDisplayName: profile?.full_name || profile?.username || 'Anonymous',
      userAvatarUrl: profile?.avatar_url ?? null,
    };
  });

  // Determine next cursor (last item's created_at if we got a full page)
  const nextCursor =
    firstTakes.length === PAGE_SIZE
      ? firstTakes[firstTakes.length - 1].created_at
      : null;

  return { items, nextCursor };
}

/**
 * Hook for infinite scroll pagination of the activity feed
 *
 * Uses cursor-based pagination with created_at timestamp to avoid
 * duplicates when new items are added during scrolling.
 */
export function useInfiniteActivityFeed() {
  return useInfiniteQuery({
    queryKey: ['activity-feed', 'infinite'],
    queryFn: ({ pageParam }) => fetchActivityPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
