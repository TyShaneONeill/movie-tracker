import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, type DimensionValue } from 'react-native';

import { useStatsColors } from '@/constants/stats-v2-theme';

/**
 * Stats v2 loading skeleton — mirrors the home layout (header + hero card +
 * Your Year graph) while analytics are fetched. The screen cross-fades from
 * this to content. Sections landing in later PRs (Going deeper) grow matching
 * skeleton blocks when they ship.
 */

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return opacity;
}

function Block({
  w = '100%',
  h = 14,
  r = 8,
  opacity,
  color,
  style,
}: {
  w?: DimensionValue;
  h?: number;
  r?: number;
  opacity: Animated.Value;
  color: string;
  style?: object;
}) {
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: r, backgroundColor: color, opacity }, style]}
    />
  );
}

export function StatsV2Skeleton() {
  const c = useStatsColors();
  const opacity = useSkeletonPulse();
  const block = { opacity, color: c.shimmer };

  return (
    <View testID="stats-v2-skeleton">
      {/* header */}
      <View style={styles.header}>
        <Block w={150} h={28} r={9} {...block} />
        <Block w={92} h={30} r={999} {...block} />
      </View>

      {/* hero stat card */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <View style={styles.heroRow}>
          <View style={styles.heroCol}>
            <Block w={90} h={14} r={6} {...block} style={styles.heroLabel} />
            <Block w={70} h={40} r={8} {...block} />
          </View>
          <View style={[styles.heroDivider, { backgroundColor: c.line }]} />
          <View style={styles.heroCol}>
            <Block w={90} h={14} r={6} {...block} style={styles.heroLabel} />
            <Block w={50} h={40} r={8} {...block} />
          </View>
        </View>
        <View style={[styles.rule, { backgroundColor: c.line }]} />
        <View style={styles.supportRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.supportCol}>
              <Block w={36} h={18} r={6} {...block} />
              <Block w={48} h={9} r={4} {...block} />
            </View>
          ))}
        </View>
      </View>

      {/* Your Year graph card */}
      <View style={[styles.yearCard, { backgroundColor: c.card, borderColor: c.line }]}>
        <Block w={110} h={11} r={5} {...block} />
        <Block w={130} h={30} r={8} {...block} style={styles.yearTotal} />
        <View style={styles.yearBars}>
          {[38, 62, 26, 74, 48, 90, 56, 30, 68, 44, 80, 52].map((h, i) => (
            <View key={i} style={styles.yearBarCol}>
              <Block w="100%" h={h} r={4} {...block} />
            </View>
          ))}
        </View>
        <Block w="100%" h={10} r={5} {...block} style={styles.yearGenreBar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 0,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  heroCol: {
    flex: 1,
  },
  heroLabel: {
    marginBottom: 12,
  },
  heroDivider: {
    width: 1,
    marginVertical: 2,
    marginHorizontal: 12,
  },
  rule: {
    height: 1,
    marginTop: 14,
    marginHorizontal: 12,
  },
  supportRow: {
    flexDirection: 'row',
  },
  supportCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  yearCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  yearTotal: {
    marginTop: 8,
  },
  yearBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginTop: 16,
  },
  yearBarCol: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  yearGenreBar: {
    marginTop: 18,
  },
});
