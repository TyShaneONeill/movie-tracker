import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import {
  uploadAvatar,
  updateProfileAvatarUrl,
  deleteAvatar,
} from '@/lib/avatar-service';
import type { Database, Profile } from '@/lib/database.types';

/**
 * Fetch a user's profile from Supabase
 */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    // Profile might not exist yet (returns PGRST116 error code)
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[useProfile] Fetch error:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new profile in Supabase
 */
async function createProfile(userId: string): Promise<Profile> {
  const insertData: Database['public']['Tables']['profiles']['Insert'] = { id: userId };

  const { data, error } = await (supabase
    .from('profiles') as any)
    .insert(insertData)
    .select()
    .single() as { data: Profile | null; error: any };

  if (error) {
    console.error('[useProfile] Create error:', error);
    throw error;
  }

  return data as Profile;
}

export interface ProfileStats {
  watched: number;
  watchlist: number;
  watching: number;
  firstTakes: number;
  lists: number;
}

/**
 * Fetch profile stats (watched count, watchlist count, watching count, first takes count, lists count)
 */
async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  // Run all count queries in parallel
  const [watchedResult, watchlistResult, watchingResult, firstTakesResult, listsResult] = await Promise.all([
    supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'watched'),
    supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'watchlist'),
    supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'watching'),
    supabase
      .from('first_takes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('user_lists')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  // Calculate total lists: user lists + special lists (watchlist/watching) if they have movies
  const userListsCount = listsResult.count ?? 0;
  const hasWatchlist = (watchlistResult.count ?? 0) > 0 ? 1 : 0;
  const hasWatching = (watchingResult.count ?? 0) > 0 ? 1 : 0;
  const totalLists = userListsCount + hasWatchlist + hasWatching;

  return {
    watched: watchedResult.count ?? 0,
    watchlist: watchlistResult.count ?? 0,
    watching: watchingResult.count ?? 0,
    firstTakes: firstTakesResult.count ?? 0,
    lists: totalLists,
  };
}

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch profile query
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      let profile = await fetchProfile(user!.id);

      // Create profile if it doesn't exist
      if (!profile) {
        profile = await createProfile(user!.id);
      }

      return profile;
    },
    enabled: !!user,
  });

  // Fetch profile stats query
  const statsQuery = useQuery({
    queryKey: ['profileStats', user?.id],
    queryFn: () => fetchProfileStats(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update avatar mutation
  const updateAvatarMutation = useMutation({
    mutationFn: async ({
      imageUri,
      mimeType,
    }: {
      imageUri: string;
      mimeType?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      // Upload the image
      const uploadResult = await uploadAvatar(user.id, imageUri, mimeType);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Failed to upload avatar');
      }

      // Update the profile with the new URL
      const updateResult = await updateProfileAvatarUrl(user.id, uploadResult.url!);

      if (!updateResult.success) {
        throw new Error(updateResult.error ?? 'Failed to update profile');
      }

      return uploadResult.url!;
    },
    onSuccess: (newAvatarUrl) => {
      // Optimistically update the cache
      queryClient.setQueryData(['profile', user?.id], (oldData: Profile | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString(),
        };
      });

      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  // Update profile fields mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: {
      fullName?: string;
      username?: string;
      bio?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const updateData: Database['public']['Tables']['profiles']['Update'] = {
        full_name: updates.fullName,
        username: updates.username,
        bio: updates.bio,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (supabase
        .from('profiles') as any)
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single() as { data: Profile | null; error: any };

      if (error) {
        console.error('[useProfile] Update error:', error);
        throw error;
      }

      return data as Profile;
    },
    onSuccess: (updatedProfile) => {
      // Update the cache with the new profile data
      queryClient.setQueryData(['profile', user?.id], updatedProfile);
    },
  });

  // Delete avatar mutation
  const deleteAvatarMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // Delete from storage
      const deleteResult = await deleteAvatar(user.id);

      if (!deleteResult.success) {
        throw new Error(deleteResult.error ?? 'Failed to delete avatar');
      }

      // Clear the avatar URL in profile
      const updateResult = await updateProfileAvatarUrl(user.id, null);

      if (!updateResult.success) {
        throw new Error(updateResult.error ?? 'Failed to update profile');
      }
    },
    onSuccess: () => {
      // Optimistically update the cache
      queryClient.setQueryData(['profile', user?.id], (oldData: Profile | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        };
      });

      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  return {
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    error: profileQuery.error,
    refetch: profileQuery.refetch,

    // Profile stats
    stats: statsQuery.data ?? { watched: 0, watchlist: 0, watching: 0, firstTakes: 0, lists: 0 },
    isLoadingStats: statsQuery.isLoading,
    refetchStats: statsQuery.refetch,

    // Profile update mutation
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
    updateProfileError: updateProfileMutation.error,

    // Avatar mutations
    updateAvatar: updateAvatarMutation.mutateAsync,
    isUpdatingAvatar: updateAvatarMutation.isPending,
    updateAvatarError: updateAvatarMutation.error,

    deleteAvatar: deleteAvatarMutation.mutateAsync,
    isDeletingAvatar: deleteAvatarMutation.isPending,
    deleteAvatarError: deleteAvatarMutation.error,
  };
}
