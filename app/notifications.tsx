/**
 * Notifications Screen
 *
 * Displays a list of user notifications with:
 * - Header with back button and "Notifications" title
 * - "Mark all as read" button (if unread notifications exist)
 * - FlatList of NotificationItem components
 * - Loading, empty, and error states
 * - Marks notifications as read when screen is viewed
 */

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useNotifications } from '@/hooks/use-notifications';
import { useFollowRequests } from '@/hooks/use-follow-requests';
import { NotificationItem } from '@/components/social/NotificationItem';
import { supabase } from '@/lib/supabase';
import type { Notification, Profile } from '@/lib/database.types';

const BackIcon = ({ color = 'white' }: { color?: string }) => (
  <Svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
  >
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

/**
 * Fetch profiles for multiple actor IDs
 */
async function fetchActorProfiles(
  actorIds: string[]
): Promise<Map<string, Profile>> {
  if (actorIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', actorIds);

  if (error) {
    console.error('Failed to fetch actor profiles:', error);
    return new Map();
  }

  const profileMap = new Map<string, Profile>();
  (data ?? []).forEach((profile) => {
    profileMap.set(profile.id, profile as Profile);
  });

  return profileMap;
}

export default function NotificationsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAllAsRead,
    isMarkingAllAsRead,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useNotifications();

  // Extract unique actor IDs from notifications
  const actorIds = useMemo(() => {
    const ids = notifications
      .map((n) => n.actor_id)
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  }, [notifications]);

  // Fetch actor profiles
  const { data: actorProfiles } = useQuery({
    queryKey: ['actorProfiles', actorIds],
    queryFn: () => fetchActorProfiles(actorIds),
    enabled: actorIds.length > 0,
  });

  // Mark all as read when screen is viewed (after a short delay)
  useEffect(() => {
    if (unreadCount > 0 && !isLoading) {
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 2000); // Mark as read after 2 seconds of viewing

      return () => clearTimeout(timer);
    }
  }, [unreadCount, isLoading, markAllAsRead]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    const data = (notification.data ?? {}) as Record<string, unknown>;

    switch (notification.type) {
      case 'like_review':
        if (data.review_id) {
          router.push(`/review/${data.review_id}` as any);
          return;
        }
        break;
      case 'like_first_take':
      case 'friend_reviewed':
        if (data.tmdb_id) {
          router.push(`/movie/${data.tmdb_id}` as any);
          return;
        }
        break;
      case 'follow_request':
        // Navigate to the requester's profile
        if (notification.actor_id) {
          router.push(`/user/${notification.actor_id}` as any);
          return;
        }
        break;
    }

    // Default: navigate to actor's profile
    if (notification.actor_id) {
      router.push(`/user/${notification.actor_id}` as any);
    }
  };

  const handleMarkAllAsRead = () => {
    if (!isMarkingAllAsRead && unreadCount > 0) {
      markAllAsRead();
    }
  };

  // Follow request handling
  const queryClient = useQueryClient();
  const { acceptRequest, declineRequest, isAccepting, isDeclining } = useFollowRequests();

  // Track which notification is currently being acted upon
  const [activeRequestNotificationId, setActiveRequestNotificationId] = useState<string | null>(null);

  const handleAcceptFollowRequest = useCallback(async (notification: Notification) => {
    const data = (notification.data ?? {}) as Record<string, unknown>;
    const followRequestId = data.follow_request_id as string | undefined;
    if (!followRequestId) return;

    const actorProfile = notification.actor_id
      ? actorProfiles?.get(notification.actor_id)
      : undefined;

    setActiveRequestNotificationId(notification.id);
    try {
      await acceptRequest(followRequestId, actorProfile?.username);
      // Invalidate notifications to refresh the list
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationCount'] });
    } finally {
      setActiveRequestNotificationId(null);
    }
  }, [acceptRequest, actorProfiles, queryClient]);

  const handleDeclineFollowRequest = useCallback(async (notification: Notification) => {
    const data = (notification.data ?? {}) as Record<string, unknown>;
    const followRequestId = data.follow_request_id as string | undefined;
    if (!followRequestId) return;

    const actorProfile = notification.actor_id
      ? actorProfiles?.get(notification.actor_id)
      : undefined;

    setActiveRequestNotificationId(notification.id);
    try {
      await declineRequest(followRequestId, actorProfile?.username);
      // Invalidate notifications to refresh the list
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationCount'] });
    } finally {
      setActiveRequestNotificationId(null);
    }
  }, [declineRequest, actorProfiles, queryClient]);

  const renderNotification = ({ item }: { item: Notification }) => {
    const actorProfile = item.actor_id
      ? actorProfiles?.get(item.actor_id)
      : undefined;

    const isThisAccepting = isAccepting && activeRequestNotificationId === item.id;
    const isThisDeclining = isDeclining && activeRequestNotificationId === item.id;

    return (
      <NotificationItem
        notification={item}
        actorProfile={actorProfile}
        onPress={() => handleNotificationPress(item)}
        onAcceptFollowRequest={handleAcceptFollowRequest}
        onDeclineFollowRequest={handleDeclineFollowRequest}
        isAccepting={isThisAccepting}
        isDeclining={isThisDeclining}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name="notifications-outline"
        size={48}
        color={colors.textSecondary}
      />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        No notifications yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        When someone follows you or interacts with your content, you will see it
        here
      </Text>
    </View>
  );

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Notifications
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Notifications
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={colors.tint}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Unable to load notifications
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Please try again later
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <BackIcon color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Notifications
        </Text>
        {unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAllAsRead}
            disabled={isMarkingAllAsRead}
            style={({ pressed }) => [
              styles.markAllButton,
              { opacity: pressed || isMarkingAllAsRead ? 0.5 : 1 },
            ]}
          >
            <Text style={[styles.markAllText, { color: colors.tint }]}>
              {isMarkingAllAsRead ? 'Marking...' : 'Mark all read'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={[styles.loadMoreButton, { borderColor: colors.border }]}
              onPress={loadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.loadMoreText, { color: colors.tint }]}>
                  Load More
                </Text>
              )}
            </Pressable>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
  },
  backButton: {
    width: 80,
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 80,
  },
  markAllButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  markAllText: {
    ...Typography.body.smMedium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    flexGrow: 1,
    ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    ...Typography.display.h4,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  loadMoreText: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
});
