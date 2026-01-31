/**
 * CollectionGridCard Component
 * Poster-only card for profile collection grid
 * Simple 2:3 aspect ratio card displaying movie poster
 * Reference: ui-mocks/profile.html lines 35-47, 139-167 (.collection-item)
 */

import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BorderRadius, Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface CollectionGridCardProps {
  /**
   * Movie poster URL (TMDB w500 size recommended)
   */
  posterUrl: string;

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
 * CollectionGridCard component for profile collection grid
 *
 * Features:
 * - Poster-only display, no text overlay
 * - 2:3 aspect ratio (standard movie poster dimensions)
 * - Small rounded corners (8px)
 * - Card background color as placeholder
 * - Press feedback with opacity change
 *
 * @example
 * <CollectionGridCard
 *   posterUrl="https://image.tmdb.org/t/p/w500/..."
 *   onPress={() => navigation.navigate('movie', { id: 123 })}
 * />
 */
export function CollectionGridCard({
  posterUrl,
  onPress,
  style,
}: CollectionGridCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Image
        source={{ uri: posterUrl }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
