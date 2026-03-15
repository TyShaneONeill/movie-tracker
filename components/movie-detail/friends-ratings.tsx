import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useFriendsRatings } from '@/hooks/use-friends-ratings';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { ReviewItem } from '@/lib/review-service';

interface FriendsRatingsProps {
  tmdbId: number;
}

const AVATAR_SIZE = 64;

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

function SkeletonCircle({ shimmerColor }: { shimmerColor: string }) {
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
    <View style={skeletonStyles.card}>
      <Animated.View
        style={[skeletonStyles.circle, { backgroundColor: shimmerColor, opacity }]}
      />
      <Animated.View
        style={[skeletonStyles.nameLine, { backgroundColor: shimmerColor, opacity }]}
      />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    width: 80,
  },
  circle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  nameLine: {
    width: 48,
    height: 10,
    borderRadius: 4,
    marginTop: Spacing.sm,
  },
});

export function FriendsRatings({ tmdbId }: FriendsRatingsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data, isLoading } = useFriendsRatings(tmdbId);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Friends Who Watched</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCircle key={i} shimmerColor={colors.backgroundSecondary} />
          ))}
        </ScrollView>
      </View>
    );
  }

  if (!data || data.friendsRatings.length === 0) {
    return null;
  }

  const { friendsRatings, averageRating } = data;

  return (
    <View style={styles.container} accessibilityRole="summary" accessibilityLabel="Friends who watched this movie">
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Friends Who Watched</Text>
        {averageRating !== null && (
          <View style={styles.averageBadge}>
            <Text style={styles.averageText}>
              Friends avg: {averageRating.toFixed(1)} / 10
            </Text>
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {friendsRatings.map((friend: ReviewItem) => {
          const displayName = friend.reviewer.fullName || friend.reviewer.username || 'User';
          const ratingColor = friend.rating !== null ? getRatingColor(friend.rating) : null;

          return (
            <View
              key={`${friend.id}-${friend.source}`}
              style={styles.friendCard}
              accessibilityLabel={`${displayName}${friend.rating !== null ? `, rated ${friend.rating} out of 10` : ''}`}
            >
              <View style={styles.avatarContainer}>
                {friend.reviewer.avatarUrl ? (
                  <Image
                    source={{ uri: friend.reviewer.avatarUrl }}
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
                {friend.rating !== null && ratingColor && (
                  <View style={[styles.ratingBadge, { backgroundColor: ratingColor }]}>
                    <Text style={styles.ratingText}>{friend.rating}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.friendName} numberOfLines={1}>
                {displayName}
              </Text>
              {friend.source && (
                <Text style={[styles.sourceLabel, friend.source === 'review' && styles.sourceLabelReview]}>
                  {friend.source === 'review' ? 'Review' : 'First Take'}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      marginTop: Spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      ...Typography.body.lg,
      color: colors.text,
    },
    averageBadge: {
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: Spacing.sm + 2,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
    },
    averageText: {
      ...Typography.body.xs,
      color: colors.textSecondary,
    },
    scrollContent: {
      gap: Spacing.md,
      paddingRight: Spacing.md,
    },
    friendCard: {
      alignItems: 'center',
      width: 80,
    },
    avatarContainer: {
      position: 'relative',
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
      ...Typography.body.lg,
      color: colors.textSecondary,
    },
    ratingBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    ratingText: {
      ...Typography.caption.medium,
      color: '#fff',
      fontSize: 11,
    },
    friendName: {
      ...Typography.body.xs,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
      textAlign: 'center',
      maxWidth: 76,
    },
    sourceLabel: {
      ...Typography.caption.medium,
      fontSize: 9,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 2,
    },
    sourceLabelReview: {
      color: colors.tint,
    },
  });
