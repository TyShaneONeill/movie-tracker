/**
 * FeedV2Screen — the redesigned Feed (design contract 01). Friends' artifacts
 * (first takes as stub-back minis, reviews as programme notes) under one-line
 * attribution ledgers, day-grouped, with comment murmur lines and the "Shared
 * taste" rail. Rendered only behind the `feed_v2` flag; the legacy feed stays
 * byte-identical off-flag (single gate seam in feed.tsx).
 *
 * The FlatList is the ONLY vertical scroller — day headers, perforations,
 * murmur lines, and the rail are all TYPED ITEMS in one flat data array (the
 * rail's own horizontal FlatList is fine). Stable keyExtractor per composed
 * item; memoized renderItem.
 */

import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, Text, ActivityIndicator, RefreshControl, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { ContentContainer } from '@/components/content-container';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { analytics } from '@/lib/analytics';
import { useFeedV2Composed } from '@/hooks/use-feed-v2-composed';
import { formatShortTime, selectFeedListData, type FeedV2Filter, type FeedV2Item } from '@/lib/feed-v2-logic';
import { Perforation } from '@/components/first-takes-v2/perforation';
import { NativeFeedAd } from '@/components/ads/native-feed-ad';
import { ReportModal } from '@/components/moderation/report-modal';
import type { ReportTargetType } from '@/lib/report-service';
import { FeedArtifact } from './feed-artifact';
import { MurmurLine } from './murmur-line';
import { DayHeader } from './day-header';
import { FeedFilterChips } from './feed-filter-chips';
import { SharedTasteRail } from './shared-taste-rail';
import { FeedV2Empty, FeedV2Skeleton } from './states';

/** `resolving` renders the skeleton in the list area while the flag lands, with
 * the header + chips in place so there's no layout jump at resolution. */
export function FeedV2Screen({ resolving = false }: { resolving?: boolean }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FeedV2Filter>('all');
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string } | null>(null);

  const {
    items,
    suggestions,
    hasContent,
    isLoading,
    isError,
    refetch,
    refreshIfStale,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedV2Composed(user?.id, filter);

  useFocusEffect(
    useCallback(() => {
      analytics.track('feed:view', { tab: filter === 'friends' ? 'following' : 'community' });
      queryClient.invalidateQueries({ queryKey: ['feed-unread'] });
      refreshIfStale();
    }, [queryClient, filter, refreshIfStale])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // One `now` per data change keeps relative-time labels stable across renders
  // (recomputed when `items` change so times refresh on refetch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [items]);

  const renderItem = useCallback(
    ({ item }: { item: FeedV2Item }) => {
      switch (item.kind) {
        case 'day':
          return <DayHeader label={item.label} />;
        case 'artifact':
          return (
            <FeedArtifact
              item={item.item}
              timeLabel={formatShortTime(item.item.createdAt, now)}
              isOwn={item.item.userId === user?.id}
              onReport={() =>
                setReportTarget({
                  type: item.item.activityType === 'review' ? 'review' : 'first_take',
                  id: item.item.id,
                })
              }
            />
          );
        case 'murmur':
          return <MurmurLine murmur={item.murmur} />;
        case 'perf':
          return <Perforation />;
        case 'rail':
          return <SharedTasteRail suggestions={suggestions} />;
        case 'ad':
          return <NativeFeedAd />;
        default:
          return null;
      }
    },
    [now, suggestions, user?.id]
  );

  const showSkeleton = resolving || (isLoading && !hasContent);

  const ListEmpty = useCallback(() => {
    if (showSkeleton) return <FeedV2Skeleton />;
    if (isError) {
      return (
        <View style={styles.stateWrap}>
          <Ionicons name="warning-outline" size={44} color={colors.textSecondary} />
          <Text style={[styles.stateTitle, { color: colors.text }]}>Couldn&apos;t load your feed</Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retry, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return <FeedV2Empty onFindPeople={() => router.push('/search')} />;
  }, [showSkeleton, isError, refetch, colors.textSecondary, colors.text, colors.tint]);

  const ListFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }, [isFetchingNextPage, colors.tint]);

  // A build with no artifacts/murmurs can still carry a "Shared taste" rail
  // (e.g. Reviews filter over first-takes-only friends). Show the "lobby is
  // quiet" invitation in that case too — but KEEP the rail, since following its
  // suggestions is exactly how an empty lobby fills. The invitation renders
  // above the rail via the list header; when there's no rail either, the empty
  // component carries it.
  const hasRail = items.some((i) => i.kind === 'rail');
  const showEmptyInvite = !showSkeleton && !isError && !hasContent;

  // Blank only when there is genuinely nothing to show — a background error
  // (isError ORs across queries) must NOT wipe already-loaded following content.
  const data = selectFeedListData(items, { showSkeleton, isError });

  const ListHeader = useCallback(
    () =>
      showEmptyInvite && hasRail ? <FeedV2Empty onFindPeople={() => router.push('/search')} /> : null,
    [showEmptyInvite, hasRail]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ContentContainer style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Feed</Text>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.bell, { opacity: pressed ? 0.7 : 1 }]}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            accessibilityRole="button"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.filters}>
          <FeedFilterChips active={filter} onChange={setFilter} />
        </View>

        {reportTarget && (
          <ReportModal
            visible={!!reportTarget}
            onClose={() => setReportTarget(null)}
            targetType={reportTarget.type}
            targetId={reportTarget.id}
          />
        )}

        <FlatList
          data={data}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          bounces={Platform.OS !== 'web'}
          overScrollMode={Platform.OS === 'web' ? 'never' : 'auto'}
          refreshControl={
            Platform.OS !== 'web' ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
            ) : undefined
          }
        />
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.display.h2,
  },
  bell: {
    position: 'relative',
    padding: Spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#e11d48',
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  filters: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  stateWrap: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stateTitle: {
    ...Typography.body.lg,
    marginTop: Spacing.sm,
  },
  retry: {
    marginTop: Spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
