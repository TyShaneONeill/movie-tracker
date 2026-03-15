/**
 * FeedItemCard Component
 * User activity feed item showing watched movie with rating
 * Displays user avatar, name, timestamp, movie poster, and rating
 * Reference: ui-mocks/spoiler_card.html (feed-item class with spoiler handling)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { LikeButton } from '@/components/like-button';

interface FeedItemCardProps {
  /**
   * User's display name (or "You" if isCurrentUser is true)
   */
  userName: string;

  /**
   * User avatar URL (pravatar or similar)
   */
  userAvatarUrl: string;

  /**
   * Timestamp text (e.g., "watched 2h ago")
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
   * Rating value (1-10 scale)
   */
  rating: number | null;

  /**
   * Optional review text snippet
   */
  reviewText?: string;

  /**
   * Whether the review contains spoilers
   */
  isSpoiler?: boolean;

  /**
   * Whether this is the current user's First Take
   * When true, displays "You" instead of userName
   */
  isCurrentUser?: boolean;

  /**
   * Media type ('movie' or 'tv_show')
   */
  mediaType?: string;

  /**
   * Source ID for the review or first take (enables like button)
   */
  sourceId?: string;

  /**
   * Source type ('review' or 'first_take')
   */
  sourceType?: 'review' | 'first_take';

  /**
   * Callback when movie poster/info is pressed
   */
  onMoviePress?: () => void;

  /**
   * Additional style overrides for the container
   */
  style?: ViewStyle;
}

