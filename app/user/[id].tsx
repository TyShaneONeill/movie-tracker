/**
 * User Profile Screen (Placeholder)
 * Full implementation in Phase 3
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { FollowButton } from '@/components/social/FollowButton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/database.types';

const BackIcon = ({ color = 'white' }: { color?: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Fetch user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('profiles') as any)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!id,
  });

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {isLoading ? (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        ) : profile ? (
          <View style={styles.profileCard}>
            {/* Avatar */}
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.card }]}>
                <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
                  {(profile.full_name || profile.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}

            {/* Name */}
            <Text style={[styles.name, { color: colors.text }]}>
              {profile.full_name || profile.username || 'Unknown User'}
            </Text>

            {/* Username */}
            {profile.username && (
              <Text style={[styles.username, { color: colors.textSecondary }]}>
                @{profile.username}
              </Text>
            )}

            {/* Stats */}
            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile.followers_count ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Followers
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile.following_count ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Following
                </Text>
              </View>
            </View>

            {/* Follow Button */}
            <FollowButton userId={id!} style={styles.followButton} />

            {/* Bio */}
            {profile.bio && (
              <Text style={[styles.bio, { color: colors.textSecondary }]}>
                {profile.bio}
              </Text>
            )}

            {/* Coming Soon Notice */}
            <View style={[styles.comingSoon, { backgroundColor: colors.card }]}>
              <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
                Full profile view coming soon
              </Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            User not found
          </Text>
        )}
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  loadingText: {
    textAlign: 'center',
    fontSize: 16,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
  },
  profileCard: {
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '600',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: Spacing.md,
  },
  username: {
    fontSize: 16,
    marginTop: Spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginTop: Spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  followButton: {
    marginTop: Spacing.lg,
    minWidth: 120,
  },
  bio: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  comingSoon: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  comingSoonText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
