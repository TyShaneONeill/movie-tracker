/**
 * List Detail Screen
 *
 * Features:
 * - Hero section with first movie's poster as background
 * - Creator info with avatar and username
 * - List title and description
 * - Movie grid with rank badges
 * - Empty state when no movies
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useListDetail } from '@/hooks/use-list-mutations';
import { useProfile } from '@/hooks/use-profile';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { MovieStatus, UserMovie, ListMovie } from '@/lib/database.types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 320;
const GRID_PADDING = 16;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// List metadata
const LIST_META: Record<string, { title: string; description: string }> = {
  watchlist: {
    title: 'Watchlist',
    description: 'Movies you want to watch. Add films to plan your next movie night.',
  },
  watching: {
    title: 'Watching',
    description: "Movies you're currently watching. Track your progress here.",
  },
};

export default function ListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const isSystemList = id === 'watchlist' || id === 'watching';

  // Fetch system list movies (only when system list)
  const { movies: systemMovies, isLoading: systemLoading, isError: systemError } = useUserMovies(
    isSystemList ? (id as MovieStatus) : 'watchlist' // fallback value; disabled below
  );

  // Fetch custom list detail (only when custom list)
  const { data: customList, isLoading: customLoading, isError: customError } = useListDetail(
    isSystemList ? undefined : id
  );

  // Unified loading/error states
  const isLoading = isSystemList ? systemLoading : customLoading;
  const isError = isSystemList ? systemError : customError;

  // Fetch user profile for creator info
  const { profile } = useProfile();

  // Unified movie data as a common shape
  const movies: { id: string; tmdb_id: number; poster_path: string | null; media_type?: string }[] = useMemo(() => {
    if (isSystemList) {
      return systemMovies.map((m: UserMovie) => ({
        id: m.id,
        tmdb_id: m.tmdb_id,
        poster_path: m.poster_path,
      }));
    }
    return (customList?.movies ?? []).map((m: ListMovie) => ({
      id: m.id,
      tmdb_id: m.tmdb_id,
      poster_path: m.poster_path,
      media_type: m.media_type,
    }));
  }, [isSystemList, systemMovies, customList?.movies]);

  // Get list metadata
  const listMeta = useMemo(() => {
    if (isSystemList) {
      return LIST_META[id ?? ''] ?? { title: id ?? 'List', description: '' };
    }
    const movieCount = customList?.movies.length ?? 0;
    const countText = `${movieCount} ${movieCount === 1 ? 'movie' : 'movies'}`;
    return {
      title: customList?.name ?? 'List',
      description: customList?.description
        ? `${customList.description} \u00B7 ${countText}`
        : countText,
    };
  }, [isSystemList, id, customList]);

  // Get first movie's poster for hero background
  const heroImageUrl = movies.length > 0
    ? getTMDBImageUrl(movies[0].poster_path, 'original')
    : null;

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleMoviePress = (tmdbId: number, mediaType?: string) => {
    if (mediaType === 'tv_show') {
      router.push(`/tv/${tmdbId}`);
    } else {
      router.push(`/movie/${tmdbId}`);
    }
  };

  // Dynamic styles based on theme
  const insets = useSafeAreaInsets();
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Render movie grid item
  const renderMovieItem = ({ item, index }: { item: { id: string; tmdb_id: number; poster_path: string | null; media_type?: string }; index: number }) => {
    const posterUrl = getTMDBImageUrl(item.poster_path, 'w342');
    const rank = index + 1;

    return (
      <Pressable
        onPress={() => handleMoviePress(item.tmdb_id, item.media_type)}
        style={({ pressed }) => [
          dynamicStyles.movieCard,
          pressed && dynamicStyles.movieCardPressed,
        ]}
      >
        <Image
          source={{ uri: posterUrl ?? undefined }}
          style={dynamicStyles.moviePoster}
          contentFit="cover"
          transition={200}
        />
        {/* Rank Badge */}
        <View style={dynamicStyles.rankBadge}>
          <Text style={dynamicStyles.rankText}>{rank}</Text>
        </View>
      </Pressable>
    );
  };

  // Empty state component
  const EmptyState = () => (
    <View style={dynamicStyles.emptyState}>
      <Text style={dynamicStyles.emptyIcon}>
        {isSystemList ? (id === 'watchlist' ? '🎬' : '📺') : '📋'}
      </Text>
      <Text style={dynamicStyles.emptyTitle}>No movies yet</Text>
      <Text style={dynamicStyles.emptySubtitle}>
        {isSystemList
          ? (id === 'watchlist'
            ? 'Add movies you want to watch from the search or browse screens.'
            : 'Start watching a movie to see it here.')
          : 'No movies in this list yet. Add movies from the movie detail page.'}
      </Text>
    </View>
  );

  // Header component for FlatList (includes hero, creator, title)
  const ListHeader = () => (
    <>
      {/* Hero Section */}
      <View style={dynamicStyles.heroContainer}>
        <View style={dynamicStyles.heroBanner}>
          <Image
            source={heroImageUrl ? { uri: heroImageUrl } : undefined}
            style={[StyleSheet.absoluteFill, dynamicStyles.heroImage]}
            contentFit="cover"
            transition={200}
          />
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.4)', 'transparent', colors.background]}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Back Button */}
          <View style={[dynamicStyles.backButtonContainer, { top: Platform.OS === 'web' ? Spacing.md : insets.top + Spacing.xs }]}>
            <Pressable onPress={handleGoBack} style={dynamicStyles.iconButton}>
              <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
                <Text style={dynamicStyles.backIcon}>←</Text>
              </BlurView>
            </Pressable>
          </View>

          {/* Hero Content - positioned at bottom */}
          <View style={dynamicStyles.heroContent}>
            {/* Creator Info */}
            <View style={dynamicStyles.creatorRow}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={dynamicStyles.creatorAvatar}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[dynamicStyles.creatorAvatar, dynamicStyles.creatorAvatarPlaceholder]}>
                  <Text style={dynamicStyles.creatorAvatarText}>
                    {(profile?.username ?? 'U')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={dynamicStyles.creatorText}>
                Created by{' '}
                <Text style={dynamicStyles.creatorUsername}>
                  {profile?.username ?? profile?.full_name ?? 'You'}
                </Text>
              </Text>
            </View>

            {/* List Title */}
            <Text style={dynamicStyles.listTitle}>{listMeta.title}</Text>

            {/* List Description */}
            <Text style={dynamicStyles.listDescription}>{listMeta.description}</Text>
          </View>
        </View>
      </View>
    </>
  );

  // Loading state
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={dynamicStyles.container}>
          <View style={dynamicStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={dynamicStyles.loadingText}>Loading list...</Text>
          </View>
          {/* Back button during loading */}
          <View style={dynamicStyles.loadingBackButton}>
            <Pressable onPress={handleGoBack} style={dynamicStyles.iconButton}>
              <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
                <Text style={dynamicStyles.backIcon}>←</Text>
              </BlurView>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  // Error state
  if (isError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={dynamicStyles.container}>
          <View style={dynamicStyles.errorContainer}>
            <Text style={dynamicStyles.errorTitle}>Something went wrong</Text>
            <Text style={dynamicStyles.errorSubtitle}>Could not load list</Text>
            <Pressable onPress={handleGoBack} style={dynamicStyles.errorBackButton}>
              <Text style={dynamicStyles.errorBackButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={dynamicStyles.container}>
        <FlatList
          data={movies}
          keyExtractor={(item) => item.id}
          renderItem={renderMovieItem}
          numColumns={NUM_COLUMNS}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyState}
          contentContainerStyle={dynamicStyles.listContent}
          columnWrapperStyle={movies.length > 0 ? dynamicStyles.columnWrapper : undefined}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      </View>
    </>
  );
}

