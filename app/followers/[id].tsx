/**
 * Followers List Screen
 * Displays a list of users who follow a specific user
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useFollowers } from '@/hooks/use-followers';
import { FollowButton } from '@/components/social/FollowButton';
import type { Profile } from '@/lib/database.types';

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

export default function FollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const { followers, isLoading, isError } = useFollowers(id!);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleUserPress = (userId: string) => {
    router.push(`/user/${userId}`);
  };

  const renderUserRow = ({ item: user }: { item: Profile }) => {
    const displayName = user.full_name || user.username || 'Unknown User';
    const usernameDisplay = user.username ? `@${user.username}` : '';

    return (
      <Pressable
        onPress={() => handleUserPress(user.id)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={[styles.userRow, { backgroundColor: colors.card }]}>
          {/* Avatar */}
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarPlaceholder,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <Ionicons name="person" size={24} color={colors.textSecondary} />
            </View>
          )}

          {/* User Info */}
          <View style={styles.userInfo}>
            <Text
              style={[Typography.body.baseMedium, styles.displayName, { color: colors.text }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {usernameDisplay ? (
              <Text
                style={[Typography.body.sm, styles.username, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {usernameDisplay}
              </Text>
            ) : null}
          </View>

          {/* Follow Button */}
          <FollowButton userId={user.id} username={user.username} size="sm" style={styles.followButton} />
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No followers yet</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        When people follow this user, they will appear here
      </Text>
    </View>
  );

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Followers</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Followers</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Unable to load followers
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Please try again later
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <BackIcon color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Followers</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Followers List */}
      <FlatList
        data={followers}
        keyExtractor={(item) => item.id}
        renderItem={renderUserRow}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        // 80px content + 16px margin
        getItemLayout={(_, index) => ({ length: 96, offset: 96 * index, index })}
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
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
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
  },
  userRow: {
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
  userInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  displayName: {
    marginBottom: 2,
  },
  username: {
    marginBottom: 2,
  },
  followButton: {
    marginLeft: Spacing.sm,
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
