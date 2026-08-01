import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { hasTakeWords } from '@/lib/first-take-visibility';

/**
 * How many recent posts the unread probe inspects. Only whitespace-only takes
 * survive the SQL guard, so a run of 20 of them behind a real post is not a
 * case worth paging for — it would under-report the dot, never over-report it.
 */
const UNREAD_PROBE_WINDOW = 20;

/**
 * Lightweight hook that checks if there are new feed posts since the user
 * last viewed the Feed tab. Returns a boolean for showing an unread dot.
 */
export function useFeedUnread(): boolean {
  const { user } = useAuth();

  const { data: hasUnread } = useQuery({
    queryKey: ['feed-unread', user?.id],
    queryFn: async () => {
      if (!user) return false;

      // Get the user's last seen timestamp
      const { data: profile } = await supabase
        .from('profiles')
        .select('feed_last_seen_at')
        .eq('id', user.id)
        .single();

      if (!profile?.feed_last_seen_at) return false;

      // Check if any followed user has posted since then
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (!follows || follows.length === 0) return false;

      const followingIds = follows.map(f => f.following_id);

      // The dot must summarize the list the Feed actually renders, so it
      // applies the same wordless-take filter (the `.like` catches '' but not
      // whitespace-only — see lib/first-take-visibility). A small window rather
      // than limit(1): with limit(1) a single wordless post would hide the dot
      // even when worded posts sit right behind it.
      const { data: newPosts } = await supabase
        .from('first_takes')
        .select('id, quote_text')
        .in('user_id', followingIds)
        .gt('created_at', profile.feed_last_seen_at)
        .like('quote_text', '_%')
        .limit(UNREAD_PROBE_WINDOW);

      return (newPosts ?? []).some((post) => hasTakeWords(post.quote_text));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 min
    refetchInterval: 2 * 60 * 1000, // Poll every 2 min
  });

  return hasUnread ?? false;
}
