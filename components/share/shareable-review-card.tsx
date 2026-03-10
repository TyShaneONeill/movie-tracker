import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius, Fonts, FontSizes } from '@/constants/theme';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { buildAvatarUrl } from '@/lib/avatar-service';

interface ShareableReviewCardProps {
  movieTitle: string;
  posterPath: string | null;
  rating: number;
  reviewTitle: string;
  reviewText: string;
  reviewerName: string;
  reviewerAvatar: string | null;
  isRewatch?: boolean;
}

function getRatingColor(rating: number): string {
  if (rating >= 8) return Colors.dark.accentSecondary;
  if (rating >= 6) return Colors.dark.gold;
  return Colors.dark.tint;
}

const ShareableReviewCard = React.forwardRef<View, ShareableReviewCardProps>(
  (
    {
      movieTitle,
      posterPath,
      rating,
      reviewTitle,
      reviewText,
      reviewerName,
      reviewerAvatar,
      isRewatch,
    },
    ref
  ) => {
    const posterUrl = getTMDBImageUrl(posterPath, 'w342');
    const avatarUrl = buildAvatarUrl(reviewerAvatar);
    const ratingColor = getRatingColor(rating);

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Top section: Poster + Movie title + Rating */}
        <View style={styles.topSection}>
          <View style={styles.posterContainer}>
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={styles.poster}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.poster, styles.posterPlaceholder]}>
                <Text style={styles.posterPlaceholderText}>No Poster</Text>
              </View>
            )}
            {/* Rating badge overlapping top-right of poster */}
            <View style={[styles.ratingBadge, { backgroundColor: ratingColor }]}>
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          </View>

          <View style={styles.movieInfoContainer}>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movieTitle}
            </Text>
            {isRewatch && (
              <Text style={styles.rewatchBadge}>Rewatch</Text>
            )}
          </View>
        </View>

        {/* Review title */}
        <Text style={styles.reviewTitle} numberOfLines={2}>
          {reviewTitle}
        </Text>

        {/* Review text */}
        <Text style={styles.reviewText} numberOfLines={4}>
          &ldquo;{reviewText}&rdquo;
        </Text>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {/* Reviewer row */}
          <View style={styles.reviewerRow}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {reviewerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.reviewerName}>{reviewerName}</Text>
          </View>

          {/* Branding bar */}
          <View style={styles.brandingBar}>
            <Text style={styles.brandingText}>CineTrak</Text>
          </View>
        </View>
      </View>
    );
  }
);

ShareableReviewCard.displayName = 'ShareableReviewCard';

const styles = StyleSheet.create({
  container: {
    width: 360,
    backgroundColor: Colors.dark.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  topSection: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  posterContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: BorderRadius.sm,
  },
  posterPlaceholder: {
    backgroundColor: Colors.dark.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.xs,
    color: Colors.dark.textTertiary,
  },
  ratingBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.dark.background,
  },
  ratingText: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: FontSizes.lg,
    color: '#ffffff',
  },
  movieInfoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  movieTitle: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes.xl,
    lineHeight: 26,
    color: Colors.dark.text,
  },
  rewatchBadge: {
    fontFamily: Fonts.inter.medium,
    fontSize: FontSizes.xs,
    color: Colors.dark.blue,
    marginTop: Spacing.xs,
  },
  reviewTitle: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes.lg,
    lineHeight: 24,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  reviewText: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.sm,
    lineHeight: 22,
    color: Colors.dark.textSecondary,
    fontStyle: 'italic',
    marginBottom: Spacing.lg,
  },
  bottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto' as unknown as number,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.md,
  },
  reviewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: Spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.dark.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: Fonts.outfit.bold,
    fontSize: FontSizes.xs,
    color: Colors.dark.textSecondary,
  },
  reviewerName: {
    fontFamily: Fonts.inter.medium,
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
  },
  brandingBar: {
    alignItems: 'flex-end',
  },
  brandingText: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: FontSizes.sm,
    color: Colors.dark.textTertiary,
    letterSpacing: 1,
  },
});

export { ShareableReviewCard };
export default ShareableReviewCard;
