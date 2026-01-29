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
  Image,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useUserMovies } from '@/hooks/use-user-movies';
import { useProfile } from '@/hooks/use-profile';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { MovieStatus, UserMovie } from '@/lib/database.types';

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

  // Convert id to MovieStatus for the hook
  const status = id as MovieStatus;

  // Fetch movies for this list
  const { movies, isLoading, isError } = useUserMovies(status);

  // Fetch user profile for creator info
  const { profile } = useProfile();

  // Get list metadata
  const listMeta = LIST_META[id ?? ''] ?? {
    title: id ?? 'List',
    description: '',
  };

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

  const handleMoviePress = (tmdbId: number) => {
    router.push(`/movie/${tmdbId}`);
  };

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Render movie grid item
  const renderMovieItem = ({ item, index }: { item: UserMovie; index: number }) => {
    const posterUrl = getTMDBImageUrl(item.poster_path, 'w342');
    const rank = index + 1;

    return (
      <Pressable
        onPress={() => handleMoviePress(item.tmdb_id)}
        style={({ pressed }) => [
          dynamicStyles.movieCard,
          pressed && dynamicStyles.movieCardPressed,
        ]}
      >
        <Image
          source={{ uri: posterUrl ?? undefined }}
          style={dynamicStyles.moviePoster}
          resizeMode="cover"
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
        {id === 'watchlist' ? '🎬' : '📺'}
      </Text>
      <Text style={dynamicStyles.emptyTitle}>No movies yet</Text>
      <Text style={dynamicStyles.emptySubtitle}>
        {id === 'watchlist'
          ? 'Add movies you want to watch from the search or browse screens.'
          : 'Start watching a movie to see it here.'}
      </Text>
    </View>
  );

  // Header component for FlatList (includes hero, creator, title)
  const ListHeader = () => (
    <>
      {/* Hero Section */}
      <View style={dynamicStyles.heroContainer}>
        <ImageBackground
          source={heroImageUrl ? { uri: heroImageUrl } : undefined}
          style={dynamicStyles.heroBanner}
          resizeMode="cover"
          imageStyle={dynamicStyles.heroImage}
        >
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.4)', 'transparent', colors.background]}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Back Button */}
          <View style={dynamicStyles.backButtonContainer}>
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
                />
              ) : (
                <View style={[dynamicStyles.creatorAvatar, dynamicStyles.creatorAvatarPlaceholder]}>
                  <Text style={dynamicStyles.creatorAvatarText}>
                    {(profile?.username ?? 'U')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={dynamicStyles.creatorText}>
                Created by {profile?.username ?? profile?.full_name ?? 'You'}
              </Text>
            </View>

            {/* List Title */}
            <Text style={dynamicStyles.listTitle}>{listMeta.title}</Text>

            {/* List Description */}
            <Text style={dynamicStyles.listDescription}>{listMeta.description}</Text>
          </View>
        </ImageBackground>
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
      top: 60,
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
