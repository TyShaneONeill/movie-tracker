/**
 * FeedItemCard Component
 * User activity feed item showing watched movie with rating
 * Displays user avatar, name, timestamp, movie poster, and rating
 * Reference: ui-mocks/home.html lines 161-182, 184-206 (feed-item class)
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface FeedItemCardProps {
  /**
   * User's display name
   */
  userName: string;

  /**
   * User avatar URL (pravatar or similar)
   */
  userAvatarUrl: string;

  /**
   * Timestamp text (e.g., "Watched 2h ago")
   */
  timestamp: string;

  /**
   * Movie title
   */
  movieTitle: string;

  /**
   * Movie poster URL (TMDB w200 size recommended)
   */
  moviePosterUrl: string;

  /**
   * Rating value (1-5)
   */
  rating: number;

  /**
   * Optional review text snippet
   */
  reviewText?: string;

  /**
   * Callback when movie poster/info is pressed
   */
  onMoviePress?: () => void;

  /**
   * Callback when user avatar/name is pressed
   */
  onUserPress?: () => void;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;
}

/**
 * FeedItemCard component for activity feed on home screen
 *
 * Features:
 * - Card background with border from theme
 * - User info row: avatar (40px circular) + name + timestamp
 * - Movie info row: poster (56px width) + title + star rating + review text
 * - Separate press handlers for user and movie areas
 * - Themed colors for text and borders
 *
 * @example
 * <FeedItemCard
 *   userName="Sarah Jenkins"
 *   userAvatarUrl="https://i.pravatar.cc/150?u=a042581f4e29026024d"
 *   timestamp="Watched 2h ago"
 *   movieTitle="Avatar: The Way of Water"
 *   moviePosterUrl="https://image.tmdb.org/t/p/w200/..."
 *   rating={5}
 *   reviewText="Masterpiece"
 *   onMoviePress={() => navigation.navigate('movie', { id: 123 })}
 *   onUserPress={() => navigation.navigate('profile', { id: 456 })}
 * />
 */
export function FeedItemCard({
  userName,
  userAvatarUrl,
  timestamp,
  movieTitle,
  moviePosterUrl,
  rating,
  reviewText,
  onMoviePress,
  onUserPress,
  style,
}: FeedItemCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  // Generate star display (filled + empty stars)
  const renderStars = () => {
    const filledStars = Math.floor(rating);
    const emptyStars = 5 - filledStars;

    return (
      <View style={styles.starsContainer}>
        {/* Filled stars */}
        {filledStars > 0 && (
          <Text style={[styles.stars, { color: colors.gold }]}>
            {'★'.repeat(filledStars)}
          </Text>
        )}
        {/* Empty stars */}
        {emptyStars > 0 && (
          <Text style={[styles.stars, { color: 'rgba(255, 255, 255, 0.2)' }]}>
            {'★'.repeat(emptyStars)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* User Info Row */}
      <Pressable
        onPress={onUserPress}
        style={({ pressed }) => [
          styles.userRow,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Image
          source={{ uri: userAvatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.userInfo}>
          <Text
            style={[
              styles.userName,
              Typography.body.base,
              { color: colors.text },
            ]}
          >
            {userName}
          </Text>
          <Text
            style={[
              styles.timestamp,
              Typography.body.xs,
              { color: colors.textSecondary },
            ]}
          >
            {timestamp}
          </Text>
        </View>
      </Pressable>

      {/* Movie Info Row */}
      <Pressable
        onPress={onMoviePress}
        style={({ pressed }) => [
          styles.movieRow,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Image
          source={{ uri: moviePosterUrl }}
          style={[styles.poster, Shadows.sm]}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.movieInfo}>
          <Text
            style={[
              styles.movieTitle,
              Typography.body.base,
              { color: colors.text },
            ]}
            numberOfLines={2}
          >
            {movieTitle}
          </Text>
          <View style={styles.ratingRow}>
            {renderStars()}
            {reviewText && (
              <Text
                style={[
                  styles.reviewText,
                  Typography.body.xs,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {reviewText}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: '600',
    fontSize: 15,
  },
  timestamp: {
    fontSize: 12,
  },
  movieRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  poster: {
    width: 56,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  movieTitle: {
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  stars: {
    fontSize: 14,
    lineHeight: 16,
  },
  reviewText: {
    fontSize: 12,
  },
});
