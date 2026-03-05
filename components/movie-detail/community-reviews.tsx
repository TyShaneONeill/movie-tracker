import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMovieReviews } from '@/hooks/use-movie-reviews';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { ReviewItem } from '@/lib/review-service';

interface CommunityReviewsProps {
  tmdbId: number;
}

const REVIEWS_LIMIT = 5;
const AVATAR_SIZE = 36;

const RATING_COLORS = {
  high: '#4CAF50',
  mid: '#FFC107',
  low: '#F44336',
} as const;

function getRatingColor(rating: number): string {
  if (rating >= 8) return RATING_COLORS.high;
  if (rating >= 6) return RATING_COLORS.mid;
  return RATING_COLORS.low;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  return `${diffMo}mo ago`;
}

function SkeletonCard({ shimmerColor }: { shimmerColor: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={skeletonCardStyles.card}>
      <View style={skeletonCardStyles.headerRow}>
        <Animated.View
          style={[skeletonCardStyles.avatar, { backgroundColor: shimmerColor, opacity }]}
        />
        <View style={skeletonCardStyles.headerText}>
          <Animated.View
            style={[skeletonCardStyles.nameLine, { backgroundColor: shimmerColor, opacity }]}
          />
          <Animated.View
            style={[skeletonCardStyles.timeLine, { backgroundColor: shimmerColor, opacity }]}
          />
        </View>
      </View>
      <Animated.View
        style={[skeletonCardStyles.bodyLine, { backgroundColor: shimmerColor, opacity }]}
      />
      <Animated.View
        style={[skeletonCardStyles.bodyLineShort, { backgroundColor: shimmerColor, opacity }]}
      />
    </View>
  );
}

const skeletonCardStyles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  headerText: {
    marginLeft: Spacing.sm,
    gap: 4,
  },
  nameLine: {
    width: 100,
    height: 12,
    borderRadius: 4,
  },
  timeLine: {
    width: 60,
    height: 10,
    borderRadius: 4,
  },
  bodyLine: {
    width: '100%',
    height: 12,
    borderRadius: 4,
    marginTop: Spacing.sm,
  },
  bodyLineShort: {
    width: '70%',
    height: 12,
    borderRadius: 4,
    marginTop: Spacing.xs,
  },
});

function ReviewCard({
  review,
  colors,
  isRevealed,
  onRevealSpoiler,
}: {
  review: ReviewItem;
  colors: typeof Colors.dark;
  isRevealed: boolean;
  onRevealSpoiler: () => void;
}) {
  const styles = useMemo(() => createReviewCardStyles(colors), [colors]);
  const displayName = review.reviewer.fullName || review.reviewer.username || 'User';
  const showSpoilerOverlay = review.isSpoiler && !isRevealed;

  return (
    <View style={styles.card} accessible accessibilityLabel={`Review by ${displayName}`}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {review.reviewer.avatarUrl ? (
            <Image
              source={{ uri: review.reviewer.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.timestamp}>
                {formatRelativeTime(review.createdAt)}
              </Text>
              <Text style={[styles.sourceBadge, review.source === 'review' && styles.sourceBadgeReview]}>
                {review.source === 'review' ? 'Review' : 'First Take'}
              </Text>
              {review.isRewatch && (
                <Text style={styles.rewatchTag}>Rewatch</Text>
              )}
            </View>
          </View>
        </View>
        {review.rating !== null && (
          <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(review.rating) }]}>
            <Text style={styles.ratingText}>{review.rating}</Text>
          </View>
        )}
      </View>

      {review.title && !showSpoilerOverlay && (
        <Text style={styles.reviewTitle} numberOfLines={2}>
          {review.title}
        </Text>
      )}

      {review.quoteText ? (
        showSpoilerOverlay ? (
          <Pressable
            onPress={onRevealSpoiler}
            accessibilityRole="button"
            accessibilityLabel="Tap to reveal spoiler"
          >
            <View style={styles.spoilerOverlay}>
              <Text style={styles.spoilerText}>Tap to reveal spoiler</Text>
            </View>
          </Pressable>
        ) : (
          <>
            {review.title == null && review.isSpoiler && (
              <Text style={styles.spoilerWarning}>Contains spoilers</Text>
            )}
            <Text style={styles.quoteText} numberOfLines={3}>
              {review.quoteText}
            </Text>
          </>
        )
      ) : null}

      {review.reviewText && !showSpoilerOverlay && (
        <Text style={styles.reviewTextBody} numberOfLines={5}>
          {review.reviewText.length > 200 ? `${review.reviewText.slice(0, 200)}...` : review.reviewText}
        </Text>
      )}
    </View>
  );
}

const createReviewCardStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: Spacing.sm,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
    },
    avatarPlaceholder: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      ...Typography.body.smMedium,
      color: colors.textSecondary,
    },
    headerText: {
      marginLeft: Spacing.sm,
      flex: 1,
    },
    displayName: {
      ...Typography.body.smMedium,
      color: colors.text,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 2,
    },
    timestamp: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },
    rewatchTag: {
      ...Typography.caption.medium,
      color: colors.textTertiary,
      fontSize: 11,
    },
    sourceBadge: {
      ...Typography.caption.medium,
      fontSize: 10,
      color: colors.textTertiary,
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      overflow: 'hidden',
    },
    sourceBadgeReview: {
      color: colors.tint,
    },
    reviewTextBody: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
      fontStyle: 'italic',
    },
    ratingBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ratingText: {
      ...Typography.caption.medium,
      color: '#fff',
      fontSize: 13,
    },
    reviewTitle: {
      ...Typography.body.smMedium,
      color: colors.text,
      marginTop: Spacing.sm,
    },
    quoteText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    spoilerOverlay: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.sm,
    },
    spoilerText: {
      ...Typography.body.smMedium,
      color: colors.textTertiary,
    },
    spoilerWarning: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      fontStyle: 'italic',
      marginTop: Spacing.xs,
    },
  });

export function CommunityReviews({ tmdbId }: CommunityReviewsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useMovieReviews(tmdbId, 1);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  const revealSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => new Set(prev).add(id));
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Community Reviews</Text>
        <SkeletonCard shimmerColor={colors.backgroundSecondary} />
        <SkeletonCard shimmerColor={colors.backgroundSecondary} />
      </View>
    );
  }

  if (!data || data.reviews.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Community Reviews</Text>
        <Text style={styles.emptyText}>
          No reviews yet — be the first to share your thoughts!
        </Text>
      </View>
    );
  }

  const { reviews, totalCount } = data;
  const displayedReviews = reviews.slice(0, REVIEWS_LIMIT);

  return (
    <View style={styles.container} accessibilityRole="summary" accessibilityLabel="Community reviews">
      <Text style={styles.sectionTitle}>Community Reviews</Text>
      {displayedReviews.map((review) =>
        review.source === 'review' ? (
          <Pressable
            key={review.id}
            onPress={() => router.push(`/review/${review.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`View full review`}
          >
            <ReviewCard
              review={review}
              colors={colors}
              isRevealed={revealedSpoilers.has(review.id)}
              onRevealSpoiler={() => revealSpoiler(review.id)}
            />
          </Pressable>
        ) : (
          <ReviewCard
            key={review.id}
            review={review}
            colors={colors}
            isRevealed={revealedSpoilers.has(review.id)}
            onRevealSpoiler={() => revealSpoiler(review.id)}
          />
        )
      )}
      {totalCount > REVIEWS_LIMIT && (
        <Pressable
          style={styles.viewAllButton}
          accessibilityRole="button"
          accessibilityLabel={`View all ${totalCount} reviews`}
        >
          <Text style={styles.viewAllText}>
            View all {totalCount} reviews
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      marginTop: Spacing.lg,
    },
    sectionTitle: {
      ...Typography.body.lg,
      color: colors.text,
      marginBottom: Spacing.xs,
    },
    emptyText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: Spacing.lg,
    },
    viewAllButton: {
      alignItems: 'center',
      paddingVertical: Spacing.md,
      marginTop: Spacing.xs,
    },
    viewAllText: {
      ...Typography.body.smMedium,
      color: colors.tint,
    },
  });
