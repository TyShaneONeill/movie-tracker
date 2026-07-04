import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Fonts } from '@/constants/theme';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';
import type { UserStats } from '@/hooks/use-user-stats';
import { formatCount, formatWatch } from './format';

/**
 * Stats v2 top-stats card — "Hero" treatment (design section 1B).
 *
 * One card: two hero stats (Movies, TV Shows) side by side over a support row
 * of 4 smaller stats (Episodes, TV Watch Time, First Takes, Avg Rating). The
 * three dividers between support stats are absolutely positioned so they
 * "float" — clearing the horizontal rule above and never touching the card
 * bottom.
 *
 * Empty mode (design section 1G): every value is replaced by a colored "+"
 * affordance ("Add your first" on heroes), and taps route to search to log a
 * first title instead of opening the stat's detail.
 */

type IoniconName = keyof typeof Ionicons.glyphMap;

interface StatDef {
  key: string;
  label: string;
  icon: IoniconName;
  accent: string;
  /** Formatted display value; '—' is the "not enough data" affordance. */
  value: string;
  route: string;
}

function buildStats(
  summary: UserStats['summary'] | undefined,
  c: StatsV2ColorTokens
): { heroes: StatDef[]; support: StatDef[] } {
  const s = summary;
  const heroes: StatDef[] = [
    {
      key: 'movies',
      label: 'Movies',
      icon: 'film-outline',
      accent: c.stat.movies,
      value: formatCount(s?.totalWatched ?? 0),
      route: '/analytics/movies',
    },
    {
      key: 'tv-shows',
      label: 'TV Shows',
      icon: 'tv-outline',
      accent: c.stat.tvShows,
      value: formatCount(s?.totalTvWatched ?? 0),
      route: '/analytics/tv-shows',
    },
  ];
  const support: StatDef[] = [
    {
      key: 'episodes',
      label: 'Episodes',
      icon: 'layers-outline',
      accent: c.stat.episodes,
      value: formatCount(s?.totalEpisodesWatched ?? 0),
      route: '/analytics/episodes',
    },
    {
      key: 'tv-watch-time',
      label: 'TV Watch Time',
      icon: 'time-outline',
      accent: c.stat.watchTime,
      value: s && s.totalWatchTimeMinutes > 0 ? formatWatch(s.totalWatchTimeMinutes) : '—',
      route: '/analytics/tv-watch-time',
    },
    {
      key: 'first-takes',
      label: 'First Takes',
      icon: 'chatbubble-outline',
      accent: c.stat.firstTakes,
      value: formatCount(s?.totalFirstTakes ?? 0),
      route: '/analytics/first-takes',
    },
    {
      key: 'ratings',
      label: 'Avg Rating',
      icon: 'star-outline',
      accent: c.stat.avgRating,
      value: s?.averageRating != null ? s.averageRating.toFixed(1) : '—',
      route: '/analytics/ratings',
    },
  ];
  return { heroes, support };
}

function tapStat(stat: StatDef, empty: boolean) {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  // Empty state: every stat routes to search so the user can log a first title.
  router.push(empty ? '/search' : (stat.route as never));
}

/** The colored "+" shown in place of a value when the account is empty. */
function EmptyAdd({ color, big }: { color: string; big?: boolean }) {
  const size = big ? 30 : 22;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="add" size={big ? 17 : 13} color={color} />
    </View>
  );
}

function HeroStat({ stat, empty, c }: { stat: StatDef; empty: boolean; c: StatsV2ColorTokens }) {
  const long = stat.value.length > 4;
  return (
    <Pressable
      onPress={() => tapStat(stat, empty)}
      style={({ pressed }) => [styles.hero, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={styles.heroLabelRow}>
        <Ionicons name={stat.icon} size={16} color={stat.accent} />
        <Text style={[styles.heroLabel, { color: c.sec }]}>{stat.label}</Text>
      </View>
      {empty ? (
        <View style={styles.heroEmptyRow}>
          <EmptyAdd color={stat.accent} big />
          <Text style={[styles.heroEmptyText, { color: c.sec }]}>Add your first</Text>
        </View>
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.heroValue,
            // Outfit clips at tight line heights — keep breathing room
            { color: stat.accent, fontSize: long ? 34 : 42, lineHeight: long ? 38 : 46 },
          ]}
        >
          {stat.value}
        </Text>
      )}
    </Pressable>
  );
}

function SupportStat({ stat, empty, c }: { stat: StatDef; empty: boolean; c: StatsV2ColorTokens }) {
  const long = stat.value.length > 4;
  return (
    <Pressable
      onPress={() => tapStat(stat, empty)}
      style={({ pressed }) => [styles.support, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      {empty ? (
        <EmptyAdd color={stat.accent} />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.supportValue,
            { color: stat.accent, fontSize: long ? 15 : 19, lineHeight: long ? 18 : 22 },
          ]}
        >
          {stat.value}
        </Text>
      )}
      <Text style={[styles.supportLabel, { color: c.ter }]}>{stat.label}</Text>
    </Pressable>
  );
}

export function HeroStatCard({
  summary,
  empty,
}: {
  summary: UserStats['summary'] | undefined;
  empty: boolean;
}) {
  const c = useStatsColors();
  const { heroes, support } = buildStats(summary, c);

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
      {/* hero row */}
      <View style={styles.heroRow}>
        <HeroStat stat={heroes[0]} empty={empty} c={c} />
        <View style={[styles.heroDivider, { backgroundColor: c.line }]} />
        <HeroStat stat={heroes[1]} empty={empty} c={c} />
      </View>
      <View style={[styles.rule, { backgroundColor: c.line }]} />
      {/* support row — vertical dividers float: clear the rule above and the card bottom */}
      <View style={styles.supportRow}>
        {(['25%', '50%', '75%'] as const).map((left) => (
          <View key={left} style={[styles.floatingDivider, { left, backgroundColor: c.line }]} />
        ))}
        {support.map((stat) => (
          <SupportStat key={stat.key} stat={stat} empty={empty} c={c} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  hero: {
    flex: 1,
    minWidth: 0,
    gap: 9,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroLabel: {
    fontFamily: Fonts.inter.medium,
    fontSize: 13,
    lineHeight: 17,
  },
  heroValue: {
    fontFamily: Fonts.outfit.extrabold,
  },
  heroEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  heroEmptyText: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 13,
    lineHeight: 17,
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
    position: 'relative',
  },
  floatingDivider: {
    position: 'absolute',
    top: 6,
    bottom: 14,
    width: 1,
  },
  support: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  supportValue: {
    fontFamily: Fonts.outfit.extrabold,
  },
  supportLabel: {
    fontFamily: Fonts.inter.regular,
    fontSize: 10.5,
    lineHeight: 13,
    textAlign: 'center',
  },
});
