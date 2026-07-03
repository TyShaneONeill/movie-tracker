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

  // Flip one row to read across all cached pages.
  const patchNotificationRead = (notificationId: string) => {
    const pages = queryClient.getQueriesData<{ notifications: Notification[]; hasMore: boolean }>({
      queryKey: ['notifications', user?.id],
    });
    for (const [key, page] of pages) {
      if (!page?.notifications.some((n) => n.id === notificationId && !n.read)) continue;
      queryClient.setQueryData(key, {
        ...page,
        notifications: page.notifications.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        ),
      });
    }
  };

  // Mutation to mark a single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => markAsReadService(notificationId),
    // Optimistically flip the tapped row to read so its dot is already gone
    // when the user navigates back — no waiting on server round-trip/refetch.
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.id] });
      patchNotificationRead(notificationId);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notificationCount', user?.id] });
    },
    onSuccess: (_data, notificationId) => {
      // Re-assert after the server write commits: an in-flight list refetch
      // that snapshotted BEFORE the mark-read committed can land after the
      // optimistic patch and overwrite it with stale unread rows (#580
      // device repro). Post-commit, read=true IS server truth.
      patchNotificationRead(notificationId);
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
    // Zero the badge immediately — it must clear even if the user leaves the
    // notifications screen before the server write lands.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notificationCount', user?.id] });
      queryClient.setQueryData(['notificationCount', user?.id], 0);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationCount', user?.id] });
    },
    onSuccess: () => {
      // Mark the list stale WITHOUT refetching now: row dots stay visible for
      // the current session (so the user can see what's new) and clear
      // individually on tap; the next visit refetches everything as read.
      queryClient.invalidateQueries({
        queryKey: ['notifications', user?.id],
        refetchType: 'none',
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
