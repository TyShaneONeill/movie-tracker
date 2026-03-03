/**
 * Calendar Skeleton Components
 * Loading placeholders for the calendar grid and release day list.
 * Follows the same pulse animation pattern as search-skeleton.tsx.
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Spacing, BorderRadius } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Shared SkeletonPulse (same as search-skeleton.tsx)
// ---------------------------------------------------------------------------

function SkeletonPulse({ style, shimmerColor }: { style: any; shimmerColor: string }) {
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

  return <Animated.View style={[style, { backgroundColor: shimmerColor, opacity }]} />;
}

// ---------------------------------------------------------------------------
// CalendarGridSkeleton
// ---------------------------------------------------------------------------

interface CalendarGridSkeletonProps {
  cardColor: string;
  shimmerColor: string;
}

function CalendarGridSkeleton({ cardColor, shimmerColor }: CalendarGridSkeletonProps) {
  return (
    <View style={gridStyles.container}>
      {/* Month header row */}
      <View style={gridStyles.monthHeader}>
        <SkeletonPulse
          style={gridStyles.monthTitle}
          shimmerColor={shimmerColor}
        />
      </View>

      {/* Weekday header row */}
      <View style={gridStyles.weekdayRow}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={`wd-${i}`} style={gridStyles.weekdayCell}>
            <SkeletonPulse
              style={gridStyles.weekdayBar}
              shimmerColor={shimmerColor}
            />
          </View>
        ))}
      </View>

      {/* 5 rows x 7 columns of day cell placeholders */}
      <View style={gridStyles.dayGrid}>
        {Array.from({ length: 35 }).map((_, i) => (
          <View key={`day-${i}`} style={gridStyles.dayCell}>
            <SkeletonPulse
              style={gridStyles.dayCircle}
              shimmerColor={shimmerColor}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const DAY_CIRCLE_SIZE = 36;

const gridStyles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  monthHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  monthTitle: {
    width: '40%',
    height: 20,
    borderRadius: BorderRadius.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  weekdayBar: {
    width: 24,
    height: 14,
    borderRadius: 4,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    minHeight: 48,
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_SIZE / 2,
  },
});

// ---------------------------------------------------------------------------
// ReleaseDayListSkeleton
// ---------------------------------------------------------------------------

interface ReleaseDayListSkeletonProps {
  cardColor: string;
  shimmerColor: string;
}

function ReleaseCardSkeleton({
  cardColor,
  shimmerColor,
}: {
  cardColor: string;
  shimmerColor: string;
}) {
  return (
    <View style={[listStyles.card, { backgroundColor: cardColor }]}>
      {/* Poster */}
      <SkeletonPulse style={listStyles.poster} shimmerColor={shimmerColor} />

      {/* Content */}
      <View style={listStyles.content}>
        {/* Title */}
        <SkeletonPulse style={listStyles.titleLine} shimmerColor={shimmerColor} />

        {/* Genre pills */}
        <View style={listStyles.genreRow}>
          <SkeletonPulse style={listStyles.genrePill} shimmerColor={shimmerColor} />
          <SkeletonPulse style={listStyles.genrePill} shimmerColor={shimmerColor} />
        </View>

        {/* Rating */}
        <SkeletonPulse style={listStyles.ratingLine} shimmerColor={shimmerColor} />
      </View>
    </View>
  );
}

function ReleaseDayListSkeleton({ cardColor, shimmerColor }: ReleaseDayListSkeletonProps) {
  return (
    <View style={listStyles.wrapper}>
      {/* Date header */}
      <SkeletonPulse style={listStyles.dateHeader} shimmerColor={shimmerColor} />

      {/* Section header */}
      <SkeletonPulse style={listStyles.sectionHeader} shimmerColor={shimmerColor} />

      {/* 3 release card skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <ReleaseCardSkeleton key={i} cardColor={cardColor} shimmerColor={shimmerColor} />
      ))}
    </View>
  );
}

const listStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing.md,
  },
  dateHeader: {
    width: '30%',
    height: 18,
    borderRadius: 4,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    width: '40%',
    height: 13,
    borderRadius: 4,
    marginBottom: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  titleLine: {
    width: '70%',
    height: 15,
    borderRadius: 4,
  },
  genreRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  genrePill: {
    width: 50,
    height: 20,
    borderRadius: BorderRadius.full,
  },
  ratingLine: {
    width: '20%',
    height: 12,
    borderRadius: 4,
  },
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { CalendarGridSkeleton, ReleaseDayListSkeleton };
