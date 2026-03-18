import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useMovieReviews } from '@/hooks/use-movie-reviews';
import { useMovieDetail } from '@/hooks/use-movie-detail';
import { useBlockedUsers } from '@/hooks/use-blocked-users';
import type { ReviewItem, ReviewSortMode } from '@/lib/review-service';
import { LikeButton } from '@/components/like-button';
import { LikedByIndicator } from '@/components/liked-by-indicator';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

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

const SORT_OPTIONS: { value: ReviewSortMode; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'popular', label: 'Popular' },
  { value: 'friends_first', label: 'Friends' },
];

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

      <View style={styles.likeRow}>
        <LikeButton
          targetType={review.source}
          targetId={review.id}
          initialLikeCount={review.likeCount}
          size="sm"
        />
        {review.source === 'review' && (
          <View style={styles.commentCount}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
            {(review as any).commentCount > 0 && (
              <Text style={styles.commentCountText}>{(review as any).commentCount}</Text>
            )}
          </View>
        )}
      </View>
      {review.likeCount > 0 && (
        <LikedByIndicator
          targetType={review.source}
          targetId={review.id}
          likeCount={review.likeCount}
        />
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
    likeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.sm,
      gap: Spacing.md,
    },
    commentCount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    commentCountText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
  });

export default function MovieReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const numericId = parseInt(id ?? '0', 10);
  const isValidId = !isNaN(numericId) && numericId > 0;

  const { movie } = useMovieDetail({ movieId: numericId, enabled: isValidId });
  const { blockedIds } = useBlockedUsers();

  const [sort, setSort] = useState<ReviewSortMode>('popular');
  const [page, setPage] = useState(1);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [allReviews, setAllReviews] = useState<ReviewItem[]>([]);

  const { data, isLoading, isFetching } = useMovieReviews(numericId, page, isValidId, sort);

  // When sort changes, reset to page 1 and clear accumulated reviews
  React.useEffect(() => {
    setPage(1);
    setAllReviews([]);
  }, [sort]);

  // Accumulate reviews as pages load
  React.useEffect(() => {
    if (!data) return;
    if (page === 1) {
      setAllReviews(data.reviews);
    } else {
      setAllReviews((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const newReviews = data.reviews.filter((r) => !existingIds.has(r.id));
        return [...prev, ...newReviews];
      });
    }
  }, [data, page]);

  const revealSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => new Set(prev).add(id));
  };

  const reviews = allReviews.filter((r) => !blockedIds.includes(r.userId));
  const hasMorePages = data ? page < data.totalPages : false;
  const movieTitle = movie?.title ?? '';

  const renderReviewItem = (review: ReviewItem) =>
    review.source === 'review' ? (
      <Pressable
        key={review.id}
        onPress={() => router.push(`/review/${review.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel="View full review"
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
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: movieTitle ? `${movieTitle} Reviews` : 'Reviews',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { ...Typography.body.lg, color: colors.text },
        }}
      />

      {/* Sort tabs */}
      <View style={[styles.sortBar, { borderBottomColor: colors.border }]}>
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.sortTab, sort === opt.value && styles.sortTabActive]}
            onPress={() => setSort(opt.value)}
          >
            <Text style={[styles.sortTabText, sort === opt.value && { color: colors.tint }]}>
              {opt.label}
            </Text>
            {sort === opt.value && <View style={[styles.sortTabUnderline, { backgroundColor: colors.tint }]} />}
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && page === 1 ? (
          <ActivityIndicator
            size="large"
            color={colors.tint}
            style={styles.loadingSpinner}
          />
        ) : reviews.length === 0 ? (
          <Text style={styles.emptyText}>
            No reviews yet. Be the first to review this movie.
          </Text>
        ) : (
          <>
            {reviews.map(renderReviewItem)}

            {hasMorePages && (
              <Pressable
                style={[styles.loadMoreButton, { borderColor: colors.border }]}
                onPress={() => setPage((p) => p + 1)}
                disabled={isFetching}
                accessibilityRole="button"
                accessibilityLabel="Load more reviews"
              >
                {isFetching ? (
                  <ActivityIndicator size="small" color={colors.tint} />
                ) : (
                  <Text style={[styles.loadMoreText, { color: colors.tint }]}>Load more</Text>
                )}
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    sortBar: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sortTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      position: 'relative',
    },
    sortTabActive: {},
    sortTabText: {
      ...Typography.body.smMedium,
      color: colors.textSecondary,
    },
    sortTabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: Spacing.md,
      right: Spacing.md,
      height: 2,
      borderRadius: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.xl,
    },
    loadingSpinner: {
      marginTop: Spacing.xl,
    },
    emptyText: {
      ...Typography.body.sm,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: Spacing.xl,
    },
    loadMoreButton: {
      alignItems: 'center',
      paddingVertical: Spacing.md,
      marginTop: Spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: BorderRadius.sm,
    },
    loadMoreText: {
      ...Typography.body.smMedium,
    },
  });
