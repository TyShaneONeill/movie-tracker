/**
 * ListCard Component
 * 2x2 poster preview grid + title + count for user lists
 * Reference: ui-mocks/lists.html lines 117-157 (.list-card, .list-preview-grid)
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface ListCardProps {
  /**
   * List title
   */
  title: string;

  /**
   * Number of movies in the list
   */
  movieCount: number;

  /**
   * Array of poster URLs (up to 4 shown)
   * Empty slots will show background color
   */
  posterUrls: string[];

  /**
   * Optional user info for liked lists
   */
  user?: {
    name: string;
    avatarUrl: string;
  };

  /**
   * Callback when card is pressed
   */
  onPress?: () => void;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;
}

/**
 * ListCard component for displaying user lists
 *
 * Features:
 * - 2x2 grid preview of list posters (up to 4 movies)
 * - Empty slots show background color
 * - Title with ellipsis truncation
 * - Movie count display
 * - Optional user attribution for liked lists
 * - Press feedback with scale transform
 *
 * @example
 * // User's own list
 * <ListCard
 *   title="Sci-Fi Masterpieces"
 *   movieCount={12}
 *   posterUrls={['url1', 'url2', 'url3', 'url4']}
 *   onPress={() => navigation.navigate('list', { id: 123 })}
 * />
 *
 * // Liked list with user attribution
 * <ListCard
 *   title="Best of 2023"
 *   movieCount={8}
 *   posterUrls={['url1', 'url2']}
 *   user={{ name: 'Sarah Jenkins', avatarUrl: 'https://...' }}
 *   onPress={() => navigation.navigate('list', { id: 456 })}
 * />
 */
export function ListCard({
  title,
  movieCount,
  posterUrls,
  user,
  onPress,
  style,
}: ListCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  // Ensure we always have exactly 4 slots (fill with null if fewer posters)
  const gridPosters = Array.from({ length: 4 }, (_, i) => posterUrls[i] || null);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {/* 2x2 Poster Preview Grid */}
      <View style={styles.previewGrid}>
        {gridPosters.map((posterUrl, index) => (
          <View
            key={index}
            style={[
              styles.gridCell,
              { backgroundColor: posterUrl ? colors.card : colors.backgroundSecondary },
            ]}
          >
            {posterUrl && (
              <Image
                source={{ uri: posterUrl }}
                style={styles.gridImage}
                contentFit="cover"
                transition={200}
              />
            )}
          </View>
        ))}
      </View>

      {/* List Info */}
      <View style={styles.listInfo}>
        <Text
          style={[styles.listTitle, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>

        {user ? (
          // Liked list - show user attribution
          <View style={styles.userInfo}>
            <Image
              source={{ uri: user.avatarUrl }}
              style={styles.userAvatar}
              contentFit="cover"
            />
            <Text style={[styles.movieCount, { color: colors.textSecondary }]}>
              {user.name}
            </Text>
          </View>
        ) : (
          // Own list - show movie count
          <Text style={[styles.movieCount, { color: colors.textSecondary }]}>
            {movieCount} {movieCount === 1 ? 'movie' : 'movies'}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  previewGrid: {
    height: 160,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: '50%',
    height: '50%',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  listInfo: {
    padding: Spacing.sm,
  },
  listTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginBottom: 2,
  },
  movieCount: {
    fontSize: FontSizes.sm,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  userAvatar: {
    width: 16,
    height: 16,
    borderRadius: BorderRadius.full,
  },
});
