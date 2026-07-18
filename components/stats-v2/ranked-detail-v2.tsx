import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { Fonts } from '@/constants/theme';
import { useStatsColors, type StatsV2ColorTokens } from '@/constants/stats-v2-theme';
import { usePremiumGate } from '@/hooks/use-premium';
import { useAnalyticsDetail } from '@/hooks/use-analytics-detail';
import { useStatsDensity } from '@/hooks/use-stats-density';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { ContentContainer } from '@/components/content-container';
import type { AnalyticsDetailItem, AnalyticsDetailType } from '@/lib/analytics-detail-service';
import { useSkeletonPulse, Block } from './stats-v2-skeleton';

const SKELETON_FADE_MS = 320;
const CONTENT_REVEAL_MS = 420;
const CONTENT_REVEAL_DELAY_MS = 60;

/** Per-type title/subtitle config — passed in from `app/analytics/[type].tsx`
 * so the v1 screen's `SCREEN_CONFIGS` stays the single source of truth. */
export interface RankedDetailConfig {
  title: string;
  getSubtitle: (count: number) => string;
}

// Mixed-type lists show the Movie/TV badge.
const MIXED_TYPES: AnalyticsDetailType[] = ['monthly', 'genre', 'other-genres'];

// Same copy as `components/analytics/analytics-detail-list.tsx` (v1) — kept
// local so the v1 file stays untouched by the v2 reskin.
const EMPTY_MESSAGES: Record<AnalyticsDetailType, string> = {
  movies: 'No movies watched yet. Mark some as watched to see them here.',
  'tv-shows': 'No TV shows finished yet. Mark a show as watched to see it here.',
  episodes: 'No TV shows with episodes tracked yet.',
  'tv-watch-time': 'No TV shows with episodes tracked yet.',
  'first-takes': 'No First Takes with quotes yet. Add a quote when you mark something watched.',
  ratings: 'No ratings yet. Rate movies and shows via First Takes.',
  monthly: 'Nothing watched this month.',
  genre: 'No content watched in this genre yet.',
  'other-genres': 'No content watched outside your top genres yet.',
};

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

const NUMERIC_RE = /^\d+(\.\d+)?$/;

function openItem(item: AnalyticsDetailItem) {
  if (item.mediaType === 'tv') {
    router.push(`/tv/${item.tmdbId}`);
  } else {
    router.push(`/movie/${item.tmdbId}`);
  }
}

function TypeBadge({ item, c }: { item: AnalyticsDetailItem; c: StatsV2ColorTokens }) {
  return (
    <View style={[styles.badge, { backgroundColor: c.cardHi, borderColor: c.line }]}>
      <Text style={[styles.badgeText, { color: c.sec }]}>
        {item.mediaType === 'tv' ? 'TV' : 'Movie'}
      </Text>
    </View>
  );
}

function RatingChip({ value, c }: { value: string; c: StatsV2ColorTokens }) {
  return (
    <View style={styles.ratingChip}>
      <Ionicons name="star" size={12} color={c.gold} />
      <Text style={[styles.ratingChipText, { color: c.gold }]}>{value}</Text>
    </View>
  );
}

function CompactRow({
  item,
  showTypeBadge,
  c,
}: {
  item: AnalyticsDetailItem;
  showTypeBadge: boolean;
  c: StatsV2ColorTokens;
}) {
  // compactMetric overrides primaryMetric when explicitly set (even if null) —
  // same semantics as the v1 row.
  const hasCompactOverride = 'compactMetric' in item;
  const rightValue = hasCompactOverride ? item.compactMetric : item.primaryMetric;
  const isNumeric = rightValue != null && NUMERIC_RE.test(rightValue);

  return (
    <Pressable
      testID="ranked-row-compact"
      style={({ pressed }) => [styles.compactRow, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => openItem(item)}
    >
      <Image
        source={{ uri: getTMDBImageUrl(item.posterPath, 'w185') ?? undefined }}
        style={[styles.compactPoster, { backgroundColor: c.cardHi }]}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.compactTitleWrap}>
        <Text style={[styles.compactTitle, { color: c.text }]} numberOfLines={1}>
          {item.title}
          {item.year ? <Text style={{ color: c.ter }}> ({item.year})</Text> : null}
        </Text>
      </View>
      {showTypeBadge && <TypeBadge item={item} c={c} />}
      {rightValue != null &&
        (isNumeric ? (
          <View style={styles.compactMetaWrap}>
            <Ionicons name="star" size={11} color={c.gold} />
            <Text style={[styles.compactMetaMono, { color: c.gold }]}>{rightValue}</Text>
          </View>
        ) : (
          <Text style={[styles.compactMeta, { color: c.sec }]} numberOfLines={1}>
            {rightValue.replace(/^(Watched|Finished|Added)\s/, '')}
          </Text>
        ))}
    </Pressable>
  );
}

