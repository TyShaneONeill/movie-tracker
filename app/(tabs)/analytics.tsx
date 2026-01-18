import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';

export default function AnalyticsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Header with Title and Year Selector */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <View style={styles.yearPill}>
            <Text style={styles.yearText}>2024</Text>
          </View>
        </View>

        {/* Summary Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.accentPrimary]}>42</Text>
            <Text style={styles.statLabel}>Movies</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.accentGold]}>86h</Text>
            <Text style={styles.statLabel}>Watch Time</Text>
          </View>
        </View>

        {/* Monthly Activity Bar Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Monthly Activity</Text>
          <View style={styles.barChartContainer}>
            <BarColumn height={40} label="Jan" isActive={false} />
            <BarColumn height={60} label="Feb" isActive={false} />
            <BarColumn height={85} label="Mar" isActive={true} />
            <BarColumn height={50} label="Apr" isActive={false} />
            <BarColumn height={30} label="May" isActive={false} />
            <BarColumn height={70} label="Jun" isActive={false} />
          </View>
        </View>

        {/* Genre Distribution Donut Chart */}
        <View style={styles.chartCard}>
          <View style={styles.genreContainer}>
            <View style={styles.donutChartContainer}>
              <View style={styles.donutChart}>
                <View style={styles.donutInner}>
                  <Text style={styles.donutText}>100%</Text>
                </View>
              </View>
            </View>
            <View style={styles.legendContainer}>
              <Text style={styles.chartTitle}>Top Genres</Text>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, styles.legendColorPrimary]} />
                <Text style={styles.legendText}>Sci-Fi (60%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, styles.legendColorSecondary]} />
                <Text style={styles.legendText}>Action (25%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, styles.legendColorGold]} />
                <Text style={styles.legendText}>Drama (15%)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Milestones Section */}
        <Text style={styles.sectionTitle}>Milestones</Text>
        <View style={styles.milestoneCard}>
          <View style={styles.milestoneIconContainer}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={Colors.dark.tint} strokeWidth={2}>
              <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <Path d="M4 22h16" />
              <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </Svg>
          </View>
          <View style={styles.milestoneContent}>
            <Text style={styles.milestoneTitle}>Sci-Fi Fanatic</Text>
            <Text style={styles.milestoneDescription}>Watched 10 Sci-Fi movies</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Bar Column Component for Monthly Activity Chart
function BarColumn({ height, label, isActive }: { height: number; label: string; isActive: boolean }) {
  return (
    <View style={styles.barColumn}>
      <View
        style={[
          styles.bar,
          { height: `${height}%` },
          isActive && styles.barActive,
        ]}
      />
      <Text style={styles.barLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
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
  headerTitle: {
    fontSize: 28,
    fontFamily: Fonts.display,
    fontWeight: '700',
    color: Colors.dark.text,
  },
  yearPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
  },
  yearText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontFamily: Fonts.sans,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 32,
    fontFamily: Fonts.display,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  accentPrimary: {
    color: Colors.dark.tint,
  },
  accentGold: {
    color: Colors.dark.gold,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.sans,
  },
  chartCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.sm,
    borderTopRightRadius: BorderRadius.sm,
    minHeight: 4,
  },
  barActive: {
    backgroundColor: Colors.dark.tint,
  },
  barLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.xs,
    fontFamily: Fonts.sans,
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
    backgroundColor: Colors.dark.card,
    position: 'relative',
    // Simulate conic gradient with border layers
    borderWidth: 20,
    borderColor: Colors.dark.tint,
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
  donutText: {
    fontSize: 16,
    fontFamily: Fonts.display,
    fontWeight: '700',
    color: Colors.dark.text,
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
  legendColorPrimary: {
    backgroundColor: Colors.dark.tint,
  },
  legendColorSecondary: {
    backgroundColor: Colors.dark.accentSecondary,
  },
  legendColorGold: {
    backgroundColor: Colors.dark.gold,
  },
  legendText: {
    fontSize: 14,
    color: Colors.dark.text,
    fontFamily: Fonts.sans,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.display,
    fontWeight: '600',
    color: Colors.dark.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  milestoneCard: {
    backgroundColor: Colors.dark.card,
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
  milestoneTitle: {
    fontSize: 16,
    fontFamily: Fonts.display,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: Spacing.xs / 2,
  },
  milestoneDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.sans,
  },
});
