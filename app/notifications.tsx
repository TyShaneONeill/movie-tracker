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

import React, { useEffect, useMemo } from 'react';
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
import { useQuery } from '@tanstack/react-query';

import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useNotifications } from '@/hooks/use-notifications';
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
    // Navigate to actor's profile if there's an actor
    if (notification.actor_id) {
      router.push(`/user/${notification.actor_id}`);
    }
  };

  const handleMarkAllAsRead = () => {
    if (!isMarkingAllAsRead && unreadCount > 0) {
      markAllAsRead();
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const actorProfile = item.actor_id
      ? actorProfiles?.get(item.actor_id)
      : undefined;

    return (
      <NotificationItem
        notification={item}
        actorProfile={actorProfile}
        onPress={() => handleNotificationPress(item)}
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
});
