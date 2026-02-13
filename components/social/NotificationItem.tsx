/**
 * NotificationItem Component
 *
 * Displays a single notification row with:
 * - Unread indicator (dot) on left side if not read
 * - Actor avatar (who triggered notification)
 * - Message based on notification type
 * - Relative timestamp
 * - Tappable to navigate to actor's profile
 */

import React from 'react';
import { StyleSheet, View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/lib/theme-context';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { Notification } from '@/lib/database.types';

interface NotificationItemProps {
  notification: Notification;
  actorProfile?: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
  onPress?: () => void;
}

/**
 * Formats a date string into a relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else {
    return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  }
}

/**
 * Generates the notification message based on type
 */
function getNotificationMessage(
  type: string,
  actorName: string,
  data: Record<string, unknown>
): string {
  switch (type) {
    case 'follow':
      return `${actorName} followed you`;
    case 'like_first_take':
      const movieTitle = data.movie_title as string | undefined;
      return movieTitle
        ? `${actorName} liked your First Take on ${movieTitle}`
        : `${actorName} liked your First Take`;
    case 'comment':
      const commentMovieTitle = data.movie_title as string | undefined;
      return commentMovieTitle
        ? `${actorName} commented on your review of ${commentMovieTitle}`
        : `${actorName} commented on your review`;
    case 'list_follow':
      const listTitle = data.list_title as string | undefined;
      return listTitle
        ? `${actorName} followed your list "${listTitle}"`
        : `${actorName} followed your list`;
    case 'mention':
      return `${actorName} mentioned you`;
    default:
      return `${actorName} interacted with you`;
  }
}

export function NotificationItem({
  notification,
  actorProfile,
  onPress,
}: NotificationItemProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const actorName =
    actorProfile?.full_name ||
    actorProfile?.username ||
    'Someone';

  const message = getNotificationMessage(
    notification.type,
    actorName,
    (notification.data ?? {}) as Record<string, unknown>
  );

  const relativeTime = formatRelativeTime(notification.created_at);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: colors.card },
          !notification.read && styles.unreadContainer,
        ]}
      >
        {/* Unread Indicator */}
        {!notification.read && (
          <View
            style={[styles.unreadDot, { backgroundColor: colors.tint }]}
          />
        )}

        {/* Actor Avatar */}
        <View style={styles.avatarContainer}>
          {actorProfile?.avatar_url ? (
            <Image
              source={{ uri: actorProfile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarPlaceholder,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Ionicons name="person" size={20} color={colors.textSecondary} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <ThemedText
            style={[
              Typography.body.sm,
              styles.message,
              !notification.read && styles.unreadText,
            ]}
            numberOfLines={2}
          >
            {message}
          </ThemedText>
          <ThemedText
            style={[
              Typography.body.xs,
              styles.timestamp,
              { color: colors.textTertiary },
            ]}
          >
            {relativeTime}
          </ThemedText>
        </View>

        {/* Chevron */}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textTertiary}
          style={styles.chevron}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  unreadContainer: {
    // Slightly different styling for unread notifications
  },
  pressed: {
    opacity: 0.7,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  avatarContainer: {
    marginRight: Spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  message: {
    marginBottom: 2,
  },
  unreadText: {
    fontWeight: '500',
  },
  timestamp: {
    // Color set dynamically
  },
  chevron: {
    marginLeft: Spacing.xs,
  },
});

export default NotificationItem;
