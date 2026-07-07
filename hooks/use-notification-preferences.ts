import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPreference,
  setNotificationPreference,
  NOTIFICATION_FEATURE_DEFAULTS,
  type NotificationFeature,
} from '@/lib/notification-preferences-service';

export function useNotificationPreference(feature: NotificationFeature) {
  const queryClient = useQueryClient();
  const queryKey = ['notification-preference', feature];

  const query = useQuery({
    queryKey,
    queryFn: () => getNotificationPreference(feature),
    staleTime: 1000 * 60 * 5,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => setNotificationPreference(feature, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    // Absent row (query.data === null) resolves through the shared default —
    // see NOTIFICATION_FEATURE_DEFAULTS (PS-15 PR 0).
    enabled: query.data ?? NOTIFICATION_FEATURE_DEFAULTS[feature],
    isLoading: query.isLoading,
    setEnabled: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
