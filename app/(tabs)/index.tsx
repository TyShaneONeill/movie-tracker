import {
  StyleSheet,
  View,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
  Platform,
  ScrollView,
} from 'react-native';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { router } from 'expo-router';

import { SectionHeader } from '@/components/ui/section-header';
import { TrendingCard } from '@/components/cards/trending-card';
import IconButton from '@/components/ui/icon-button';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useHomeMovieLists } from '@/hooks/use-home-movie-lists';
import { useHomeTvShowLists } from '@/hooks/use-home-tv-show-lists';
import { useContinueWatching } from '@/hooks/use-continue-watching';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { getTMDBImageUrl, getPrimaryGenre } from '@/lib/tmdb.types';
import { ContinueWatchingCard } from '@/components/cards/continue-watching-card';
import { BannerAdComponent } from '@/components/ads/banner-ad';
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

function CalendarIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Calendar body */}
      <Rect x={3} y={4} width={18} height={18} rx={2} ry={2} />
      {/* Top pegs */}
      <Line x1={16} y1={2} x2={16} y2={6} />
      <Line x1={8} y1={2} x2={8} y2={6} />
      {/* Divider line */}
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

// Stable separator components extracted to module level to avoid re-creating on every render
function HorizontalSeparator() {
  return <View style={{ width: Spacing.md }} />;
}

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

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ['suggestedUsers'] });
    await Promise.all([refetchMovies(), refetchTvShows(), continueWatching.refetch()]);
    setRefreshing(false);
  }, [refetchMovies, refetchTvShows, continueWatching, queryClient]);

  const handleThemeToggle = useCallback(() => {
    setThemePreference(effectiveTheme === 'dark' ? 'light' : 'dark');
  }, [effectiveTheme, setThemePreference]);

  const handleSearchPress = useCallback(() => {
    router.push('/search');
  }, []);

  const handleCalendarPress = useCallback(() => {
    router.push('/release-calendar');
  }, []);

  const handleTrendingPress = useCallback((movieId: number) => {
    router.push(`/movie/${movieId}`);
  }, []);

  const handleTvShowPress = useCallback((showId: number) => {
    router.push(`/tv/${showId}`);
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
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
              accessibilityLabel={`Toggle theme, currently ${effectiveTheme} mode`}
            />
            <IconButton
              variant="card"
              size={40}
              icon={(color) => <CalendarIcon color={color} />}
              onPress={handleCalendarPress}
              accessibilityLabel="Release calendar"
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
              ItemSeparatorComponent={HorizontalSeparator}
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
              ItemSeparatorComponent={HorizontalSeparator}
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
              ItemSeparatorComponent={HorizontalSeparator}
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
              ItemSeparatorComponent={HorizontalSeparator}
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
              ItemSeparatorComponent={HorizontalSeparator}
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
              ItemSeparatorComponent={HorizontalSeparator}
              // 160px card + 16px separator
              getItemLayout={(_, index) => ({ length: 160, offset: 176 * index, index })}
            />
          )}
        </View>

        {/* Ad Banner */}
        <BannerAdComponent placement="home" />

        {/* Suggested Users */}
        <SuggestedUsersSection />
      </ScrollView>
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
  trendingList: {
    paddingVertical: Spacing.xs,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