// Type for the colors object
type ThemeColors = typeof Colors.dark;

// Create styles function that takes theme colors
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      paddingBottom: Spacing.xxl,
    },
    columnWrapper: {
      paddingHorizontal: GRID_PADDING,
      gap: GRID_GAP,
      marginTop: GRID_GAP,
    },

    // Hero Section
    heroContainer: {
      height: HERO_HEIGHT,
      width: '100%',
    },
    heroBanner: {
      flex: 1,
      width: '100%',
    },
    heroImage: {
      opacity: 0.6,
    },
    backButtonContainer: {
      position: 'absolute',
      top: 60, // Fallback, overridden inline with safe area insets
      left: Spacing.md,
      zIndex: 20,
    },
    iconButton: {
      width: 40,
      height: 40,
      overflow: 'hidden',
      borderRadius: BorderRadius.full,
    },
    blurContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.full,
    },
    backIcon: {
      fontSize: 24,
      color: colors.text,
    },
    heroContent: {
      position: 'absolute',
      bottom: Spacing.md,
      left: Spacing.md,
      right: Spacing.md,
    },

    // Creator Info
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    creatorAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginRight: Spacing.sm,
    },
    creatorAvatarPlaceholder: {
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    creatorAvatarText: {
      ...Typography.caption.medium,
      color: colors.text,
      fontSize: 10,
    },
    creatorText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
    },
    creatorUsername: {
      color: colors.text,
    },

    // List Title & Description
    listTitle: {
      ...Typography.display.h2,
      color: colors.text,
      marginBottom: Spacing.xs,
    },
    listDescription: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    // Movie Grid
    movieCard: {
      width: ITEM_WIDTH,
      aspectRatio: 2 / 3,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    movieCardPressed: {
      opacity: 0.8,
    },
    moviePoster: {
      width: '100%',
      height: '100%',
    },
    rankBadge: {
      position: 'absolute',
      top: Spacing.xs,
      left: Spacing.xs,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      minWidth: 24,
      alignItems: 'center',
    },
    rankText: {
      ...Typography.caption.medium,
      color: '#ffffff',
    },

    // Empty State
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.xxl,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: Spacing.md,
    },
    emptyTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    emptySubtitle: {
      ...Typography.body.base,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },

    // Loading State
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      ...Typography.body.base,
      color: colors.textSecondary,
      marginTop: Spacing.md,
    },
    loadingBackButton: {
      position: 'absolute',
      top: 60,
      left: Spacing.md,
    },

    // Error State
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
    },
    errorTitle: {
      ...Typography.display.h4,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    errorSubtitle: {
      ...Typography.body.base,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    errorBackButton: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      backgroundColor: colors.tint,
      borderRadius: BorderRadius.md,
    },
    errorBackButtonText: {
      ...Typography.button.primary,
      color: Colors.dark.text,
    },
  });
