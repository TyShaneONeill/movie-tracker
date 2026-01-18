/**
 * TrendingCard Component
 * Poster card for trending section (160x240px)
 * Displays movie poster with gradient overlay and title/genre at bottom
 * Reference: ui-mocks/home.html lines 124-130, styles.css .movie-card
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface TrendingCardProps {
  /**
   * Movie title
   */
  title: string;

  /**
   * Primary genre label
   */
  genre: string;

  /**
   * Rating value (e.g., "9.0", "7.8")
   */
  rating: string;

  /**
   * Poster image URL (TMDB w500 size recommended)
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
 * TrendingCard component for horizontal scrolling trending section
 *
 * Features:
 * - 160x240px poster dimensions matching HTML mock
 * - Background image with gradient overlay (dark to transparent from bottom)
 * - Title and genre/rating info at bottom
 * - Press animation with scale 0.95 transform
 * - Rounded corners (16px)
 * - Medium shadow effect
 *
 * @example
 * <TrendingCard
 *   title="Dune: Part Two"
 *   genre="Sci-Fi"
 *   rating="9.0"
 *   posterUrl="https://image.tmdb.org/t/p/w500/..."
 *   onPress={() => navigation.navigate('movie', { id: 123 })}
 * />
 */
export function TrendingCard({
  title,
  genre,
  rating,
  posterUrl,
  onPress,
  style,
}: TrendingCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        Shadows.md,
        {
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
        style,
      ]}
    >
      {/* Poster Image */}
      <Image
        source={{ uri: posterUrl }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />

      {/* Gradient Overlay - dark to transparent from bottom to top */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.8)', 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0.5 }}
        style={styles.gradient}
      />

      {/* Movie Info Overlay */}
      <View style={styles.info}>
        <Text
          style={[
            styles.title,
            Typography.body.base,
            { color: '#ffffff' },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.metadata,
            { color: 'rgba(255, 255, 255, 0.8)' },
          ]}
        >
          {genre} • {rating}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 160,
    height: 240,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    borderRadius: BorderRadius.md,
  },
  info: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
  },
  title: {
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  metadata: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Inter_400Regular',
  },
});
