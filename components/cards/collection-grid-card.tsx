/**
 * CollectionGridCard Component
 * Poster-only card for profile collection grid
 * Simple 2:3 aspect ratio card displaying movie poster
 * Optionally shows journey count badge for multiple rewatches
 * Reference: ui-mocks/profile.html lines 35-47, 139-167 (.collection-item)
 */

import React from 'react';
import { Pressable, StyleSheet, View, Text, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BorderRadius, Colors, Spacing, Fonts } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface CollectionGridCardProps {
  /**
   * Movie poster URL (TMDB w500 size recommended)
   */
  posterUrl: string;

  /**
   * Number of journeys for this movie (shows badge if > 1)
   */
  journeyCount?: number;

  /**
   * Callback when card is pressed
   */
  onPress?: () => void;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;

  /**
   * True if this is an AI-generated poster (uses contain instead of cover)
   */
  isAiPoster?: boolean;
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
 * - Journey count badge when multiple rewatches exist
 *
 * @example
 * <CollectionGridCard
 *   posterUrl="https://image.tmdb.org/t/p/w500/..."
 *   journeyCount={3}
 *   onPress={() => navigation.navigate('journey', { tmdbId: 123 })}
 * />
 */
export function CollectionGridCard({
  posterUrl,
  journeyCount,
  onPress,
  style,
  isAiPoster,
}: CollectionGridCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const showBadge = journeyCount && journeyCount > 1;

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
        contentFit={isAiPoster ? 'contain' : 'cover'}
        transition={200}
      />
      {showBadge && (
        <View style={styles.badgeContainer}>
          <View style={[styles.badge, { backgroundColor: colors.tint }]}>
            <Text style={styles.badgeText}>×{journeyCount}</Text>
          </View>
        </View>
      )}
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
  badgeContainer: {
    position: 'absolute',
    bottom: Spacing.xs,
    right: Spacing.xs,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: Fonts.inter.bold,
    fontWeight: '700',
  },
});
