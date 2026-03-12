import {
  StyleSheet,
  View,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Pressable,
} from 'react-native';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';
import { FeedItemCard } from '@/components/cards/feed-item-card';
import { NativeFeedAd } from '@/components/ads/native-feed-ad';
import { usePrioritizedFeed } from '@/hooks/use-prioritized-feed';
import { useNotifications } from '@/hooks/use-notifications';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime, type FeedListItem, type FeedFilter } from '@/hooks/use-activity-feed';

// Default avatar for users without one
const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?u=default';

const FEED_FILTERS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'friends', label: 'Friends' },
];

// Stable separator component extracted to module level
function VerticalSeparator() {
  return <View style={{ height: Spacing.md }} />;
}

function AuthenticatedFeed() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');

  const {
    feedItems,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePrioritizedFeed(user?.id, feedFilter);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Render feed item
  const renderFeedItem = useCallback(
    ({ item }: { item: FeedListItem }) => {
      if (item.type === 'ad') return <NativeFeedAd />;

      if (item.type === 'caught-up') {
        return (
          <View style={styles.caughtUpContainer}>
            <View style={[styles.caughtUpLine, { backgroundColor: colors.textSecondary }]} />
            <Text style={[styles.caughtUpText, { color: colors.textSecondary }]}>
              You&apos;re all caught up
            </Text>
            <View style={[styles.caughtUpLine, { backgroundColor: colors.textSecondary }]} />
          </View>
        );
      }

      if (item.type === 'community-header') {
        return (
          <Text style={[styles.communityHeaderText, { color: colors.textSecondary }]}>
            From the community
          </Text>
        );
      }

      const feed = item.data;

      // Comment activity item
      if (feed.activityType === 'comment') {
        return (
          <View style={[styles.commentActivityCard, { borderColor: colors.border }]}>
            <View style={styles.commentHeaderRow}>
              <Image
                source={{ uri: feed.userAvatarUrl ?? DEFAULT_AVATAR }}
                style={styles.commentAvatar}
                contentFit="cover"
                transition={200}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.commentActivityText, { color: colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>{feed.userDisplayName}</Text>
                  {' commented on '}
                  {feed.targetReviewAuthorName && (
                    <Text style={{ fontWeight: '600' }}>{feed.targetReviewAuthorName}&apos;s</Text>
                  )}
                  {' review'}
                  {feed.movieTitle ? ` of ${feed.movieTitle}` : ''}
                </Text>
                <Text style={[styles.commentTimestamp, { color: colors.textTertiary }]}>
                  {formatRelativeTime(feed.createdAt ?? '')}
                </Text>
              </View>
            </View>
            {feed.commentText && !feed.isSpoiler && (
              <Text style={[styles.commentBody, { color: colors.textSecondary }]} numberOfLines={2}>
                &ldquo;{feed.commentText}&rdquo;
              </Text>
            )}
            {feed.commentText && feed.isSpoiler && (
              <Text style={[styles.commentBody, { color: colors.textTertiary, fontStyle: 'italic' }]}>
                Contains spoilers
              </Text>
            )}
          </View>
        );
      }

      // Standard feed item card (first_take or review)
      return (
        <FeedItemCard
          userName={feed.userDisplayName ?? 'Anonymous'}
          userAvatarUrl={feed.userAvatarUrl ?? DEFAULT_AVATAR}
          timestamp={formatRelativeTime(feed.createdAt ?? '')}
          movieTitle={feed.movieTitle}
          moviePosterUrl={getTMDBImageUrl(feed.posterPath, 'w185') ?? ''}
          rating={feed.rating}
          reviewText={feed.quoteText}
          isSpoiler={feed.isSpoiler ?? undefined}
          isCurrentUser={user?.id === feed.userId}
          mediaType={feed.mediaType}
          sourceId={feed.id}
          sourceType={feed.activityType === 'review' ? 'review' : 'first_take'}
          onMoviePress={() => {
            if (feed.mediaType === 'tv_show') {
              router.push(`/tv/${feed.tmdbId}`);
            } else {
              router.push(`/movie/${feed.tmdbId}`);
            }
          }}
        />
      );
    },
    [user?.id, colors.textSecondary, colors.border, colors.text, colors.textTertiary]
  );

  // Empty state when no activity
  const ListEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity yet</Text>
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
          Follow people to see their reviews here!
        </Text>
      </View>
    );
  }, [isLoading, colors.textSecondary, colors.text]);

  // Footer loading spinner
  const ListFooter = useCallback(() => {
    if (isFetchingNextPage) {
      return (
        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color={colors.tint} />
        </View>
      );
    }
    return null;
  }, [isFetchingNextPage, colors.tint]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Feed</Text>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [styles.bellButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Filter pills */}
      <View style={styles.filterContainer}>
        {FEED_FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[
              styles.filterPill,
              {
                backgroundColor:
                  feedFilter === f.value ? colors.tint : colors.backgroundSecondary,
              },
            ]}
            onPress={() => setFeedFilter(f.value)}
          >
            <Text
              style={[
                styles.filterPillText,
                {
                  color: feedFilter === f.value ? '#FFFFFF' : colors.textSecondary,
                },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Feed list */}
      <FlatList
        data={feedItems}
        keyExtractor={(item, index) =>
          item.type === 'ad'
            ? item.id
            : item.type === 'activity'
              ? item.data.id
              : item.type + '-' + index
        }
        renderItem={renderFeedItem}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={VerticalSeparator}
        contentContainerStyle={styles.contentContainer}
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.tint}
            />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

export default function FeedScreen() {
  const { user } = useAuth();

  if (!user) {
    return (
      <GuestSignInPrompt
        icon="chatbubbles-outline"
        title="Your Feed"
        message="Sign in to see what your friends are watching and discover new reviews"
      />
    );
  }

  return <AuthenticatedFeed />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
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
  bellButton: {
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
  filterContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  communityHeaderText: {
    ...Typography.body.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  caughtUpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  caughtUpLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  caughtUpText: {
    ...Typography.body.sm,
  },
  commentActivityCard: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.xs,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: Spacing.sm,
  },
  commentActivityText: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentTimestamp: {
    fontSize: 12,
    marginTop: 2,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: Spacing.xs,
    marginLeft: 36,
    fontStyle: 'italic',
  },
  emptyContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Typography.body.lg,
    marginTop: Spacing.sm,
  },
  emptyMessage: {
    ...Typography.body.sm,
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
