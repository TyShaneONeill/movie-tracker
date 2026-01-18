import {
  StyleSheet,
  View,
  FlatList,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';

import { SectionHeader } from '@/components/ui/section-header';
import { TrendingCard } from '@/components/cards/trending-card';
import { FeedItemCard } from '@/components/cards/feed-item-card';
import IconButton from '@/components/ui/icon-button';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TRENDING_MOVIES } from '@/lib/mock-data/movies';
import { MOCK_ACTIVITY } from '@/lib/mock-data/users';

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

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const handleThemeToggle = () => {
    // Toggle theme (in future, this will update system theme)
    // Will be implemented with theme context
  };

  const handleSearchPress = () => {
    // Navigate to search screen (when implemented)
    // router.push('/search');
  };

  const handleTrendingPress = (movieId: number) => {
    // Navigate to movie detail (when implemented)
    // router.push(`/movie/${movieId}`);
  };

  const handleActivityUserPress = (userId: string) => {
    // Navigate to user profile (when implemented)
  };

  const handleActivityMoviePress = (movieId: number) => {
    // Navigate to movie detail (when implemented)
    // router.push(`/movie/${movieId}`);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <LinearGradient
              colors={['#e11d48', '#f43f5e'] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientTextContainer}
            >
              <Text style={[styles.title, Typography.display.h3]}>
                CineTrack
              </Text>
            </LinearGradient>
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
            onActionPress={() => {}}
          />
          <FlatList
            horizontal
            data={TRENDING_MOVIES}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TrendingCard
                title={item.title}
                genre={item.genre}
                rating={String(item.rating)}
                posterUrl={item.posterPath}
                onPress={() => handleTrendingPress(item.id)}
              />
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingList}
            ItemSeparatorComponent={() => <View style={{ width: Spacing.md }} />}
          />
        </View>

        {/* Activity Feed Section */}
        <View style={[styles.section, styles.activitySection]}>
          <SectionHeader title="Activity" />
          <FlatList
            data={MOCK_ACTIVITY}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FeedItemCard
                userName={item.userName}
                userAvatarUrl={item.userAvatar}
                timestamp={item.timestamp}
                movieTitle={item.movieTitle}
                moviePosterUrl={item.moviePoster}
                rating={item.rating}
                reviewText={item.reviewText}
                onUserPress={() => handleActivityUserPress(item.userId)}
                onMoviePress={() => handleActivityMoviePress(item.movieId)}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.activityList}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: 90, // Space for floating nav bar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  gradientTextContainer: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.sm,
  },
  title: {
    // Typography.heading.xl applied inline
    // Note: Gradient text not directly supported in RN, using gradient background as fallback
    color: '#e11d48', // Fallback color
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
  activitySection: {
    flex: 1,
  },
  activityList: {
    paddingBottom: Spacing.md,
  },
});