function DetailedRow({
  item,
  showTypeBadge,
  c,
}: {
  item: AnalyticsDetailItem;
  showTypeBadge: boolean;
  c: StatsV2ColorTokens;
}) {
  const secondaryIsRating = item.secondaryMetric != null && NUMERIC_RE.test(item.secondaryMetric);

  return (
    <Pressable
      testID="ranked-row-detailed"
      style={({ pressed }) => [styles.detailedRow, { opacity: pressed ? 0.7 : 1 }]}
      onPress={() => openItem(item)}
    >
      <Image
        source={{ uri: getTMDBImageUrl(item.posterPath, 'w185') ?? undefined }}
        style={[styles.detailedPoster, { backgroundColor: c.cardHi }]}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.detailedInfo}>
        <View style={styles.detailedTitleRow}>
          <Text style={[styles.detailedTitle, { color: c.text }]} numberOfLines={2}>
            {item.title}
            {item.year ? <Text style={{ color: c.ter }}> ({item.year})</Text> : null}
          </Text>
          {showTypeBadge && <TypeBadge item={item} c={c} />}
        </View>
        {item.primaryMetric != null ? (
          <Text style={[styles.detailedSub, { color: c.sec }]}>{item.primaryMetric}</Text>
        ) : (
          <View style={[styles.addDateChip, { borderColor: c.accent.primary }]}>
            <Ionicons name="calendar-outline" size={11} color={c.accent.primary} />
            <Text style={[styles.addDateText, { color: c.accent.primary }]}>Add watch date</Text>
          </View>
        )}
        {item.secondaryMetric != null &&
          (secondaryIsRating ? (
            <RatingChip value={item.secondaryMetric} c={c} />
          ) : (
            <Text style={[styles.detailedSub, { color: c.ter }]} numberOfLines={2}>
              {item.secondaryMetric}
            </Text>
          ))}
      </View>
    </Pressable>
  );
}

/** Skeleton mirroring the ranked list layout (poster + two lines per row). */
function RankedDetailSkeleton({ c }: { c: StatsV2ColorTokens }) {
  const opacity = useSkeletonPulse();
  const block = { opacity, color: c.shimmer };
  return (
    <View testID="ranked-detail-skeleton" style={styles.skeletonWrap}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Block w={42} h={63} r={6} {...block} />
          <View style={styles.skeletonLines}>
            <Block w={`${72 - (i % 3) * 14}%`} h={14} r={6} {...block} />
            <Block w={56} h={11} r={5} {...block} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ type, c }: { type: AnalyticsDetailType; c: StatsV2ColorTokens }) {
  return (
    <View style={styles.centerFlex}>
      <View style={styles.emptyStubs}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.emptyStub,
              { borderColor: c.lineHi, backgroundColor: c.bar.futureBg },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.emptyTitle, { color: c.text }]}>Nothing here yet</Text>
      <Text style={[styles.emptyMessage, { color: c.sec }]}>{EMPTY_MESSAGES[type]}</Text>
    </View>
  );
}

interface RankedDetailV2Props {
  configs: Record<AnalyticsDetailType, RankedDetailConfig>;
  /** The v1 `UpgradePaywall`, reused verbatim — rendered inside the v2 shell. */
  renderPaywall: () => ReactElement;
}

/**
 * Stats v2 ranked detail (design section 2 — `RankedListScreen`, vault PS-05,
 * PR 4 of 4). Rendered unconditionally by `app/analytics/[type].tsx` since
 * the `stats_v2` flag strip (2026-07-18, issue #661): back + centered
 * title/subtitle header, a persisted density toggle (list ↔ cards),
 * skeleton→content cross-fade + pull-to-refresh consistent with the stats-v2
 * tab, and the same premium gating (free → paywall, member → ranked list).
 */
