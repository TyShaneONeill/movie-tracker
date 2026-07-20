import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, notifyManager } from '@tanstack/react-query';
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
  removeRequestCards: (actorId: string) => void;
  clearUnreadForRequests: (actorId: string) => Promise<void>;
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

  // Drop every follow_request card from a requester out of all cached pages.
  // Synchronous cache surgery so a resolved (accepted/declined/stale) card
  // leaves the visible list immediately — the pages are read straight from the
  // cache during render, so waiting on an invalidation refetch leaves the card
  // on screen with live buttons until remount (second tap → "follow request
  // not found" toast). Server delete + invalidation remain the reconciliation.
  const removeRequestCards = (actorId: string) => {
    const pages = queryClient.getQueriesData<{ notifications: Notification[]; hasMore: boolean }>({
      queryKey: ['notifications', user?.id],
    });
    for (const [key, page] of pages) {
      if (!page?.notifications.some((n) => n.type === 'follow_request' && n.actor_id === actorId)) continue;
      queryClient.setQueryData(key, {
        ...page,
        notifications: page.notifications.filter(
          (n) => !(n.type === 'follow_request' && n.actor_id === actorId)
        ),
      });
    }
  };

  // Deterministically drop the badge count for the unread follow_request
  // card(s) from an actor as they're resolved (accepted/declined).
  //
  // The badge is count(notifications WHERE read=false). A pending
  // follow_request card is unread by design — the notifications screen's
  // mark-read-on-open EXCLUDES follow_request so its badge survives until the
  // Accept/Decline decision (#9 audit finding). Resolving it deletes the row
  // server-side, so the true count drops; the resolve path then invalidates
  // notificationCount to pick that up.
  //
  // But plain invalidation loses a race (the #580 class the list/cards are
  // already hardened against): opening the screen fires a count refetch
  // (markReadableNotificationsAsRead) that snapshots the count BEFORE the
  // accept commits — and, because follow_request rows are excluded from
  // mark-read, that snapshot still COUNTS the pending card. If the user
  // accepts before that fetch resolves, React Query dedups the post-accept
  // invalidation into the in-flight stale fetch, and the cache settles on the
  // pre-accept count — the badge stays lit even though the server is already
  // at 0 (confirmed in prod: unread=0, badge stuck). markAllAsRead guards the
  // identical race with cancelQueries + setQueryData; this path did not.
  //
  // Fix, mirroring markAllAsRead's onMutate: cancel any in-flight count fetch
  // (kills the stale snapshot), then deterministically subtract the unread
  // request cards being removed. The caller's invalidate reconciles against
  // server truth afterward (a fresh fetch post-accept reads the committed 0).
  // Must run BEFORE removeRequestCards so the rows are still in cache to count.
  //
  // The decrement is wrapped in notifyManager.batch() so this ad-hoc cache
  // write flushes its observer notifications the same way a mutation's writes
  // do — the bell is a useQuery observer that typically lives on a *different*
  // screen than the notifications list (the feed / profile tab), and batching
  // keeps every count observer's update on one consistent notification pass
  // rather than the deferred per-write scheduler. Note #731's write already
  // reached the cache correctly; its CI failure came from its own tests reading
  // unreadCount synchronously right after awaiting this, which never observes
  // the (async-dispatched) re-render — the count assertions must waitFor, as
  // the removeRequestCards tests already do.
  const clearUnreadForRequests = async (actorId: string): Promise<void> => {
    // Stop the race first: neutralize any in-flight pre-accept count fetch (the
    // screen-open snapshot that still counts the pending follow_request, since
    // those rows are excluded from mark-read) so it can't land stale on top of
    // the value we're about to write.
    await queryClient.cancelQueries({ queryKey: ['notificationCount', user?.id] });
    const pages = queryClient.getQueriesData<{ notifications: Notification[]; hasMore: boolean }>({
      queryKey: ['notifications', user?.id],
    });
    const removedIds = new Set<string>();
    for (const [, page] of pages) {
      for (const notif of page?.notifications ?? []) {
        if (notif.type === 'follow_request' && notif.actor_id === actorId && !notif.read) {
          removedIds.add(notif.id);
        }
      }
    }
    if (removedIds.size === 0) return;
    notifyManager.batch(() => {
      queryClient.setQueryData<number>(['notificationCount', user?.id], (old) =>
        Math.max(0, (old ?? 0) - removedIds.size)
      );
    });
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
    removeRequestCards,
    clearUnreadForRequests,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}
