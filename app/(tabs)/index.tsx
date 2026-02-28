import {
  StyleSheet,
  View,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { router } from 'expo-router';

import { SectionHeader } from '@/components/ui/section-header';
import { TrendingCard } from '@/components/cards/trending-card';
import { FeedItemCard } from '@/components/cards/feed-item-card';
import IconButton from '@/components/ui/icon-button';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useHomeMovieLists } from '@/hooks/use-home-movie-lists';
import { useHomeTvShowLists } from '@/hooks/use-home-tv-show-lists';
import { useContinueWatching } from '@/hooks/use-continue-watching';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { usePrioritizedFeed } from '@/hooks/use-prioritized-feed';
import { formatRelativeTime, type FeedListItem } from '@/hooks/use-activity-feed';
import { getTMDBImageUrl, getPrimaryGenre } from '@/lib/tmdb.types';
import { ContinueWatchingCard } from '@/components/cards/continue-watching-card';
import { BannerAdComponent } from '@/components/ads/banner-ad';
import { NativeFeedAd } from '@/components/ads/native-feed-ad';
import { SuggestedUsersSection } from '@/components/social/SuggestedUsersSection';

function SunIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={5} />
      <Line x1={12} y1={1} x2={12} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={23} />
      <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} />
      <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} />
      <Line x1={1} y1={12} x2={3} y2={12} />
      <Line x1={21} y1={12} x2={23} y2={12} />
      <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} />
      <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

// Default avatar for users without one
const DEFAULT_AVATAR = 'https://i.pravatar.cc/150?u=default';

