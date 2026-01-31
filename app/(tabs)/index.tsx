import {
  StyleSheet,
  View,
  FlatList,
  Text,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useCallback, useState } from 'react';
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
import { useAuth } from '@/hooks/use-auth';
import { useActivityFeed, formatRelativeTime } from '@/hooks/use-activity-feed';
import { getTMDBImageUrl, getPrimaryGenre } from '@/lib/tmdb.types';

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

  // Fetch movie lists with validation and deduplication
  const {
    trendingMovies,
    nowPlayingMovies,
    upcomingMovies,
    isLoading: moviesLoading,
    refetch: refetchMovies,
  } = useHomeMovieLists();

  // Fetch activity feed (20 most recent First Takes)
  const { data: activityFeed, isLoading: activityLoading, refetch: refetchActivity } = useActivityFeed(20);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchMovies(), refetchActivity()]);
    setRefreshing(false);
  }, [refetchMovies, refetchActivity]);

  const handleThemeToggle = () => {
    setThemePreference(effectiveTheme === 'dark' ? 'light' : 'dark');
  };

  const handleSearchPress = () => {
    router.push('/search');
  };

  const handleTrendingPress = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  const handleActivityMoviePress = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
      >
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
            />
            <IconButton
              variant="card"
              size={40}
              icon={(color) => <SearchIcon color={color} />}
              onPress={handleSearchPress}
            />
          </View>
        </View>

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
            />
          )}
        </View>

        {/* Activity Feed Section */}
        <View style={styles.section}>
          <SectionHeader title="Activity" />
          {activityLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : !activityFeed || activityFeed.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No activity yet. Be the first to share a First Take!
              </Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {activityFeed.map((item) => (
                <FeedItemCard
                  key={item.id}
                  userName={item.userDisplayName ?? 'Anonymous'}
                  userAvatarUrl={item.userAvatarUrl ?? DEFAULT_AVATAR}
                  timestamp={formatRelativeTime(item.createdAt ?? '')}
                  movieTitle={item.movieTitle}
                  moviePosterUrl={getTMDBImageUrl(item.posterPath, 'w185') ?? ''}
                  rating={item.rating}
                  reviewText={item.quoteText}
                  isSpoiler={item.isSpoiler ?? undefined}
                  isCurrentUser={user?.id === item.userId}
                  onMoviePress={() => handleActivityMoviePress(item.tmdbId)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
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
  trendingList: {
    paddingVertical: Spacing.xs,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
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
  activityList: {
    gap: Spacing.md,
  },
});
