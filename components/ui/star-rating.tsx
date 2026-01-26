/**
 * StarRating Component
 * Interactive or display-only star rating (1-5 stars)
 * Used in review modal and feed items
 * Reference: ui-mocks/review_modal.html lines 51-67, styles.css .rating-stars, .star
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface StarRatingProps {
  /**
   * Current rating value (0-5)
   * @default 0
   */
  rating: number;

  /**
   * Callback when rating changes (makes component interactive)
   * If not provided, component is display-only
   */
  onRatingChange?: (rating: number) => void;

  /**
   * Size of each star in pixels
   * @default 32
   */
  size?: number;

  /**
   * Whether the component is disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;
}

/**
 * StarRating component for displaying and collecting 1-5 star ratings
 *
 * Features:
 * - Interactive mode: tap stars to set rating
 * - Display-only mode: show rating without interaction
 * - Active stars: gold color (Amber 400)
 * - Inactive stars: secondary background color
 * - Supports half-star display (rounded to nearest integer for interaction)
 *
 * @example
 * // Interactive rating in review modal
 * <StarRating
 *   rating={userRating}
 *   onRatingChange={setUserRating}
 * />
 *
 * @example
 * // Display-only rating in feed
 * <StarRating rating={4.5} size={20} />
 */
export function StarRating({
  rating = 0,
  onRatingChange,
  size = 32,
  disabled = false,
  style,
}: StarRatingProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const isInteractive = !!onRatingChange && !disabled;
  const normalizedRating = Math.max(0, Math.min(5, rating)); // Clamp between 0-5

  const handleStarPress = (starIndex: number) => {
    if (isInteractive && onRatingChange) {
      // If user taps the same star that's already active, clear the rating
      if (starIndex === normalizedRating) {
        onRatingChange(0);
      } else {
        onRatingChange(starIndex);
      }
    }
  };

  return (
    <View style={[styles.container, style]}>
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const isActive = starIndex <= normalizedRating;
        const starColor = isActive ? colors.gold : colors.backgroundSecondary;

        if (isInteractive) {
          return (
            <Pressable
              key={starIndex}
              onPress={() => handleStarPress(starIndex)}
              style={({ pressed }) => [
                styles.star,
                {
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              hitSlop={8} // Increase touch target
            >
              <Text style={[styles.starText, { fontSize: size, color: starColor }]}>
                ★
              </Text>
            </Pressable>
          );
        }

        // Display-only mode
        return (
          <View key={starIndex} style={styles.star}>
            <Text style={[styles.starText, { fontSize: size, color: starColor }]}>
              ★
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm, // 8px gap between stars
  },
  star: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  starText: {
    // Star character (★) renders consistently across platforms
    fontWeight: '400',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
