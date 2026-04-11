import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useBlockedUsersWithProfiles } from '@/hooks/use-blocked-users-with-profiles';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '@/lib/database.types';
import { ContentContainer } from '@/components/content-container';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export default function BlockedUsersScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { profiles, isLoading, unblockUser, isUnblocking } = useBlockedUsersWithProfiles();

  const handleUnblock = (profile: Profile) => {
    const displayName = profile.full_name || profile.username || 'this user';

    const doUnblock = () => unblockUser(profile.id);

    if (Platform.OS === 'web') {
      if (window.confirm(`Unblock ${displayName}? They will be able to see your content again.`)) {
        doUnblock();
      }
    } else {
      Alert.alert(
        'Unblock User',
        `Unblock ${displayName}? They will be able to see your content again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unblock', onPress: doUnblock },
        ]
      );
    }
  };

  const renderItem = ({ item: profile }: { item: Profile }) => {
    const displayName = profile.full_name || profile.username || 'Unknown User';
    return (
      <View style={styles.userRow}>
        {profile.avatar_url ? (
          <Image
            source={{ uri: buildAvatarUrl(profile.avatar_url, profile.updated_at)! }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          {profile.username && (
            <Text style={styles.username} numberOfLines={1}>
              @{profile.username}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => handleUnblock(profile)}
          disabled={isUnblocking}
          style={({ pressed }) => [
            styles.unblockButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.unblockText}>Unblock</Text>
        </Pressable>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="shield-checkmark-outline" size={48} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>No blocked users</Text>
      <Text style={styles.emptySubtitle}>
        Users you block will appear here. You can unblock them at any time.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ContentContainer style={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text style={[Typography.display.h4, { color: colors.text }]}>Blocked Users</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
        />
      )}
      </ContentContainer>
    </SafeAreaView>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    contentContainer: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
      paddingHorizontal: Spacing.md,
      paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
      ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: 100,
      flexGrow: 1,
      ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      backgroundColor: colors.card,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarPlaceholder: {
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      ...Typography.body.baseMedium,
      color: colors.textSecondary,
    },
    userInfo: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    displayName: {
      ...Typography.body.baseMedium,
      color: colors.text,
    },
    username: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: 1,
    },
    unblockButton: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unblockText: {
      ...Typography.body.sm,
      color: colors.text,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.xl * 3,
    },
    emptyTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginTop: Spacing.md,
    },
    emptySubtitle: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.sm,
    },
  });
}
