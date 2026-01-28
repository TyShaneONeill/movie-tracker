/**
 * Movie Detail Screen
 * Matches ui-mocks/movie_detail.html
 *
 * Features:
 * - Hero banner with backdrop image and gradient overlay
 * - Glassmorphism back/more buttons
 * - Centered play trailer button
 * - Content overlaps hero by 120px
 * - Poster thumbnail + title/year/runtime + rating/tags
 * - 4-column action grid (Like, Save, Review, Share)
 * - Top Cast horizontal scroll with circular avatars
 * - Where to Watch section with streaming service cards
 * - Action sheet modal for more options
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
// BottomSheetModal import removed - more options hidden for now
import { WatchlistModal } from '@/components/watchlist-modal';
import { FirstTakeModal } from '@/components/first-take-modal';
import { MovieStatusActions } from '@/components/movie-status-actions';
import { useMovieDetail } from '@/hooks/use-movie-detail';
import { useMovieActions } from '@/hooks/use-movie-actions';
import { useFirstTakeActions } from '@/hooks/use-first-take-actions';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBMovie } from '@/lib/tmdb.types';
import type { MovieStatus } from '@/lib/database.types';

// Helper to format runtime from minutes to "Xh Ym" format
function formatRuntime(minutes: number | null): string {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function MovieDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Modal state for watchlist
  const [showWatchlistModal, setShowWatchlistModal] = useState(false);
  // Modal state for First Take
  const [showFirstTakeModal, setShowFirstTakeModal] = useState(false);

  // Fetch movie details using the hook
  const { movie, cast, isLoading, isError, error } = useMovieDetail({
    movieId: id || '',
    enabled: !!id,
  });

  // Movie actions hook for save/like functionality (separate operations)
  const {
    isSaved,
    currentStatus,
    isLiked,
    isSaving,
    isTogglingLike,
    addToWatchlist,
    removeFromWatchlist,
    changeStatus,
    toggleLike,
  } = useMovieActions(Number(id) || 0);

  // First Take actions hook
  const {
    hasFirstTake,
    isCreating: isCreatingFirstTake,
    isDeleting: isDeletingFirstTake,
    createTake,
    deleteTake,
  } = useFirstTakeActions(Number(id) || 0);

  // User preferences hook (for First Take prompt setting)
  const { preferences } = useUserPreferences();
  // Default to true if preference is undefined (backwards compatibility)
  const firstTakePromptEnabled = preferences?.firstTakePromptEnabled ?? true;

  // Derive display data from fetched movie
  const movieYear = movie?.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const movieRuntime = formatRuntime(movie?.runtime ?? null);
  const movieRating = movie?.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const movieGenres = movie?.genres?.map(g => g.name) ?? [];
  const backdropUrl = getTMDBImageUrl(movie?.backdrop_path ?? null, 'original');
  const posterUrl = getTMDBImageUrl(movie?.poster_path ?? null, 'w342');

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // handlePlayTrailer removed - Coming Soon feature

  // Convert movie detail to TMDBMovie format for saving
  const getMovieForSave = (): TMDBMovie | null => {
    if (!movie) return null;
    return {
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
      vote_count: movie.vote_count,
      genre_ids: movie.genre_ids,
    };
  };

  const handleLike = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to like movies.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/signin') },
      ]);
      return;
    }
    const movieData = getMovieForSave();
    if (movieData) {
      try {
        await toggleLike(movieData);
      } catch {
        Alert.alert('Error', 'Failed to update like status. Please try again.');
      }
    }
  };

  const handleWatchlistPress = () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to add movies to your watchlist.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/signin') },
      ]);
      return;
    }
    setShowWatchlistModal(true);
  };

  const handleWatchlistSelect = async (status: MovieStatus) => {
    const movieData = getMovieForSave();
    if (!movieData) return;

    // Track if we're changing TO watched status (for First Take prompt)
    const isChangingToWatched = status === 'watched' && currentStatus !== 'watched';

    try {
      if (isSaved) {
        // Movie already in watchlist, just change status
        await changeStatus(status);
      } else {
        // Add to watchlist with selected status
        await addToWatchlist(movieData, status);
      }
      setShowWatchlistModal(false);

      // After successful status change to "watched", prompt for First Take
      // Only if user doesn't already have a First Take and preference is enabled
      if (isChangingToWatched && !hasFirstTake && firstTakePromptEnabled) {
        setShowFirstTakeModal(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to update watchlist. Please try again.');
    }
  };

  const handleWatchlistRemove = async () => {
    try {
      // If user has a First Take, delete it first
      if (hasFirstTake) {
        await deleteTake();
      }
      await removeFromWatchlist();
      setShowWatchlistModal(false);
    } catch {
      Alert.alert('Error', 'Failed to remove from watchlist. Please try again.');
    }
  };

  // Helper function to perform the actual removal
  const performRemoval = async () => {
    try {
      if (hasFirstTake) {
        await deleteTake();
      }
      await removeFromWatchlist();
    } catch {
      Alert.alert('Error', 'Failed to remove movie. Please try again.');
    }
  };

  const handleStatusChange = async (status: MovieStatus | null) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to track movies.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/signin') },
      ]);
      return;
    }

    const movieData = getMovieForSave();
    if (!movieData) return;

    // Track if we're changing TO watched status (for First Take prompt)
    const isChangingToWatched = status === 'watched' && currentStatus !== 'watched';

    try {
      if (status === null) {
        // Remove from watchlist - show confirmation if user has First Take
        if (hasFirstTake) {
          Alert.alert(
            'Remove Movie?',
            'This will also delete your First Take for this movie.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove Both', style: 'destructive', onPress: performRemoval },
            ]
          );
          return;
        }
        await removeFromWatchlist();
      } else if (isSaved) {
        // Movie already in watchlist, change status
        await changeStatus(status);
      } else {
        // Add to watchlist with selected status
        await addToWatchlist(movieData, status);
      }

      // After successful status change to "watched", prompt for First Take
      // Only if user doesn't already have a First Take and preference is enabled
      if (isChangingToWatched && !hasFirstTake && firstTakePromptEnabled) {
        setShowFirstTakeModal(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to update movie status. Please try again.');
    }
  };

  const handleFirstTakeSubmit = async (data: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
  }) => {
    if (!movie) return;

    try {
      await createTake({
        movieTitle: movie.title,
        posterPath: movie.poster_path,
        reactionEmoji: '',
        quoteText: data.quoteText,
        isSpoiler: data.isSpoiler,
        rating: data.rating,
      });
      setShowFirstTakeModal(false);
    } catch {
      Alert.alert('Error', 'Failed to save your first take. Please try again.');
    }
  };

  // handleReview and handleShare removed - Coming Soon features
  // showMoreOptionsSheet and hideMoreOptionsSheet removed - More options button hidden

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Show loading state
  if (isLoading) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={dynamicStyles.loadingText}>Loading movie details...</Text>
        </View>
        {/* Back button even during loading */}
        <View style={dynamicStyles.loadingBackButton}>
          <Pressable onPress={handleGoBack} style={dynamicStyles.iconButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
              <Text style={dynamicStyles.backIcon}>←</Text>
            </BlurView>
          </Pressable>
        </View>
      </View>
    );
  }

  // Show error state
  if (isError || !movie) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorTitle}>Something went wrong</Text>
          <Text style={dynamicStyles.errorSubtitle}>
            {error?.message || 'Could not load movie details'}
          </Text>
          <Pressable onPress={handleGoBack} style={dynamicStyles.errorBackButton}>
            <Text style={dynamicStyles.errorBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      <ScrollView
        style={dynamicStyles.scrollView}
        contentContainerStyle={dynamicStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <ImageBackground
          source={{ uri: backdropUrl || undefined }}
          style={dynamicStyles.heroBanner}
          resizeMode="cover"
        >
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.3)', 'transparent', colors.background]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Buttons */}
          <View style={dynamicStyles.topButtons}>
            <Pressable onPress={handleGoBack} style={dynamicStyles.iconButton}>
              <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
                <Text style={dynamicStyles.backIcon}>←</Text>
              </BlurView>
            </Pressable>
            {/* More options button hidden - Coming Soon */}
          </View>

          {/* Play Button - Coming Soon */}
          <View style={dynamicStyles.playButtonDisabled}>
            <BlurView intensity={10} tint={effectiveTheme} style={dynamicStyles.playButtonBlur}>
              <Text style={dynamicStyles.playIconDisabled}>▶</Text>
            </BlurView>
          </View>
        </ImageBackground>

        {/* Content Container - Overlaps hero by 120px */}
        <View style={dynamicStyles.contentContainer}>
          {/* Poster + Title Section */}
          <View style={dynamicStyles.posterSection}>
            <Image
              source={{ uri: posterUrl || undefined }}
              style={dynamicStyles.posterThumb}
              resizeMode="cover"
            />
            <View style={dynamicStyles.titleSection}>
              <Text style={dynamicStyles.title}>{movie.title}</Text>
              <Text style={dynamicStyles.metadata}>
                {movieYear} • {movieRuntime}
              </Text>
              <View style={dynamicStyles.ratingTags}>
                <Text style={dynamicStyles.rating}>★ {movieRating}</Text>
                {movieGenres.slice(0, 3).map((genre, index) => (
                  <View key={index} style={dynamicStyles.tag}>
                    <Text style={dynamicStyles.tagText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Synopsis */}
          <Text style={dynamicStyles.synopsis}>{movie.overview || 'No synopsis available.'}</Text>

          {/* Status Actions - Want to Watch / Watching */}
          <View style={dynamicStyles.statusActionsContainer}>
            <MovieStatusActions
              currentStatus={currentStatus}
              isLoading={isSaving}
              onStatusChange={handleStatusChange}
            />
          </View>

          {/* Action Grid */}
          <View style={dynamicStyles.actionGrid}>
            <Pressable
              onPress={handleLike}
              disabled={isTogglingLike}
              style={({ pressed }) => [
                dynamicStyles.actionItem,
                pressed && dynamicStyles.actionItemPressed,
              ]}
            >
              {isTogglingLike ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[dynamicStyles.actionIcon, isLiked && dynamicStyles.actionIconLiked]}>♥</Text>
              )}
              <Text style={[dynamicStyles.actionLabel, isLiked && dynamicStyles.actionLabelActive]}>
                {isLiked ? 'Liked' : 'Like'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleWatchlistPress}
              disabled={isSaving}
              style={({ pressed }) => [
                dynamicStyles.actionItem,
                pressed && dynamicStyles.actionItemPressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[dynamicStyles.actionIcon, isSaved && dynamicStyles.actionIconSaved]}>
                  {isSaved ? '✓' : '📋'}
                </Text>
              )}
              <Text style={[dynamicStyles.actionLabel, isSaved && dynamicStyles.actionLabelActive]}>
                Watchlist
              </Text>
            </Pressable>
            <View style={dynamicStyles.actionItemDisabled}>
              <Text style={dynamicStyles.actionIconDisabled}>💬</Text>
              <Text style={dynamicStyles.actionLabelDisabled}>Review</Text>
              <Text style={dynamicStyles.comingSoonText}>Soon</Text>
            </View>
            <View style={dynamicStyles.actionItemDisabled}>
              <Text style={dynamicStyles.actionIconDisabled}>🔗</Text>
              <Text style={dynamicStyles.actionLabelDisabled}>Share</Text>
              <Text style={dynamicStyles.comingSoonText}>Soon</Text>
            </View>
          </View>

          {/* Top Cast Section */}
          {cast.length > 0 && (
            <>
              <Text style={dynamicStyles.sectionTitle}>Top Cast</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={dynamicStyles.castScroll}
                contentContainerStyle={dynamicStyles.castScrollContent}
              >
                {cast.slice(0, 10).map((person) => (
                  <Pressable key={person.id} style={dynamicStyles.castCard}>
                    <Image
                      source={{ uri: getTMDBImageUrl(person.profile_path, 'w185') || undefined }}
                      style={dynamicStyles.castImage}
                      resizeMode="cover"
                    />
                    <Text style={dynamicStyles.castName} numberOfLines={1}>{person.name}</Text>
                    <Text style={dynamicStyles.castCharacter} numberOfLines={1}>{person.character}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Where to Watch Section */}
          <View style={dynamicStyles.sectionHeaderRow}>
            <Text style={[dynamicStyles.sectionTitle, dynamicStyles.streamingSectionTitle]}>
              Where to Watch
            </Text>
            <View style={dynamicStyles.comingSoonBadge}>
              <Text style={dynamicStyles.comingSoonBadgeText}>Coming Soon</Text>
            </View>
          </View>

          <View style={dynamicStyles.streamingServiceDisabled}>
            <View style={dynamicStyles.streamingIcon}>
              <Text style={dynamicStyles.streamingIconText}>MAX</Text>
            </View>
            <View style={dynamicStyles.streamingInfo}>
              <Text style={dynamicStyles.streamingNameDisabled}>Stream on Max</Text>
              <Text style={dynamicStyles.streamingType}>Subscription</Text>
            </View>
            <Text style={dynamicStyles.chevronIcon}>→</Text>
          </View>

          <View style={dynamicStyles.streamingServiceDisabled}>
            <View style={[dynamicStyles.streamingIcon, dynamicStyles.rentIcon]}>
              <Text style={dynamicStyles.rentIconText}>💳</Text>
            </View>
            <View style={dynamicStyles.streamingInfo}>
              <Text style={dynamicStyles.streamingNameDisabled}>Rent or Buy</Text>
              <Text style={dynamicStyles.streamingType}>From $19.99</Text>
            </View>
            <Text style={dynamicStyles.chevronIcon}>→</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Sheet Modal - Hidden, Coming Soon */}

      {/* Watchlist Modal */}
      <WatchlistModal
        visible={showWatchlistModal}
        onClose={() => setShowWatchlistModal(false)}
        onSelect={handleWatchlistSelect}
        onRemove={isSaved ? handleWatchlistRemove : undefined}
        currentStatus={currentStatus}
        isLoading={isSaving || isDeletingFirstTake}
        movieTitle={movie?.title}
        hasFirstTake={hasFirstTake}
      />

      {/* First Take Modal */}
      <FirstTakeModal
        visible={showFirstTakeModal}
        onClose={() => setShowFirstTakeModal(false)}
        onSubmit={handleFirstTakeSubmit}
        movieTitle={movie?.title ?? ''}
        moviePosterUrl={posterUrl ?? undefined}
        isSubmitting={isCreatingFirstTake}
      />
    </View>
  );
}

// Type for the colors object
type ThemeColors = typeof Colors.dark;

// Create styles function that takes theme colors
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },

  // Hero Banner Styles
  heroBanner: {
    height: 480,
    width: '100%',
    position: 'relative',
  },
  topButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 60, // Account for status bar
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
  moreIcon: {
    fontSize: 24,
    color: colors.text,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -36 }, { translateY: -36 }],
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    zIndex: 20,
  },
  playButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
  },
  playIcon: {
    fontSize: 32,
    color: colors.text,
    marginLeft: 4, // Visual centering
  },
  playButtonDisabled: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -36 }, { translateY: -36 }],
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    zIndex: 20,
    opacity: 0.5,
  },
  playIconDisabled: {
    fontSize: 32,
    color: colors.textSecondary,
    marginLeft: 4,
  },

  // Content Container
  contentContainer: {
    marginTop: -120, // Overlap hero by 120px
    paddingHorizontal: Spacing.md,
    zIndex: 10,
  },

  // Poster + Title Section
  posterSection: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-end',
  },
  posterThumb: {
    width: 130,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleSection: {
    flex: 1,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h3,
    color: colors.text,
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  metadata: {
    ...Typography.body.sm,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  ratingTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  rating: {
    ...Typography.body.sm,
    color: colors.gold,
    fontWeight: '600',
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    ...Typography.tag.default,
    color: colors.textSecondary,
  },

  // Synopsis
  synopsis: {
    ...Typography.body.base,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: Spacing.md,
  },

  // Status Actions
  statusActionsContainer: {
    marginTop: Spacing.lg,
  },

  // Action Grid
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    fontSize: 24,
    color: colors.textSecondary,
  },
  actionIconLiked: {
    color: colors.tint,
  },
  actionIconSaved: {
    color: colors.accentSecondary,
  },
  actionLabel: {
    ...Typography.caption.default,
    color: colors.textSecondary,
  },
  actionLabelActive: {
    color: colors.tint,
  },
  actionItemPressed: {
    opacity: 0.7,
  },
  actionItemDisabled: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    opacity: 0.5,
  },
  actionIconDisabled: {
    fontSize: 24,
    color: colors.textSecondary,
  },
  actionLabelDisabled: {
    ...Typography.caption.default,
    color: colors.textSecondary,
  },
  comingSoonText: {
    ...Typography.caption.default,
    fontSize: 10,
    color: colors.textTertiary,
  },

  // Cast Section
  sectionTitle: {
    ...Typography.display.h4,
    color: colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  castScroll: {
    marginHorizontal: -Spacing.md,
  },
  castScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  castCard: {
    width: 100,
    alignItems: 'center',
  },
  castImage: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: Spacing.sm,
  },
  castName: {
    ...Typography.body.sm,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  castCharacter: {
    ...Typography.caption.default,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Streaming Section
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  streamingSectionTitle: {
    marginTop: 0,
    marginBottom: 0,
  },
  comingSoonBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  comingSoonBadgeText: {
    ...Typography.caption.default,
    fontSize: 11,
    color: colors.textTertiary,
  },
  streamingService: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: Spacing.sm,
  },
  streamingServiceDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: Spacing.sm,
    opacity: 0.5,
  },
  streamingIcon: {
    width: 48,
    height: 48,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamingIconText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  rentIcon: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rentIconText: {
    fontSize: 24,
  },
  streamingInfo: {
    flex: 1,
  },
  streamingName: {
    ...Typography.body.baseMedium,
    color: colors.text,
    fontWeight: '600',
  },
  streamingNameDisabled: {
    ...Typography.body.baseMedium,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  streamingType: {
    ...Typography.body.sm,
    color: colors.textSecondary,
  },
  chevronIcon: {
    fontSize: 20,
    color: colors.textSecondary,
  },

  // Action Sheet styles removed - more options hidden for now

  // Loading state styles
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

  // Error state styles
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
    color: Colors.dark.text, // Always white on tint button for contrast
  },
});
