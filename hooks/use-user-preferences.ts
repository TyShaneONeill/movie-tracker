import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import type { Database, ReviewVisibility } from '@/lib/database.types';

export interface UserPreferences {
  firstTakePromptEnabled: boolean;
  reviewVisibility: ReviewVisibility;
  defaultCollectionView: 'movies' | 'tv';
}

export interface UseUserPreferencesResult {
  preferences: UserPreferences | null;
  isLoading: boolean;
  updatePreference: (key: keyof UserPreferences, value: UserPreferences[keyof UserPreferences]) => Promise<void>;
  isUpdating: boolean;
}

/**
 * Map from camelCase preference keys to database column names
 */
const preferenceToColumnMap: Record<keyof UserPreferences, string> = {
  firstTakePromptEnabled: 'first_take_prompt_enabled',
  reviewVisibility: 'review_visibility',
  defaultCollectionView: 'default_collection_view',
};

/**
 * Fetch user preferences from the profiles table
 */
async function fetchUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_take_prompt_enabled, review_visibility, default_collection_view')
    .eq('id', userId)
    .single();

  if (error) {
    // Profile might not exist yet
    if (error.code === 'PGRST116') {
      return null;
    }
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'fetch-user-preferences' });
    throw error;
  }

  const profileData = data as { first_take_prompt_enabled: boolean | null; review_visibility: ReviewVisibility | null; default_collection_view: string | null } | null;

  return {
    // Default to true for backwards compatibility (existing users without preference set)
    firstTakePromptEnabled: profileData?.first_take_prompt_enabled ?? true,
    // Default to 'public' for backwards compatibility
    reviewVisibility: profileData?.review_visibility ?? 'public',
    defaultCollectionView: profileData?.default_collection_view === 'tv' ? 'tv' : 'movies',
  };
}

/**
 * Update a user preference in the profiles table
 */
async function updateUserPreference(
  userId: string,
  key: keyof UserPreferences,
  value: UserPreferences[keyof UserPreferences]
): Promise<void> {
  // Build update data based on the preference key
  const updateData: Database['public']['Tables']['profiles']['Update'] = {
    updated_at: new Date().toISOString(),
  };

  if (key === 'firstTakePromptEnabled') {
    updateData.first_take_prompt_enabled = value as boolean;
  } else if (key === 'reviewVisibility') {
    updateData.review_visibility = value as ReviewVisibility;
  } else if (key === 'defaultCollectionView') {
    updateData.default_collection_view = value as string;
  }

  // Use type assertion to work around Supabase client generic inference issue
  const { error } = await (supabase
    .from('profiles') as ReturnType<typeof supabase.from>)
    .update(updateData as Record<string, unknown>)
    .eq('id', userId);

  if (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'update-user-preference' });
    throw error;
  }
}

/**
 * Hook to manage user preferences from the profiles table
 *
 * @example
 * const { preferences, isLoading, updatePreference, isUpdating } = useUserPreferences();
 *
 * // Toggle first take prompt
 * await updatePreference('firstTakePromptEnabled', true);
 */
export function useUserPreferences(): UseUserPreferencesResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch preferences query
  const preferencesQuery = useQuery({
    queryKey: ['userPreferences', user?.id],
    queryFn: () => fetchUserPreferences(user!.id),
    enabled: !!user,
  });

  // Update preference mutation
  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ key, value }: { key: keyof UserPreferences; value: UserPreferences[keyof UserPreferences] }) => {
      if (!user) throw new Error('User not authenticated');
      await updateUserPreference(user.id, key, value);
      return { key, value };
    },
    onMutate: async ({ key, value }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['userPreferences', user?.id] });

      // Snapshot the previous value
      const previousPreferences = queryClient.getQueryData<UserPreferences>(['userPreferences', user?.id]);

      // Optimistically update to the new value
      queryClient.setQueryData<UserPreferences | null>(['userPreferences', user?.id], (old) => {
        if (!old) return { [key]: value } as unknown as UserPreferences;
        return { ...old, [key]: value };
      });

      // Return context with the previous value
      return { previousPreferences };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(['userPreferences', user?.id], context.previousPreferences);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['userPreferences', user?.id] });
    },
  });

  const updatePreference = async (key: keyof UserPreferences, value: UserPreferences[keyof UserPreferences]): Promise<void> => {
    await updatePreferenceMutation.mutateAsync({ key, value });
  };

  return {
    preferences: preferencesQuery.data ?? null,
    isLoading: preferencesQuery.isLoading,
    updatePreference,
    isUpdating: updatePreferenceMutation.isPending,
  };
}
