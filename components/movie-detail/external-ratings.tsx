import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useExternalRatings } from '@/hooks/use-external-ratings';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface ExternalRatingsProps {
  tmdbId: number;
}

// Rating source brand colors
const IMDB_GOLD = '#F5C518';
const RT_GREEN = '#22c55e';
const RT_RED = '#ef4444';
const MC_GREEN = '#22c55e';
const MC_YELLOW = '#eab308';
const MC_RED = '#ef4444';

function formatVoteCount(votes: number): string {
  if (votes >= 1_000_000) {
    return `${(votes / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (votes >= 1_000) {
    return `${(votes / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return votes.toString();
}

function getMetacriticColor(score: number): string {
  if (score >= 61) return MC_GREEN;
  if (score >= 40) return MC_YELLOW;
  return MC_RED;
}

function getRTColor(score: number): string {
  return score >= 60 ? RT_GREEN : RT_RED;
}

// Skeleton shimmer pill for loading state
function SkeletonPill({ shimmerColor }: { shimmerColor: string }) {
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
    <Animated.View
      style={[styles.skeletonPill, { backgroundColor: shimmerColor, opacity }]}
    />
  );
}

export function ExternalRatings({ tmdbId }: ExternalRatingsProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { ratings, isLoading } = useExternalRatings(tmdbId);

  const pills = useMemo(() => {
    if (!ratings) return [];

    const result: React.ReactNode[] = [];

    if (ratings.imdb) {
      const { rating, votes } = ratings.imdb;
      result.push(
        <View key="imdb" style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.sourceBadge, { backgroundColor: IMDB_GOLD }]}>
            <Text style={styles.sourceBadgeText}>IMDb</Text>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={[styles.scoreText, { color: colors.text }]}>
              {rating.toFixed(1)}/10
            </Text>
            <Text style={[styles.votesText, { color: colors.textTertiary }]}>
              {formatVoteCount(votes)}
            </Text>
          </View>
        </View>
      );
    }

    if (ratings.rottenTomatoes) {
      const { score } = ratings.rottenTomatoes;
      const tintColor = getRTColor(score);
      result.push(
        <View key="rt" style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.sourceBadge, { backgroundColor: tintColor }]}>
            <Text style={styles.sourceBadgeText}>RT</Text>
          </View>
          <Text style={[styles.scoreText, { color: colors.text }]}>{score}%</Text>
        </View>
      );
    }

    if (ratings.metacritic) {
      const { score } = ratings.metacritic;
      const tintColor = getMetacriticColor(score);
      result.push(
        <View key="mc" style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.sourceBadge, { backgroundColor: tintColor }]}>
            <Text style={styles.sourceBadgeText}>MC</Text>
          </View>
          <Text style={[styles.scoreText, { color: colors.text }]}>{score}</Text>
        </View>
      );
    }

    return result;
  }, [ratings, colors]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonPill shimmerColor={colors.backgroundSecondary} />
        <SkeletonPill shimmerColor={colors.backgroundSecondary} />
        <SkeletonPill shimmerColor={colors.backgroundSecondary} />
      </View>
    );
  }

  if (pills.length === 0) {
    return null;
  }

  return <View style={styles.container}>{pills}</View>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    gap: Spacing.sm,
    paddingRight: 10,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sourceBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
  votesText: {
    fontSize: 11,
  },
  skeletonPill: {
    width: 90,
    height: 30,
    borderRadius: BorderRadius.sm,
  },
});
