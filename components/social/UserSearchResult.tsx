/**
 * UserSearchResult Component
 *
 * Displays a user search result card with avatar, name, username,
 * movie count, and a follow button.
 */

import React from 'react';
import { StyleSheet, View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FollowButton } from '@/components/social/FollowButton';
import { useTheme } from '@/lib/theme-context';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface UserSearchResultProps {
  user: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    movie_count: number;
  };
  onPress?: () => void;
}

export function UserSearchResult({ user, onPress }: UserSearchResultProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const displayName = user.full_name || user.username || 'Unknown User';
  const usernameDisplay = user.username ? `@${user.username}` : '';
  const movieCountText = `${user.movie_count} ${user.movie_count === 1 ? 'movie' : 'movies'}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        pressed && styles.pressed,
      ]}
    >
      <ThemedView style={styles.card}>
        {/* Avatar */}
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.card }]}>
            <Ionicons name="person" size={24} color={colors.textSecondary} />
          </View>
        )}

        {/* User Info */}
        <View style={styles.info}>
          <ThemedText style={[Typography.body.baseMedium, styles.displayName]} numberOfLines={1}>
            {displayName}
          </ThemedText>
          {usernameDisplay ? (
            <ThemedText style={[Typography.body.sm, styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
              {usernameDisplay}
            </ThemedText>
          ) : null}
          <ThemedText style={[Typography.body.sm, styles.movieCount, { color: colors.textTertiary }]}>
            {movieCountText}
          </ThemedText>
        </View>

        {/* Follow Button */}
        <FollowButton userId={user.id} username={user.username} size="sm" style={styles.followButton} />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  displayName: {
    marginBottom: 2,
  },
  username: {
    marginBottom: 2,
  },
  movieCount: {
    // Color set dynamically
  },
  followButton: {
    marginLeft: Spacing.sm,
  },
});

export default UserSearchResult;
