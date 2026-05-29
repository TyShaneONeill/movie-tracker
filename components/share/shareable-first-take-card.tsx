import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, BorderRadius, Fonts, FontSizes } from '@/constants/theme';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { buildAvatarUrl } from '@/lib/avatar-service';

interface ShareableFirstTakeCardProps {
  movieTitle: string;
  posterPath: string | null;
  /** Numeric rating (0–10). When null/0 the reaction emoji is shown instead. */
  rating: number | null;
  reactionEmoji: string;
  quoteText: string;
  reviewerName: string;
  reviewerAvatar: string | null;
  isRewatch?: boolean;
}

function getRatingColor(rating: number): string {
  if (rating >= 8) return Colors.dark.accentSecondary;
  if (rating >= 6) return Colors.dark.gold;
  return Colors.dark.tint;
}

const ShareableFirstTakeCard = React.forwardRef<View, ShareableFirstTakeCardProps>(
  (
    {
      movieTitle,
      posterPath,
      rating,
      reactionEmoji,
      quoteText,
      reviewerName,
      reviewerAvatar,
      isRewatch,
    },
    ref
  ) => {
    const posterUrl = getTMDBImageUrl(posterPath, 'w342');
    const avatarUrl = buildAvatarUrl(reviewerAvatar);
    const hasRating = rating != null && rating > 0;

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Top section: Poster + Movie title + reaction (rating badge or emoji) */}
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
            {hasRating ? (
              <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(rating!) }]}>
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            ) : (
              <View style={styles.emojiBadge}>
                <Text style={styles.emojiText}>{reactionEmoji}</Text>
              </View>
            )}
          </View>

          <View style={styles.movieInfoContainer}>
            <Text style={styles.firstTakeLabel}>First Take</Text>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movieTitle}
            </Text>
            {isRewatch && <Text style={styles.rewatchBadge}>Rewatch</Text>}
          </View>
        </View>

        {/* Quote */}
        <Text style={styles.quoteText} numberOfLines={5}>
          &ldquo;{quoteText}&rdquo;
        </Text>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
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

          <View style={styles.brandingBar}>
            <Text style={styles.brandingText}>PocketStubs</Text>
          </View>
        </View>
      </View>
    );
  }
);

ShareableFirstTakeCard.displayName = 'ShareableFirstTakeCard';

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
  emojiBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.card,
    borderWidth: 3,
    borderColor: Colors.dark.background,
  },
  emojiText: {
    fontSize: 24,
  },
  movieInfoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  firstTakeLabel: {
    fontFamily: Fonts.inter.medium,
    fontSize: FontSizes.xs,
    color: Colors.dark.tint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
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
  quoteText: {
    fontFamily: Fonts.inter.regular,
    fontSize: FontSizes.base,
    lineHeight: 24,
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

export { ShareableFirstTakeCard };
export default ShareableFirstTakeCard;
