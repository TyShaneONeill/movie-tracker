import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPreference,
  setNotificationPreference,
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
    // Opt-out default: when no row exists the user has NOT opted out, and the
    // delivery side (send-push-notification) sends to them. Default ON so the
    // toggle honestly reflects that reminders are active. See
    // notification-preferences-service for the full semantics.
    enabled: query.data ?? true,
    isLoading: query.isLoading,
    setEnabled: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
