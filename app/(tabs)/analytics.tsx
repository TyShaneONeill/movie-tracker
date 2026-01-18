import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function AnalyticsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Header with Title and Year Selector */}
        <View style={styles.header}>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Analytics</Text>
          <View style={styles.yearPill}>
            <Text style={[Typography.body.sm, { color: colors.text }]}>2024</Text>
          </View>
        </View>

        {/* Summary Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: colors.tint, marginBottom: Spacing.xs }]}>42</Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Movies</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[Typography.display.h3, { color: colors.gold, marginBottom: Spacing.xs }]}>86h</Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Watch Time</Text>
          </View>
        </View>

        {/* Monthly Activity Bar Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[Typography.body.lg, { color: colors.text, marginBottom: Spacing.sm }]}>Monthly Activity</Text>
          <View style={styles.barChartContainer}>
            <BarColumn height={40} label="Jan" isActive={false} colors={colors} />
            <BarColumn height={60} label="Feb" isActive={false} colors={colors} />
            <BarColumn height={85} label="Mar" isActive={true} colors={colors} />
            <BarColumn height={50} label="Apr" isActive={false} colors={colors} />
            <BarColumn height={30} label="May" isActive={false} colors={colors} />
            <BarColumn height={70} label="Jun" isActive={false} colors={colors} />
          </View>
        </View>

        {/* Genre Distribution Donut Chart */}
        <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
          <View style={styles.genreContainer}>
            <View style={styles.donutChartContainer}>
              <View style={[styles.donutChart, { borderColor: colors.tint, backgroundColor: colors.card }]}>
                <View style={styles.donutInner}>
                  <Text style={[Typography.body.base, { fontWeight: '700', color: colors.text }]}>100%</Text>
                </View>
              </View>
            </View>
            <View style={styles.legendContainer}>
              <Text style={[Typography.body.lg, { color: colors.text, marginBottom: Spacing.sm }]}>Top Genres</Text>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: colors.tint }]} />
                <Text style={[Typography.body.sm, { color: colors.text }]}>Sci-Fi (60%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: colors.accentSecondary }]} />
                <Text style={[Typography.body.sm, { color: colors.text }]}>Action (25%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: colors.gold }]} />
                <Text style={[Typography.body.sm, { color: colors.text }]}>Drama (15%)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Milestones Section */}
        <Text style={[Typography.body.lg, { color: colors.text, marginTop: Spacing.lg, marginBottom: Spacing.md }]}>Milestones</Text>
        <View style={[styles.milestoneCard, { backgroundColor: colors.card }]}>
          <View style={styles.milestoneIconContainer}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.tint} strokeWidth={2}>
              <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <Path d="M4 22h16" />
              <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </Svg>
          </View>
          <View style={styles.milestoneContent}>
            <Text style={[Typography.body.base, { fontWeight: '600', color: colors.text, marginBottom: Spacing.xs / 2 }]}>Sci-Fi Fanatic</Text>
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Watched 10 Sci-Fi movies</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Bar Column Component for Monthly Activity Chart
function BarColumn({ height, label, isActive, colors }: { height: number; label: string; isActive: boolean; colors: any }) {
  return (
    <View style={styles.barColumn}>
      <View
        style={[
          styles.bar,
          {
            height: `${height}%`,
            backgroundColor: isActive ? colors.tint : colors.backgroundSecondary,
          },
        ]}
      />
      <Text style={[Typography.body.xs, { color: colors.textSecondary, marginTop: Spacing.xs }]}>{label}</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  yearPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
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
    width: '100%',
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
    flex: 0,
  },
  donutChart: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
    // Simulate conic gradient with border layers
    borderWidth: 20,
  },
  donutInner: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -10 }],
    width: 40,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  milestoneCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  milestoneIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneContent: {
    flex: 1,
  },
});
