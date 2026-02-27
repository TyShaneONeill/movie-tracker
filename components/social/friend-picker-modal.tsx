import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useAuth } from '@/hooks/use-auth';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { buildAvatarUrl } from '@/lib/avatar-service';

interface FriendPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectFriend: (displayName: string) => void;
  alreadyAdded: string[];
}

export function FriendPickerModal({
  visible,
  onClose,
  onSelectFriend,
  alreadyAdded,
}: FriendPickerModalProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const { mutualFollows, isLoading } = useMutualFollows(user?.id ?? '');

  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');

  const alreadyAddedLower = useMemo(
    () => new Set(alreadyAdded.map((n) => n.toLowerCase())),
    [alreadyAdded]
  );

  const filteredFriends = useMemo(() => {
    const available = mutualFollows.filter((p) => {
      const displayName = (p.full_name || p.username || '').toLowerCase();
      return !alreadyAddedLower.has(displayName);
    });

    if (!searchQuery.trim()) return available;

    const q = searchQuery.toLowerCase();
    return available.filter(
      (p) =>
        (p.full_name ?? '').toLowerCase().includes(q) ||
        (p.username ?? '').toLowerCase().includes(q)
    );
  }, [mutualFollows, alreadyAddedLower, searchQuery]);

  const hasFriends = mutualFollows.length > 0;
  const showNoMatches = hasFriends && searchQuery.trim() && filteredFriends.length === 0;

  const handleSelectFriend = (profile: (typeof mutualFollows)[0]) => {
    onSelectFriend(profile.full_name || profile.username || 'Unknown');
    onClose();
  };

  const handleManualAdd = () => {
    const trimmed = manualName.trim();
    if (!trimmed) return;
    onSelectFriend(trimmed);
    setManualName('');
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setManualName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[Typography.body.lg, { color: colors.text }]}>Add Friend</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Search bar */}
          {hasFriends && !isLoading && (
            <View style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={[Typography.body.sm, styles.searchInput, { color: colors.text }]}
                placeholder="Search friends..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
          )}

          {/* Friends list */}
          {isLoading && (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          )}

          {!isLoading && hasFriends && filteredFriends.length > 0 && (
            <ScrollView style={styles.friendsList} showsVerticalScrollIndicator={false}>
              {filteredFriends.map((profile) => {
                const avatarUrl = buildAvatarUrl(profile.avatar_url, profile.updated_at);
                const initial = (profile.full_name || profile.username || '?')[0].toUpperCase();

                return (
                  <Pressable
                    key={profile.id}
                    style={({ pressed }) => [
                      styles.friendRow,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={() => handleSelectFriend(profile)}
                  >
                    {avatarUrl ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          styles.avatarPlaceholder,
                          { backgroundColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
                          {initial}
                        </Text>
                      </View>
                    )}

                    <View style={styles.nameColumn}>
                      <Text
                        style={[Typography.body.smMedium, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {profile.full_name || profile.username}
                      </Text>
                      {profile.username && (
                        <Text
                          style={[Typography.body.xs, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          @{profile.username}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!isLoading && showNoMatches && (
            <View style={styles.centered}>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>No matches</Text>
            </View>
          )}

          {/* Divider */}
          {!isLoading && hasFriends && (
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
          )}

          {/* Manual entry */}
          <View style={styles.manualSection}>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
              Add someone not on CineTrak
            </Text>
            {!hasFriends && !isLoading && (
              <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
                Follow friends on CineTrak to see them here
              </Text>
            )}
            <View style={styles.manualRow}>
              <TextInput
                style={[
                  Typography.body.sm,
                  styles.manualInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.backgroundSecondary,
                  },
                ]}
                placeholder="Enter name..."
                placeholderTextColor={colors.textTertiary}
                value={manualName}
                onChangeText={setManualName}
                onSubmitEditing={handleManualAdd}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleManualAdd}
                disabled={!manualName.trim()}
                style={({ pressed }) => ({
                  opacity: !manualName.trim() ? 0.4 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={[Typography.body.baseMedium, { color: colors.tint }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: BorderRadius.lg,
      borderTopRightRadius: BorderRadius.lg,
      padding: Spacing.lg,
      maxHeight: '70%',
      ...(Platform.OS === 'web' && {
        maxWidth: 768,
        width: '100%',
        alignSelf: 'center' as const,
      }),
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      gap: Spacing.xs,
      marginBottom: Spacing.md,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 0,
    },
    friendsList: {
      flexShrink: 1,
    },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    avatarPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      fontSize: 16,
      fontWeight: '600',
    },
    nameColumn: {
      flex: 1,
    },
    centered: {
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    dividerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginVertical: Spacing.md,
    },
    dividerLine: {
      flex: 1,
      height: 1,
    },
    manualSection: {
      marginTop: Spacing.xs,
    },
    manualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    manualInput: {
      flex: 1,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
  });
