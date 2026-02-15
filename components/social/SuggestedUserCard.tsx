import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { FollowButton } from '@/components/social/FollowButton';
import { buildAvatarUrl } from '@/lib/avatar-service';
import type { SuggestedUser } from '@/lib/suggested-users-service';

interface SuggestedUserCardProps {
  user: SuggestedUser;
}

export function SuggestedUserCard({ user }: SuggestedUserCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const avatarSource = buildAvatarUrl(user.avatarUrl)
    ? { uri: buildAvatarUrl(user.avatarUrl)! }
    : undefined;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/user/${user.id}`)}
    >
      <View style={styles.avatarContainer}>
        {avatarSource ? (
          <Image
            source={avatarSource}
            style={styles.avatar}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
            <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
              {(user.fullName || user.username || '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>
        {user.fullName || user.username}
      </Text>

      <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
        @{user.username}
      </Text>

      <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={2}>
        {user.reason}
      </Text>

      <View style={styles.followButtonContainer}>
        <FollowButton userId={user.id} username={user.username} size="sm" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '600',
  },
  displayName: {
    ...Typography.body.smMedium,
    textAlign: 'center',
    marginBottom: 2,
  },
  username: {
    ...Typography.body.xs,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  reason: {
    ...Typography.body.xs,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    lineHeight: 16,
  },
  followButtonContainer: {
    marginTop: 'auto',
  },
});
