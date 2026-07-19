import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { RankedDetailV2 } from '@/components/stats-v2/ranked-detail-v2';
import type { AnalyticsDetailType } from '@/lib/analytics-detail-service';

interface ScreenConfig {
  title: string;
  getSubtitle: (count: number) => string;
}

const SCREEN_CONFIGS: Record<AnalyticsDetailType, ScreenConfig> = {
  movies: {
    title: 'Movies Watched',
    getSubtitle: (n) => `${n} movies`,
  },
  'tv-shows': {
    title: 'TV Shows Watched',
    getSubtitle: (n) => `${n} shows`,
  },
  episodes: {
    title: 'Episodes Watched',
    getSubtitle: () => 'Ranked by episodes',
  },
  'tv-watch-time': {
    title: 'TV Watch Time',
    getSubtitle: () => 'Ranked by episodes watched',
  },
  'first-takes': {
    title: 'Your First Takes',
    getSubtitle: (n) => `${n} takes`,
  },
  ratings: {
    title: 'Your Ratings',
    getSubtitle: (n) => `${n} rated`,
  },
  monthly: {
    title: '',
    getSubtitle: (n) => `${n} watched`,
  },
  genre: {
    title: '',
    getSubtitle: (n) => `${n} watched`,
  },
  'other-genres': {
    title: 'Other Genres',
    getSubtitle: (n) => `${n} watched`,
  },
};

function UpgradePaywall({ colors }: { colors: typeof Colors.dark }) {
  return (
    <View style={styles.paywallContainer}>
      <View style={[styles.paywallIconWrap, { backgroundColor: colors.gold + '20' }]}>
        <Ionicons name="bar-chart-outline" size={48} color={colors.gold} />
      </View>
      <Text style={[Typography.display.h3, styles.paywallTitle, { color: colors.text }]}>
        Unlock Advanced Stats
      </Text>
      <Text style={[Typography.body.base, styles.paywallMessage, { color: colors.textSecondary }]}>
        Drill into your viewing history with ranked lists, episode counts, ratings, and more.
      </Text>
      <View style={[styles.tierBadge, { backgroundColor: colors.gold + '15' }]}>
        <Ionicons name="star" size={14} color={colors.gold} />
        <Text style={[Typography.body.sm, { color: colors.gold, fontWeight: '600' }]}>
          Included in PocketStubs+
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.upgradeButton,
          { backgroundColor: colors.gold, opacity: pressed ? 0.9 : 1 },
        ]}
        onPress={() => router.push('/upgrade')}
      >
        <Text style={styles.upgradeButtonText}>See Plans</Text>
      </Pressable>
    </View>
  );
}

/**
 * Ranked detail screen — renders the v2 reskin (`RankedDetailV2`)
 * unconditionally. The per-type title/subtitle config and the
 * `UpgradePaywall` are passed through so v2 reuses them verbatim instead of
 * forking the copy.
 *
 * Formerly gated behind the `stats_v2` PostHog flag alongside
 * `app/(tabs)/analytics.tsx`; stripped 2026-07-18 after 100% rollout since
 * 2026-07-11 (issue #661). The legacy v1 detail screen has been removed.
 */
export default function AnalyticsDetailScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <RankedDetailV2
      configs={SCREEN_CONFIGS}
      renderPaywall={() => <UpgradePaywall colors={colors} />}
    />
  );
}

const styles = StyleSheet.create({
  paywallContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  paywallIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  paywallTitle: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  paywallMessage: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  upgradeButton: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
