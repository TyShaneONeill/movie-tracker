/**
 * SearchResultCard Component
 * Horizontal layout card for search results
 * Displays movie poster (60x90px) + title + year/subtitle
 * Reference: ui-mocks/search.html lines 214-223, styles.css .result-item
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BorderRadius, Spacing, Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface SearchResultCardProps {
  /**
   * Movie or person title
   */
  title: string;

  /**
   * Subtitle text (e.g., year, role, genre)
   */
  subtitle: string;

  /**
   * Poster or profile image URL (TMDB w200 size recommended)
   */
  imageUrl: string;

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
 * SearchResultCard component for search results list
 *
 * Features:
 * - Horizontal layout with 60x90px poster on left
 * - Title and subtitle text on right
 * - Card background with padding and rounded corners
 * - Press feedback with background color change
 * - Themed for light/dark mode
 *
 * @example
 * <SearchResultCard
 *   title="Dune: Part Two"
 *   subtitle="2024"
 *   imageUrl="https://image.tmdb.org/t/p/w200/..."
 *   onPress={() => navigation.navigate('movie', { id: 123 })}
 * />
 */
export function SearchResultCard({
  title,
  subtitle,
  imageUrl,
  onPress,
  style,
}: SearchResultCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? colors.backgroundSecondary : 'transparent',
        },
        style,
      ]}
    >
      {/* Poster Image */}
      <Image
        source={{ uri: imageUrl }}
        style={[
          styles.poster,
          { backgroundColor: colors.card },
        ]}
        contentFit="cover"
        transition={200}
      />

      {/* Movie Info */}
      <View style={styles.info}>
        <Text
          style={[
            Typography.body.base,
            { color: colors.text, fontWeight: '600' },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={[
            Typography.body.sm,
            { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BorderRadius.sm,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
});