export function RankedDetailV2({ configs, renderPaywall }: RankedDetailV2Props) {
  const { type, month, label, genreId, genreName, genreIds } = useLocalSearchParams<{
    type: string;
    month?: string;
    label?: string;
    genreId?: string;
    genreName?: string;
    genreIds?: string;
  }>();

  const c = useStatsColors();
  const { isUnlocked, isLoading: premiumLoading } = usePremiumGate('advanced_stats');
  const { compact, toggleDensity } = useStatsDensity();

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
    refetch,
  } = useAnalyticsDetail(detailType, filter, isUnlocked);

  const [refreshing, setRefreshing] = useState(false);

  // Skeleton on first load, replayed on pull-to-refresh, then cross-faded out
  // while the list fades + lifts in — same choreography as StatsV2Screen.
  const loading = dataLoading || refreshing;
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const skeletonOpacity = useRef(new Animated.Value(1)).current;
  const contentReveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (loading) {
      setSkeletonMounted(true);
      skeletonOpacity.setValue(1);
      contentReveal.setValue(0);
      return;
    }
    Animated.timing(skeletonOpacity, {
      toValue: 0,
      duration: SKELETON_FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSkeletonMounted(false);
    });
    Animated.timing(contentReveal, {
      toValue: 1,
      duration: CONTENT_REVEAL_MS,
      delay: CONTENT_REVEAL_DELAY_MS,
      useNativeDriver: true,
    }).start();
  }, [loading, skeletonOpacity, contentReveal]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const onToggleDensity = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleDensity();
  }, [toggleDensity]);

  const config = configs[detailType];
  const title =
    detailType === 'monthly' ? (label ?? 'Monthly Activity') :
    detailType === 'genre' ? (genreName ?? 'Genre') :
    config.title;
  const subtitle = isUnlocked && data ? config.getSubtitle(data.length) : '';
  const showTypeBadge = MIXED_TYPES.includes(detailType);

  return (
    <SafeAreaView
      testID="ranked-detail-v2"
      style={[styles.container, { backgroundColor: c.bg }]}
      edges={['top']}
    >
      <ContentContainer style={{ flex: 1 }}>
        {/* Header — back + centered title/subtitle + density toggle */}
        <View style={[styles.header, Platform.OS === 'web' && styles.headerWeb]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={c.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.headerSubtitle, { color: c.sec }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {isUnlocked && data && data.length > 0 ? (
            <Pressable
              testID="density-toggle"
              onPress={onToggleDensity}
              style={({ pressed }) => [
                styles.headerButton,
                styles.headerButtonRight,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel={compact ? 'Switch to detailed view' : 'Switch to compact view'}
            >
              <Ionicons
                name={compact ? 'albums-outline' : 'list-outline'}
                size={21}
                color={c.sec}
              />
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>

        {premiumLoading ? (
          <View style={styles.centerFlex}>
            <ActivityIndicator size="large" color={c.accent.primary} />
          </View>
        ) : !isUnlocked ? (
          renderPaywall()
        ) : isError ? (
          <View style={styles.centerFlex}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>Failed to load data</Text>
            <Text style={[styles.emptyMessage, { color: c.sec }]}>
              {error?.message ?? 'Something went wrong. Pull to try again.'}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <Animated.View
              pointerEvents={loading ? 'none' : 'auto'}
              style={[
                styles.content,
                {
                  opacity: contentReveal,
                  transform: [
                    {
                      translateY: contentReveal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {!loading && (!data || data.length === 0) ? (
                <EmptyState type={detailType} c={c} />
              ) : (
                <FlatList
                  data={data ?? []}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) =>
                    compact ? (
                      <CompactRow item={item} showTypeBadge={showTypeBadge} c={c} />
                    ) : (
                      <DetailedRow item={item} showTypeBadge={showTypeBadge} c={c} />
                    )
                  }
                  ItemSeparatorComponent={() => (
                    <View style={[styles.separator, { backgroundColor: c.line }]} />
                  )}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={20}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews
                  refreshControl={
                    Platform.OS !== 'web' ? (
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={c.accent.primary}
                      />
                    ) : undefined
                  }
                />
              )}
            </Animated.View>
            {skeletonMounted && (
              <Animated.View
                pointerEvents={loading ? 'auto' : 'none'}
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: skeletonOpacity, backgroundColor: c.bg },
                ]}
              >
                <RankedDetailSkeleton c={c} />
              </Animated.View>
            )}
          </View>
        )}
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 14,
  },
  headerWeb: {
    paddingTop: 16,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerButtonRight: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 19,
    lineHeight: 24, // Outfit clips at tight line heights — keep breathing room
  },
  headerSubtitle: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  separator: {
    height: 1,
  },

  // ── Compact row (design: 42px poster + title (year) + right meta) ─────────
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  compactPoster: {
    width: 42,
    height: 63,
    borderRadius: 6,
    flexShrink: 0,
  },
  compactTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontFamily: Fonts.inter.medium,
    fontSize: 15,
    lineHeight: 20,
  },
  compactMeta: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'right',
    flexShrink: 0,
  },
  compactMetaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  compactMetaMono: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
    lineHeight: 17,
  },

  // ── Detailed row (design: 58px poster + title + date/sub + rating chip) ───
  detailedRow: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
  },
  detailedPoster: {
    width: 58,
    height: 87,
    borderRadius: 8,
    flexShrink: 0,
  },
  detailedInfo: {
    flex: 1,
    minWidth: 0,
  },
  detailedTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailedTitle: {
    fontFamily: Fonts.inter.medium,
    fontSize: 16,
    lineHeight: 21,
    flex: 1,
  },
  detailedSub: {
    fontFamily: Fonts.inter.regular,
    fontSize: 13,
    lineHeight: 17,
    marginTop: 4,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
  },
  ratingChipText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
    lineHeight: 17,
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: Fonts.inter.semibold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.3,
  },
  addDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  addDateText: {
    fontFamily: Fonts.inter.medium,
    fontSize: 11,
    lineHeight: 14,
  },

  // ── Skeleton / empty / error ───────────────────────────────────────────────
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  skeletonLines: {
    flex: 1,
    gap: 8,
  },
  centerFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emptyStubs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 22,
  },
  emptyStub: {
    width: 34,
    height: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontFamily: Fonts.outfit.extrabold,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: Fonts.inter.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 300,
  },
});
