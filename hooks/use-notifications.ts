import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead as markAsReadService,
  markAllAsRead as markAllAsReadService,
} from '@/lib/notification-service';
import type { Notification } from '@/lib/database.types';

const PAGE_SIZE = 20;

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isMarkingAsRead: boolean;
  isMarkingAllAsRead: boolean;
  loadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  // Query to fetch notifications (first page)
  const {
    data: firstPageData,
    isLoading: isLoadingNotifications,
    error: notificationsError,
  } = useQuery({
    queryKey: ['notifications', user?.id, 0],
    queryFn: () => getNotifications(user!.id, PAGE_SIZE, 0),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Query for additional pages (only when page > 0)
  const {
    data: _additionalData,
    isFetching: isLoadingMore,
  } = useQuery({
    queryKey: ['notifications', user?.id, page],
    queryFn: () => getNotifications(user!.id, PAGE_SIZE, page * PAGE_SIZE),
    enabled: !!user && page > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Accumulate all loaded notifications from cache
  const allNotifications: Notification[] = [];
  for (let p = 0; p <= page; p++) {
    const cached = queryClient.getQueryData<{ notifications: Notification[]; hasMore: boolean }>(
      ['notifications', user?.id, p]
    );
    if (cached) {
      allNotifications.push(...cached.notifications);
    }
  }

  // Determine hasMore from the latest loaded page
  const latestPageData = page === 0 ? firstPageData : queryClient.getQueryData<{ notifications: Notification[]; hasMore: boolean }>(
    ['notifications', user?.id, page]
  );
  const hasMore = latestPageData?.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore]);

  // Query to fetch unread count
  const {
    data: unreadCount,
    isLoading: isLoadingCount,
    error: countError,
  } = useQuery({
    queryKey: ['notificationCount', user?.id],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Mutation to mark a single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => markAsReadService(notificationId),
    onSuccess: () => {
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
    notifications: allNotifications.length > 0 ? allNotifications : (firstPageData?.notifications ?? []),
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
    loadMore,
    hasMore,
    isLoadingMore,
  };
}
