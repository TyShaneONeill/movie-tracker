import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, G } from 'react-native-svg';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useUserStats, type GenreStats } from '@/hooks/use-user-stats';
import { useAuth } from '@/hooks/use-auth';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';
import { BannerAdComponent } from '@/components/ads/banner-ad';

// Genre color palette for the donut chart
const GENRE_COLORS = [
  '#e11d48', // Rose - Primary
  '#10b981', // Emerald - Secondary
  '#fbbf24', // Amber - Gold
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
];

export default function AnalyticsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const { data: stats, isLoading, error, refetch } = useUserStats();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Guest state - show sign in prompt
  if (!user) {
    return (
      <GuestSignInPrompt
        icon="stats-chart-outline"
        title="Your Stats"
        message="Sign in to see your viewing statistics and movie insights"
      />
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[Typography.body.base, { color: colors.textSecondary, marginTop: Spacing.md }]}>
            Loading stats...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[Typography.body.base, { color: colors.tint }]}>Failed to load stats</Text>
          <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            {error.message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  const isEmpty = !stats || (stats.summary.totalWatched === 0 && stats.summary.totalTvWatched === 0);

  if (isEmpty) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          bounces={Platform.OS !== 'web'}
          overScrollMode={Platform.OS === 'web' ? 'never' : 'auto'}
          refreshControl={
            Platform.OS !== 'web' ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
            ) : undefined
          }
        >
          <View style={styles.header}>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Analytics</Text>
          </View>
          <View style={styles.emptyContainer}>
            <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
              <Path d="M3 3v18h18" />
              <Path d="m19 9-5 5-4-4-3 3" />
            </Svg>
            <Text style={[Typography.body.lg, { color: colors.text, marginTop: Spacing.md }]}>
              No stats yet
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' }]}>
              Start watching movies and TV shows to see your viewing statistics here
            </Text>
          </View>
          <BannerAdComponent placement="stats" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Calculate max count for bar chart scaling
  const maxMonthlyCount = Math.max(...stats.monthlyActivity.map((m) => m.count), 1);
  // Bar chart area height (container height 150 minus paddingTop)
  const BAR_AREA_HEIGHT = 150 - Spacing.md;

  // Get current month for highlighting
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Prepare genre data for display (top 5 + "Other")
  const topGenres = stats.genres.slice(0, 5);
  const otherPercentage = stats.genres.slice(5).reduce((sum, g) => sum + g.percentage, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        bounces={Platform.OS !== 'web'}
        overScrollMode={Platform.OS === 'web' ? 'never' : 'auto'}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          ) : undefined
        }
      >
        {/* Header with Title */}
        <View style={styles.header}>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Analytics</Text>
        </View>

        {/* Summary Stats Row 1 */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: colors.tint, marginBottom: Spacing.xs }]}>
              {stats.summary.totalWatched}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Movies</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: colors.accentSecondary, marginBottom: Spacing.xs }]}>
              {stats.summary.totalTvWatched}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>TV Shows</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: '#8b5cf6', marginBottom: Spacing.xs }]}>
              {stats.summary.totalEpisodesWatched}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Episodes</Text>
          </View>
        </View>

        {/* Summary Stats Row 2 */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: '#3b82f6', marginBottom: Spacing.xs }]}>
              {stats.summary.totalWatchTimeMinutes > 0
                ? `${Math.floor(stats.summary.totalWatchTimeMinutes / 60)}h ${stats.summary.totalWatchTimeMinutes % 60}m`
                : '--'}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>TV Watch Time</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: colors.gold, marginBottom: Spacing.xs }]}>
              {stats.summary.totalFirstTakes}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>First Takes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: '#14b8a6', marginBottom: Spacing.xs }]}>
              {stats.summary.averageRating != null ? stats.summary.averageRating.toFixed(1) : '--'}
            </Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Avg Rating</Text>
          </View>
        </View>

        {/* Monthly Activity Bar Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[Typography.body.lg, { color: colors.text, marginBottom: Spacing.sm }]}>Monthly Activity</Text>
          <View style={styles.barChartContainer}>
            {stats.monthlyActivity.map((month) => (
              <BarColumn
                key={month.month}
                height={Math.max((month.count / maxMonthlyCount) * BAR_AREA_HEIGHT, 4)}
                count={month.count}
                label={month.monthLabel}
                isActive={month.month === currentMonth}
                colors={colors}
              />
            ))}
          </View>
        </View>

        {/* Genre Distribution */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <View style={styles.genreContainer}>
            <View style={styles.donutChartContainer}>
              <DonutChart genres={topGenres} colors={colors} />
            </View>
            <View style={styles.legendContainer}>
              <Text style={[Typography.body.lg, { color: colors.text, marginBottom: Spacing.sm }]}>Top Genres</Text>
              {topGenres.map((genre, index) => (
                <View key={genre.genreId} style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: GENRE_COLORS[index % GENRE_COLORS.length] }]} />
                  <Text style={[Typography.body.sm, { color: colors.text }]}>
                    {genre.genreName} ({genre.percentage}%)
                  </Text>
                </View>
              ))}
              {otherPercentage > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendColor, { backgroundColor: colors.textTertiary }]} />
                  <Text style={[Typography.body.sm, { color: colors.text }]}>
                    Other ({otherPercentage}%)
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Ad Banner */}
        <BannerAdComponent placement="stats" />

      </ScrollView>
    </SafeAreaView>
  );
}

// Bar Column Component for Monthly Activity Chart
function BarColumn({
  height,
  count,
  label,
  isActive,
  colors,
}: {
  height: number;
  count: number;
  label: string;
  isActive: boolean;
  colors: typeof Colors.dark;
}) {
  return (
    <View style={styles.barColumn}>
      <Text style={[Typography.body.xs, { color: colors.textSecondary, marginBottom: Spacing.xs }]}>
        {count > 0 ? count : ''}
      </Text>
      <View
        style={[
          styles.bar,
          {
            height,
            backgroundColor: isActive ? colors.tint : colors.backgroundSecondary,
          },
        ]}
      />
      <Text style={[Typography.body.xs, { color: isActive ? colors.text : colors.textSecondary, marginTop: Spacing.xs }]}>
        {label}
      </Text>
    </View>
  );
}

// Simple Donut Chart Component using SVG
function DonutChart({ genres, colors }: { genres: GenreStats[]; colors: typeof Colors.dark }) {
  const size = 120;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate total for proper segment sizing
  const totalPercentage = genres.reduce((sum, g) => sum + g.percentage, 0) || 100;

  let cumulativePercentage = 0;

  return (
    <View style={styles.donutWrapper}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.backgroundSecondary}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Genre segments */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {genres.map((genre, index) => {
            const segmentPercentage = (genre.percentage / totalPercentage) * 100;
            const dashLength = (circumference * segmentPercentage) / 100;
            const offset = circumference * (1 - cumulativePercentage / 100);
            cumulativePercentage += segmentPercentage;

            return (
              <Circle
                key={genre.genreId}
                cx={center}
                cy={center}
                r={radius}
                stroke={GENRE_COLORS[index % GENRE_COLORS.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100, // Space for bottom nav
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    paddingTop: Spacing.md,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 2,
  },
  bar: {
    width: '80%',
    borderTopLeftRadius: BorderRadius.sm,
    borderTopRightRadius: BorderRadius.sm,
    minHeight: 4,
  },
  genreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  donutChartContainer: {
    flexShrink: 0,
  },
  donutWrapper: {
    width: 120,
    height: 120,
  },
  legendContainer: {
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
