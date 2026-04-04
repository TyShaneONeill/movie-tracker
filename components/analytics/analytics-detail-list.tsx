import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { AnalyticsDetailItemRow } from './analytics-detail-item';
import type { AnalyticsDetailItem, AnalyticsDetailType } from '@/lib/analytics-detail-service';

// Mixed-type lists show the Movie/TV badge
const MIXED_TYPES: AnalyticsDetailType[] = ['monthly', 'genre', 'other-genres'];

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

interface SkeletonItemProps {
  colors: typeof Colors.dark;
}

function SkeletonItem({ colors }: SkeletonItemProps) {
  return (
    <View style={styles.skeletonRow}>
      <View style={[styles.skeletonPoster, { backgroundColor: colors.backgroundSecondary }]} />
      <View style={styles.skeletonInfo}>
        <View style={[styles.skeletonLine, styles.skeletonTitle, { backgroundColor: colors.backgroundSecondary }]} />
        <View style={[styles.skeletonLine, styles.skeletonMeta, { backgroundColor: colors.backgroundSecondary }]} />
        <View style={[styles.skeletonLine, styles.skeletonMetaShort, { backgroundColor: colors.backgroundSecondary }]} />
      </View>
    </View>
  );
}

interface AnalyticsDetailListProps {
  type: AnalyticsDetailType;
  data: AnalyticsDetailItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export function AnalyticsDetailList({
  type,
  data,
  isLoading,
  isError,
  errorMessage,
}: AnalyticsDetailListProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const showTypeBadge = MIXED_TYPES.includes(type);

  if (isLoading) {
    return (
      <View style={styles.skeletonContainer}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i}>
            <SkeletonItem colors={colors} />
            {i < 5 && (
              <View style={[styles.separator, { backgroundColor: colors.backgroundSecondary }]} />
            )}
          </View>
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
          <Path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </Svg>
        <Text style={[Typography.body.base, { color: colors.textSecondary, marginTop: Spacing.md, textAlign: 'center' }]}>
          {errorMessage ?? 'Failed to load data'}
        </Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
          <Path d="M3 3v18h18" />
          <Path d="m19 9-5 5-4-4-3 3" />
        </Svg>
        <Text style={[Typography.body.lg, { color: colors.text, marginTop: Spacing.md }]}>
          Nothing here yet
        </Text>
        <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.lg }]}>
          {EMPTY_MESSAGES[type]}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <AnalyticsDetailItemRow item={item} showTypeBadge={showTypeBadge} />
      )}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.backgroundSecondary }]} />
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={20}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
      ListFooterComponent={<ActivityIndicator size="small" color="transparent" />}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  skeletonContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  skeletonPoster: {
    width: 60,
    height: 90,
    borderRadius: 6,
    flexShrink: 0,
  },
  skeletonInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingTop: 4,
  },
  skeletonLine: {
    borderRadius: 4,
    height: 14,
  },
  skeletonTitle: {
    width: '75%',
    height: 16,
  },
  skeletonMeta: {
    width: '55%',
  },
  skeletonMetaShort: {
    width: '35%',
  },
});
