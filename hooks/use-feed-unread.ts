import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

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

      const { data: newPosts } = await supabase
        .from('first_takes')
        .select('id')
        .in('user_id', followingIds)
        .gt('created_at', profile.feed_last_seen_at)
        .limit(1);

      return (newPosts?.length ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 min
    refetchInterval: 2 * 60 * 1000, // Poll every 2 min
  });

  return hasUnread ?? false;
}
