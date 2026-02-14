/**
 * User Profile Screen
 * Displays another user's profile with their collection, first takes, and watchlist
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { FollowButton } from '@/components/social/FollowButton';
import { CollectionGridCard } from '@/components/cards/collection-grid-card';
import { FirstTakeCard } from '@/components/cards/first-take-card';
import { useUserProfile } from '@/hooks/use-user-profile';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { UserMovie, GroupedUserMovie } from '@/lib/database.types';

type TabType = 'collection' | 'first-takes' | 'watchlist';

// Grid layout constants
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const GRID_GAP = Spacing.sm;
const AVAILABLE_WIDTH = SCREEN_WIDTH - Spacing.lg * 2;
const CARD_WIDTH = (AVAILABLE_WIDTH - GRID_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const BackIcon = ({ color = 'white' }: { color?: string }) => (
  <Svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
  >
    <Path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

/**
 * Groups movies by tmdb_id and returns one entry per movie with journey count.
 */
function groupMoviesByTmdbId(movies: UserMovie[]): GroupedUserMovie[] {
  const movieMap = new Map<number, { primary: UserMovie; count: number }>();

  for (const movie of movies) {
    const existing = movieMap.get(movie.tmdb_id);

    if (existing) {
      existing.count++;
      // Priority: 1) User explicitly set display_poster to ai_generated, 2) Has AI art, 3) Most recent
      const currentHasExplicitAiPreference =
        existing.primary.display_poster === 'ai_generated' &&
        existing.primary.ai_poster_url;
      const newHasExplicitAiPreference =
        movie.display_poster === 'ai_generated' && movie.ai_poster_url;

      if (newHasExplicitAiPreference && !currentHasExplicitAiPreference) {
        existing.primary = movie;
      } else if (
        !currentHasExplicitAiPreference &&
        movie.ai_poster_url &&
        !existing.primary.ai_poster_url
      ) {
        existing.primary = movie;
      }
    } else {
      movieMap.set(movie.tmdb_id, { primary: movie, count: 1 });
    }
  }

  return Array.from(movieMap.values()).map(({ primary, count }) => ({
    ...primary,
    journeyCount: count,
  }));
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [activeTab, setActiveTab] = useState<TabType>('collection');

  // Fetch user profile data using the hook
  const { profile, watchedMovies, firstTakes, watchlist, isLoading, isError, stats } =
    useUserProfile(id!);

  // Group watched movies for collection grid
  const groupedMovies = useMemo(() => {
    return groupMoviesByTmdbId(watchedMovies);
  }, [watchedMovies]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  // Tab configuration
  const TAB_CONFIG: { key: TabType; label: string; count: number }[] = [
    { key: 'collection', label: 'Collection', count: stats.watched },
    { key: 'first-takes', label: 'First Takes', count: stats.firstTakes },
    { key: 'watchlist', label: 'Watchlist', count: stats.watchlist },
  ];

  // Render tab bar
  const renderTabBar = () => (
    <View
      style={[
        styles.tabBar,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      {TAB_CONFIG.map(({ key, label, count }) => {
        const isActive = activeTab === key;
        return (
          <Pressable
            key={key}
            onPress={() => handleTabChange(key)}
            style={({ pressed }) => [
              styles.tabItem,
              isActive && styles.tabItemActive,
              isActive && { borderBottomColor: colors.tint },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text
              style={[
                styles.tabValue,
                { color: isActive ? colors.text : colors.textSecondary },
              ]}
            >
              {count}
            </Text>
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? colors.text : colors.textSecondary },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Render collection grid
  const renderCollectionGrid = () => {
    if (groupedMovies.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No movies yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            This user has not added any movies to their collection
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.gridContainer}>
        {groupedMovies.map((movie) => {
          const isAiPoster =
            movie.display_poster === 'ai_generated' && !!movie.ai_poster_url;
          return (
            <CollectionGridCard
              key={movie.id}
              posterUrl={
                isAiPoster
                  ? movie.ai_poster_url!
                  : movie.poster_path
                    ? getTMDBImageUrl(movie.poster_path, 'w342') ?? ''
                    : ''
              }
              isAiPoster={isAiPoster}
              journeyCount={movie.journeyCount}
              style={{ width: CARD_WIDTH }}
            />
          );
        })}
      </View>
    );
  };

  // Render first takes list
  const renderFirstTakes = () => {
    if (firstTakes.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={48}
            color={colors.textSecondary}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No first takes yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            This user has not shared any first takes
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.firstTakesContainer}>
        {firstTakes.map((take, index) => (
          <FirstTakeCard
            key={take.id}
            movieTitle={take.movie_title}
            posterPath={take.poster_path}
            emoji={take.reaction_emoji}
            quote={take.quote_text}
            createdAt={take.created_at ?? ''}
            isLatest={index === 0}
            onPress={() => router.push(`/movie/${take.tmdb_id}`)}
          />
        ))}
      </View>
    );
  };

  // Render watchlist grid
  const renderWatchlistGrid = () => {
    if (watchlist.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Watchlist is empty
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            This user has not added any movies to their watchlist
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.gridContainer}>
        {watchlist.map((movie) => (
          <Pressable
            key={movie.id}
            onPress={() => router.push(`/movie/${movie.tmdb_id}`)}
            style={({ pressed }) => [
              styles.watchlistCard,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Image
              source={{
                uri: movie.poster_path
                  ? getTMDBImageUrl(movie.poster_path, 'w342') ?? undefined
                  : undefined,
              }}
              style={styles.watchlistImage}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'collection':
        return renderCollectionGrid();
      case 'first-takes':
        return renderFirstTakes();
      case 'watchlist':
        return renderWatchlistGrid();
      default:
        return null;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (isError || !profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <BackIcon color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>User not found</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            This user may not exist or their profile is unavailable
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <BackIcon color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* Avatar */}
          {profile.avatar_url ? (
            <Image
              source={{ uri: buildAvatarUrl(profile.avatar_url, profile.updated_at)! }}
              style={[styles.avatar, { borderColor: colors.tint }]}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarPlaceholder,
                { backgroundColor: colors.card, borderColor: colors.tint },
              ]}
            >
              <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>
                {(profile.full_name || profile.username || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}

          {/* Name */}
          <Text style={[styles.name, { color: colors.text }]}>
            {profile.full_name || profile.username || 'Unknown User'}
          </Text>

          {/* Username */}
          {profile.username && (
            <Text style={[styles.username, { color: colors.textSecondary }]}>
              @{profile.username}
            </Text>
          )}

          {/* Bio */}
          {profile.bio && (
            <Text style={[styles.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          )}

          {/* Follower/Following Stats */}
          <View style={styles.followStats}>
            <Pressable
              onPress={() => router.push(`/followers/${id}`)}
              style={({ pressed }) => [
                styles.followStatItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.followStatValue, { color: colors.text }]}>
                {profile.followers_count ?? 0}
              </Text>
              <Text style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                Followers
              </Text>
            </Pressable>
            <View style={styles.followStatDivider} />
            <Pressable
              onPress={() => router.push(`/following/${id}`)}
              style={({ pressed }) => [
                styles.followStatItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.followStatValue, { color: colors.text }]}>
                {profile.following_count ?? 0}
              </Text>
              <Text style={[styles.followStatLabel, { color: colors.textSecondary }]}>
                Following
              </Text>
            </Pressable>
          </View>

          {/* Follow Button */}
          <FollowButton userId={id!} username={profile.username} style={styles.followButton} />
        </View>

        {/* Tab Bar */}
        {renderTabBar()}

        {/* Tab Content */}
        <View style={styles.content}>{renderTabContent()}</View>
      </ScrollView>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  // Profile Header Styles
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '600',
  },
  name: {
    ...Typography.display.h3,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  username: {
    ...Typography.body.sm,
    marginTop: Spacing.xs,
  },
  bio: {
    ...Typography.body.base,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  followStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.lg,
    gap: Spacing.lg,
  },
  followStatItem: {
    alignItems: 'center',
  },
  followStatValue: {
    ...Typography.display.h4,
  },
  followStatLabel: {
    ...Typography.body.xs,
    marginTop: 2,
  },
  followStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
  },
  followButton: {
    marginTop: Spacing.lg,
    minWidth: 140,
  },
  // Tab Bar Styles
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabItemActive: {
    // Active state handled inline with colors.tint
  },
  tabValue: {
    ...Typography.display.h4,
  },
  tabLabel: {
    ...Typography.body.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Content Styles
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    minHeight: 400,
  },
  // Grid Styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  watchlistCard: {
    width: CARD_WIDTH,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  watchlistImage: {
    width: '100%',
    height: '100%',
  },
  // First Takes Styles
  firstTakesContainer: {
    gap: 0,
  },
  // Empty States
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    ...Typography.display.h4,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.body.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