/**
 * FeedItemCard component for activity feed on home screen
 *
 * Features:
 * - Card layout matching spoiler_card.html mockup
 * - Header: 24px avatar + username (bold) + "watched Xh ago" text
 * - Content: 48x72px poster vertically centered with text
 * - Movie title with rating on separate line (accent color)
 * - Spoiler blur with glassmorphism reveal button
 * - "You" indicator in accent color for current user
 *
 * @example
 * <FeedItemCard
 *   userName="Sarah Jenkins"
 *   userAvatarUrl="https://i.pravatar.cc/150?u=a042581f4e29026024d"
 *   timestamp="watched 2h ago"
 *   movieTitle="Avatar: The Way of Water"
 *   moviePosterUrl="https://image.tmdb.org/t/p/w200/..."
 *   rating={8.5}
 *   reviewText="Masterpiece"
 *   isCurrentUser={false}
 *   isSpoiler={false}
 *   onMoviePress={() => navigation.navigate('movie', { id: 123 })}
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
  isSpoiler = false,
  isCurrentUser = false,
  mediaType,
  sourceId,
  sourceType,
  onMoviePress,
  style,
}: FeedItemCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Track whether spoiler content has been revealed
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  // Animation for smooth reveal
  const [fadeAnim] = useState(new Animated.Value(1));

  // Display "You" for current user's posts
  const displayName = isCurrentUser ? 'You' : userName;

  // Format rating for display (e.g., "8.5/10" or "8/10")
  const formatRating = () => {
    if (rating === null || rating === undefined) return null;
    return Number.isInteger(rating) ? rating.toString() : rating.toFixed(1);
  };

  // Handle spoiler reveal with animation
  const handleRevealSpoiler = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setSpoilerRevealed(true);
    });
  };

  // Render the review text content (blurred or revealed)
  const renderReviewContent = () => {
    if (!reviewText) return null;

    const shouldHide = isSpoiler && !spoilerRevealed;

    // Generate placeholder text (dots) that roughly matches the original text length
    const placeholderText = shouldHide
      ? '\u2022'.repeat(Math.min(reviewText.length, 60))
      : reviewText;

    return (
      <View style={[styles.spoilerWrapper, shouldHide && styles.spoilerWrapperWithButton]}>
        {/* Review text - completely hidden when spoiler is active */}
        <Text
          style={[
            styles.reviewText,
            { color: shouldHide ? colors.textTertiary : colors.textSecondary },
            shouldHide && styles.reviewTextHidden,
          ]}
          numberOfLines={3}
        >
          {placeholderText}
        </Text>

        {/* Spoiler overlay with blur button */}
        {isSpoiler && !spoilerRevealed && (
          <Animated.View
            style={[
              styles.spoilerOverlay,
              {
                opacity: fadeAnim,
                backgroundColor: `${colors.background}E6`, // 90% opacity solid background
              },
            ]}
          >
            <Pressable
              onPress={handleRevealSpoiler}
              accessibilityRole="button"
              accessibilityLabel="Reveal spoiler"
              style={({ pressed }) => [
                styles.spoilerButton,
                pressed && styles.spoilerButtonPressed,
              ]}
            >
              <BlurView
                intensity={40}
                tint="dark"
                style={styles.spoilerButtonBlur}
              >
                <Ionicons
                  name="eye-off"
                  size={14}
                  color={colors.text}
                  style={styles.spoilerIcon}
                />
                <Text style={[styles.spoilerButtonText, { color: colors.text }]}>
                  Spoiler
                </Text>
              </BlurView>
            </Pressable>
          </Animated.View>
        )}
      </View>
    );
  };

  const formattedRating = formatRating();

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* Header Row: Avatar + Username + Timestamp */}
      <View style={styles.headerRow}>
        <Image
          source={{ uri: userAvatarUrl }}
          style={styles.avatar}
          contentFit="cover"
          transition={200}
        />
        <Text
          style={[
            styles.userName,
            { color: isCurrentUser ? colors.tint : colors.text },
          ]}
        >
          {displayName}
        </Text>
        <Text style={[styles.timestamp, { color: colors.textTertiary }]}>
          {timestamp}
        </Text>
      </View>

      {/* Content Row: Poster + Movie Info */}
      <Pressable
        onPress={onMoviePress}
        accessibilityRole="button"
        accessibilityLabel={`${movieTitle}${formattedRating ? `, rated ${formattedRating}` : ''}`}
        style={({ pressed }) => [
          styles.contentRow,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Image
          source={{ uri: moviePosterUrl }}
          style={[styles.poster, Shadows.sm]}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.reviewBody}>
          {/* Movie/TV Title Row */}
          <View style={styles.titleRow}>
            <Text
              style={[styles.movieTitle, { color: colors.text, flexShrink: 1 }]}
              numberOfLines={2}
            >
              {movieTitle}
            </Text>
            {mediaType === 'tv_show' && (
              <View style={[styles.tvBadge, { backgroundColor: colors.tint }]}>
                <Text style={styles.tvBadgeText}>TV</Text>
              </View>
            )}
          </View>

          {/* Rating Row */}
          {formattedRating && (
            <Text style={[styles.ratingText, { color: colors.tint }]}>
              {formattedRating}
            </Text>
          )}
        </View>
      </Pressable>

      {/* Review Text with Spoiler Handling — outside Pressable to avoid nested buttons on web */}
      {renderReviewContent()}

      {sourceId && sourceType && (
        <View style={styles.likeRow}>
          <LikeButton
            targetType={sourceType}
            targetId={sourceId}
            size="sm"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    marginBottom: Spacing.sm,
  },
  // Header Row - matches mockup: avatar (24px) + username + timestamp
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: Spacing.sm,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
  },
  timestamp: {
    fontSize: 12,
  },
  // Content Row - poster centered with review body
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center', // Vertically center poster with text content
    gap: 12,
  },
  poster: {
    width: 48,
    height: 72, // 2:3 ratio
    borderRadius: BorderRadius.sm,
    flexShrink: 0,
  },
  reviewBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  movieTitle: {
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 19,
  },
  tvBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  tvBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  // Review text styles
  reviewText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  reviewTextHidden: {
    opacity: 0,
    letterSpacing: 2,
  },
  // Spoiler wrapper and overlay
  spoilerWrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.sm,
    marginLeft: 60, // align with review body (48px poster + 12px gap)
  },
  spoilerWrapperWithButton: {
    minHeight: 40, // Ensure enough room for spoiler button
  },
  spoilerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  spoilerButton: {
    overflow: 'hidden',
    borderRadius: BorderRadius.full,
  },
  spoilerButtonPressed: {
    transform: [{ scale: 1.05 }],
  },
  spoilerButtonBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  spoilerIcon: {
    marginRight: 6,
  },
  spoilerButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginLeft: 60, // align with review body (48px poster + 12px gap)
  },
});