export default function HomeScreen() {
  const { effectiveTheme, setThemePreference } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch movie lists with validation and deduplication
  const {
    trendingMovies,
    nowPlayingMovies,
    upcomingMovies,
    isLoading: moviesLoading,
    refetch: refetchMovies,
  } = useHomeMovieLists();

  // Fetch TV show lists with deduplication
  const {
    trendingShows,
    airingTodayShows,
    isLoading: tvLoading,
    refetch: refetchTvShows,
  } = useHomeTvShowLists();

  // Fetch continue watching shows
  const continueWatching = useContinueWatching();
  const { preferences } = useUserPreferences();
  const showContinueWatching = preferences?.showContinueWatching ?? true;

  // Fetch prioritized activity feed (following first, then community)
  const {
    feedItems,
    isLoading: activityLoading,
    refetch: refetchActivity,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePrioritizedFeed(user?.id);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['suggestedUsers'] });
    await Promise.all([refetchMovies(), refetchTvShows(), refetchActivity(), continueWatching.refetch()]);
    setRefreshing(false);
  }, [refetchMovies, refetchTvShows, refetchActivity, continueWatching, queryClient]);

  // Handle infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleThemeToggle = useCallback(() => {
    setThemePreference(effectiveTheme === 'dark' ? 'light' : 'dark');
  }, [effectiveTheme, setThemePreference]);

  const handleSearchPress = useCallback(() => {
    router.push('/search');
  }, []);

  const handleTrendingPress = useCallback((movieId: number) => {
    router.push(`/movie/${movieId}`);
  }, []);

  const handleTvShowPress = useCallback((showId: number) => {
    router.push(`/tv/${showId}`);
  }, []);

  // Render activity feed item, ad, or separator
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
        return <SectionHeader title="From the community" style={{ marginTop: Spacing.sm }} />;
      }

      const feed = item.data;
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
    [user?.id, colors.textSecondary]
  );

  // Header component with all movie sections
  const ListHeader = useCallback(
    () => (
      <>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, Typography.display.brand]}>
              CineTrak
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Discover & Track
            </Text>
          </View>

          <View style={styles.headerActions}>
            <IconButton
              variant="card"
              size={40}
              icon={(color) => <SunIcon color={color} />}
              onPress={handleThemeToggle}
              accessibilityLabel={`Toggle theme, currently ${effectiveTheme} mode`}
            />
            <IconButton
              variant="card"
              size={40}
              icon={(color) => <SearchIcon color={color} />}
              onPress={handleSearchPress}
              accessibilityLabel="Search"
            />
          </View>
        </View>

        {/* Continue Watching Section */}
        {user && showContinueWatching && continueWatching.shows.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Continue Watching" />
            <FlatList
              horizontal
              data={continueWatching.shows}
              keyExtractor={(item) => String(item.tmdb_id)}
              renderItem={({ item }) => (
                <ContinueWatchingCard
                  showId={item.tmdb_id}
                  name={item.name}
                  posterPath={item.poster_path}
                  currentSeason={item.current_season}
                  currentEpisode={item.current_episode}
                  episodesWatched={item.episodes_watched}
                  totalEpisodes={item.number_of_episodes}
                  onPress={() => handleTvShowPress(item.tmdb_id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
            />
          </View>
        )}

        {/* Trending Section */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending Now"
            actionText="See All"
            onActionPress={() => router.push('/category/trending')}
          />
          {moviesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : (
            <FlatList
              horizontal
              data={trendingMovies}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrendingCard
                  title={item.title}
                  genre={getPrimaryGenre(item.genre_ids)}
                  rating={item.vote_average.toFixed(1)}
                  posterUrl={getTMDBImageUrl(item.poster_path, 'w342') ?? ''}
                  onPress={() => handleTrendingPress(item.id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Now Playing Section */}
        <View style={styles.section}>
          <SectionHeader
            title="Now Playing"
            actionText="See All"
            onActionPress={() => router.push('/category/now_playing')}
          />
          {moviesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : (
            <FlatList
              horizontal
              data={nowPlayingMovies}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrendingCard
                  title={item.title}
                  genre={getPrimaryGenre(item.genre_ids)}
                  rating={item.vote_average.toFixed(1)}
                  posterUrl={getTMDBImageUrl(item.poster_path, 'w342') ?? ''}
                  onPress={() => handleTrendingPress(item.id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Coming Soon Section */}
        <View style={styles.section}>
          <SectionHeader
            title="Coming Soon"
            actionText="See All"
            onActionPress={() => router.push('/category/upcoming')}
          />
          {moviesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : (
            <FlatList
              horizontal
              data={upcomingMovies}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrendingCard
                  title={item.title}
                  genre={getPrimaryGenre(item.genre_ids)}
                  rating={item.vote_average.toFixed(1)}
                  posterUrl={getTMDBImageUrl(item.poster_path, 'w342') ?? ''}
                  onPress={() => handleTrendingPress(item.id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Trending TV Section */}
        <View style={styles.section}>
          <SectionHeader
            title="Trending TV"
            actionText="See All"
            onActionPress={() => router.push('/category/tv_trending')}
          />
          {tvLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : (
            <FlatList
              horizontal
              data={trendingShows}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrendingCard
                  title={item.name}
                  genre={getPrimaryGenre(item.genre_ids)}
                  rating={item.vote_average.toFixed(1)}
                  posterUrl={getTMDBImageUrl(item.poster_path, 'w342') ?? ''}
                  onPress={() => handleTvShowPress(item.id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Airing Today Section */}
        <View style={styles.section}>
          <SectionHeader
            title="Airing Today"
            actionText="See All"
            onActionPress={() => router.push('/category/tv_airing_today')}
          />
          {tvLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : (
            <FlatList
              horizontal
              data={airingTodayShows}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TrendingCard
                  title={item.name}
                  genre={getPrimaryGenre(item.genre_ids)}
                  rating={item.vote_average.toFixed(1)}
                  posterUrl={getTMDBImageUrl(item.poster_path, 'w342') ?? ''}
                  onPress={() => handleTvShowPress(item.id)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Ad Banner */}
        <BannerAdComponent placement="home" />

        {/* Suggested Users */}
        <SuggestedUsersSection />

        {/* Activity Section Header */}
        <View style={styles.activityHeader}>
          <SectionHeader title="Activity" />
          {activityLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          )}
        </View>
      </>
    ),
    [
      colors.textSecondary,
      colors.tint,
      moviesLoading,
      tvLoading,
      activityLoading,
      trendingMovies,
      nowPlayingMovies,
      upcomingMovies,
      trendingShows,
      airingTodayShows,
      user,
      continueWatching.shows,
      handleThemeToggle,
      handleSearchPress,
      handleTrendingPress,
      handleTvShowPress,
    ]
  );

  // Footer component for loading more indicator
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

  // Empty component when no activity
  const ListEmpty = useCallback(() => {
    if (activityLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No activity yet. Be the first to share a First Take!
        </Text>
      </View>
    );
  }, [activityLoading, colors.textSecondary]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <FlatList
        data={feedItems}
        keyExtractor={(item, index) =>
          item.type === 'ad' ? item.id :
          item.type === 'activity' ? item.data.id :
          item.type + '-' + index
        }
        renderItem={renderFeedItem}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 90, // Space for floating nav bar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  title: {
    color: '#e11d48', // Rose 600 - Primary accent
  },
  subtitle: {
    ...Typography.body.sm,
    marginTop: Spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  activityHeader: {
    marginBottom: Spacing.sm,
  },
  trendingList: {
    paddingVertical: Spacing.xs,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
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
});
