import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { usePremiumGate } from '@/hooks/use-premium';
import { useAnalyticsDetail } from '@/hooks/use-analytics-detail';
import { AnalyticsDetailList } from '@/components/analytics/analytics-detail-list';
import type { AnalyticsDetailType } from '@/lib/analytics-detail-service';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

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
          Included in CineTrak+
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

const VALID_TYPES = new Set<AnalyticsDetailType>([
  'movies',
  'tv-shows',
  'episodes',
  'tv-watch-time',
  'first-takes',
  'ratings',
  'monthly',
  'genre',
  'other-genres',
]);

export default function AnalyticsDetailScreen() {
  const { type, month, label, genreId, genreName, genreIds } = useLocalSearchParams<{
    type: string;
    month?: string;
    label?: string;
    genreId?: string;
    genreName?: string;
    genreIds?: string;
  }>();

  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const { isUnlocked, isLoading: premiumLoading } = usePremiumGate('advanced_stats');

  const detailType = VALID_TYPES.has(type as AnalyticsDetailType)
    ? (type as AnalyticsDetailType)
    : 'movies';

  const filter =
    detailType === 'monthly' && month
      ? { month }
      : detailType === 'genre' && genreId
      ? { genreId: parseInt(genreId, 10) }
      : detailType === 'other-genres' && genreIds
      ? { otherGenreIds: genreIds.split(',').map(Number).filter(Boolean) }
      : undefined;

  const {
    data,
    isLoading: dataLoading,
    isError,
    error,
  } = useAnalyticsDetail(detailType, filter, isUnlocked);

  const [compact, setCompact] = useState(false);

  const config = SCREEN_CONFIGS[detailType];
  const title =
    detailType === 'monthly' ? (label ?? 'Monthly Activity') :
    detailType === 'genre' ? (genreName ?? 'Genre') :
    config.title;
  const subtitle = isUnlocked && data ? config.getSubtitle(data.length) : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, Platform.OS === 'web' && styles.headerWeb]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[Typography.display.h4, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {/* Compact / detailed toggle — only show when there's data */}
        {isUnlocked && data && data.length > 0 ? (
          <Pressable
            onPress={() => setCompact((c) => !c)}
            style={({ pressed }) => [styles.toggleButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel={compact ? 'Switch to detailed view' : 'Switch to compact view'}
          >
            <Ionicons
              name={compact ? 'albums-outline' : 'list-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Premium loading */}
      {premiumLoading ? (
        <View style={styles.centerFlex}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : !isUnlocked ? (
        <UpgradePaywall colors={colors} />
      ) : (
        <View style={styles.content}>
          <AnalyticsDetailList
            type={detailType}
            data={data}
            isLoading={dataLoading}
            isError={isError}
            errorMessage={error?.message}
            compact={compact}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerWeb: {
    paddingTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.xs,
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  toggleButton: {
    width: 40,
    alignItems: 'flex-end',
    padding: Spacing.xs,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
