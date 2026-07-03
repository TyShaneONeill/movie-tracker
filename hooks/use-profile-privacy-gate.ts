import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isFollowing as fetchIsFollowing } from '@/lib/follow-service';
import { useAuth } from './use-auth';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * Gate for surfaces that expose another user's social graph
 * (followers/following lists).
 *
 * Locked when the target profile is private and the viewer is neither the
 * owner nor an accepted follower. RLS enforces this server-side (see
 * 20260702190000_fix_follows_privacy_rls.sql); this gate exists so the UI
 * shows an explicit locked state instead of a confusing empty list.
 */
export function useProfilePrivacyGate(targetUserId: string) {
  const { user } = useAuth();
  const isOwn = !!user && user.id === targetUserId;

  const { data: isPrivate, isLoading: isLoadingPrivacy } = useQuery({
    queryKey: ['profilePrivacy', targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', targetUserId)
        .single();
      if (error) throw error;
      return (data as { is_private?: boolean } | null)?.is_private ?? false;
    },
    enabled: !!targetUserId && !isOwn,
    staleTime: FIVE_MINUTES,
  });

  // Same query key as useFollow's status query so the result is cache-shared.
  const { data: followingStatus, isLoading: isLoadingFollow } = useQuery({
    queryKey: ['followStatus', user?.id, targetUserId],
    queryFn: () => fetchIsFollowing(user!.id, targetUserId),
    enabled: !!user && !!targetUserId && !isOwn,
  });

  const isLoading = !isOwn && (isLoadingPrivacy || isLoadingFollow);
  const isLocked = !isOwn && !isLoading && !!isPrivate && !followingStatus;

  return { isLocked, isLoading };
}
