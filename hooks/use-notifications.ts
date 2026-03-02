import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead as markAsReadService,
  markAllAsRead as markAllAsReadService,
} from '@/lib/notification-service';
import type { Notification } from '@/lib/database.types';

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isMarkingAsRead: boolean;
  isMarkingAllAsRead: boolean;
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Query to fetch notifications
  const {
    data: notifications,
    isLoading: isLoadingNotifications,
    error: notificationsError,
  } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Query to fetch unread count
  const {
    data: unreadCount,
    isLoading: isLoadingCount,
    error: countError,
  } = useQuery({
    queryKey: ['notificationCount', user?.id],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Mutation to mark a single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => markAsReadService(notificationId),
    onSuccess: () => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['notifications', user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['notificationCount', user?.id],
      });
    },
  });

  // Mutation to mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not authenticated');
      return markAllAsReadService(user.id);
    },
    onSuccess: () => {
      // Invalidate queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: ['notifications', user?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['notificationCount', user?.id],
      });
    },
  });

  const markAsRead = async (notificationId: string): Promise<void> => {
    await markAsReadMutation.mutateAsync(notificationId);
  };

  const markAllAsRead = async (): Promise<void> => {
    await markAllAsReadMutation.mutateAsync();
  };

  return {
    notifications: notifications ?? [],
    unreadCount: unreadCount ?? 0,
    isLoading: isLoadingNotifications || isLoadingCount,
    error:
      (notificationsError as Error | null) ??
      (countError as Error | null) ??
      (markAsReadMutation.error as Error | null) ??
      (markAllAsReadMutation.error as Error | null),
    markAsRead,
    markAllAsRead,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
  };
}
