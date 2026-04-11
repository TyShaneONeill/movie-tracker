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
 * - Primary status buttons: Watchlist, Watching, Watched (circular, with SVG icons)
 * - 3-column action grid (Like, Review, Share)
 * - Top Cast horizontal scroll with circular avatars
 * - Where to Watch section with streaming service cards
 * - First Take modal prompt when marking as Watched
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import * as Localization from 'expo-localization';
import Toast from 'react-native-toast-message';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { FirstTakeModal } from '@/components/first-take-modal';
import { ReviewModal } from '@/components/review-modal';
import { MovieStatusActions } from '@/components/movie-status-actions';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { TrailerModal } from '@/components/modals/trailer-modal';
import { ConfirmationModal } from '@/components/modals/confirmation-modal';
import { AddToListModal } from '@/components/modals/add-to-list-modal';
import { CreateListModal } from '@/components/modals/create-list-modal';
import { useMovieDetail } from '@/hooks/use-movie-detail';
import { useMovieActions } from '@/hooks/use-movie-actions';
import { useFirstTakeActions } from '@/hooks/use-first-take-actions';
import { useReviewActions } from '@/hooks/use-review-actions';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useUserLists } from '@/hooks/use-user-lists';
import { useAuth } from '@/hooks/use-auth';
import { useTicketVerification } from '@/hooks/use-ticket-verification';
import { ExternalRatings } from '@/components/movie-detail/external-ratings';
import { FriendsRatings } from '@/components/movie-detail/friends-ratings';
import { CommunityReviews } from '@/components/movie-detail/community-reviews';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { addMovieToList, createList } from '@/lib/list-service';
import { shareTitle } from '@/lib/share-service';
import type { TMDBMovie, TMDBWatchProviders } from '@/lib/tmdb.types';
import { analytics } from '@/lib/analytics';
import type { MovieStatus } from '@/lib/database.types';
import { isUnreleased } from '@/lib/utils';

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
  // Support slug-format URLs like "scarface-111" (title-slug + TMDB ID).
  // Extract the numeric TMDB ID from the trailing segment after the last "-".
  const rawId = id ?? '';
  const tmdbId = rawId.includes('-') ? (rawId.split('-').pop() ?? rawId) : rawId;
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: userLists } = useUserLists();

  // Modal state for First Take and Review
  const [showFirstTakeModal, setShowFirstTakeModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

  // Fetch movie details using the hook
  const { movie, cast, crew, trailer, watchProviders, isLoading, isError, error } = useMovieDetail({
    movieId: tmdbId,
    enabled: !!tmdbId,
  });

  // Movie actions hook for save/like functionality (separate operations)
  const {
    userMovie,
    isSaved,
    currentStatus,
    isLiked,
    isSaving,
    isTogglingLike,
    addToWatchlist,
    removeFromWatchlist,
    changeStatus,
    downgradeStatus,
    toggleLike,
  } = useMovieActions(Number(tmdbId) || 0);

  // First Take actions hook
  const {
    hasFirstTake,
    isCreating: isCreatingFirstTake,
    createTake,
    deleteTake,
  } = useFirstTakeActions(Number(tmdbId) || 0);

  // Review actions hook
  const {
    existingReview,
    hasReview,
    isCreating: isCreatingReview,
    isUpdating: isUpdatingReview,
    createReview: createReviewAction,
    updateReview: updateReviewAction,
    deleteReview: deleteReviewAction,
  } = useReviewActions(Number(tmdbId) || 0);

  // User preferences hook (for First Take prompt setting)
  const { preferences } = useUserPreferences();
  // Default to true if preference is undefined (backwards compatibility)
  const firstTakePromptEnabled = preferences?.firstTakePromptEnabled ?? true;

  // Derive display data from fetched movie
  const movieYear = movie?.release_date ? movie.release_date.split('-')[0] : 'N/A';
  const movieRuntime = formatRuntime(movie?.runtime ?? null);
  const movieRating = (movie?.vote_count ?? 0) > 0 && (movie?.vote_average ?? 0) > 0 ? movie?.vote_average.toFixed(1) : '—';
  const movieGenres = movie?.genres?.map(g => g.name) ?? [];
  const backdropUrl = getTMDBImageUrl(movie?.backdrop_path ?? null, 'original');
  const posterUrl = getTMDBImageUrl(movie?.poster_path ?? null, 'w342');

  // Unreleased movie guard — prevents ratings/reviews on movies not yet in theaters
  const unreleased = isUnreleased(movie?.release_date);
  const { hasVerifiedTicket } = useTicketVerification(movie?.id ?? 0);
  const canInteract = !!movie && (!unreleased || hasVerifiedTicket);

  // Human-readable release date for alert messages (e.g. "March 22, 2025")
  const formattedReleaseDate = movie?.release_date
    ? new Date(movie.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'an upcoming date';

  // Track movie detail view
  const hasTrackedView = useRef(false);
  useEffect(() => {
    if (movie && !hasTrackedView.current) {
      hasTrackedView.current = true;
      analytics.track('movie:view', {
        tmdb_id: movie.id,
        title: movie.title,
        source: 'direct',
      });
    }
  }, [movie]);

  // Determine user's country for watch providers
  const countryCode = Localization.getLocales()[0]?.regionCode || 'US';
  const countryProviders: TMDBWatchProviders | undefined = watchProviders?.[countryCode];
  const watchLink = countryProviders?.link;

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handlePlayTrailer = () => {
    if (!trailer) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    setShowTrailerModal(true);
  };

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
    hapticImpact();
    requireAuth(async () => {
      const movieData = getMovieForSave();
      if (movieData) {
        try {
          await toggleLike(movieData);
        } catch {
          Toast.show({ type: 'error', text1: 'Failed to update like status', visibilityTime: 3000 });
        }
      }
    }, 'Sign in to like movies');
  };


  const handleShare = async () => {
    if (!movie) return;
    try {
      await shareTitle(movie.id, 'movie', movie.title);
      analytics.track('movie:share', { tmdb_id: movie.id });
    } catch {
      // user cancelled
    }
  };

  // Helper function to perform the actual removal
  const performRemoval = async () => {
    hapticImpact();
    try {
      if (hasFirstTake) {
        await deleteTake();
      }
      if (hasReview) {
        await deleteReviewAction();
      }
      await removeFromWatchlist();
      Toast.show({
        type: 'success',
        text1: 'Removed from List',
        visibilityTime: 2000,
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to remove movie', visibilityTime: 3000 });
    }
  };

  // Helper function to perform status downgrade (watched → watchlist/watching)
  const performDowngrade = async (newStatus: MovieStatus) => {
    hapticImpact();
    try {
      if (hasFirstTake) await deleteTake();
      if (hasReview) await deleteReviewAction();
      await downgradeStatus(newStatus);
      const label = newStatus === 'watchlist' ? 'Moved to Watchlist' : 'Now Watching';
      Toast.show({ type: 'success', text1: label, visibilityTime: 2000 });
      hapticNotification(NotificationFeedbackType.Success);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to update movie status', visibilityTime: 3000 });
    }
  };

  const handleStatusChange = async (status: MovieStatus | null) => {
    if (isSaving) return;
    hapticImpact();

    // Gate: block Watched and Watching actions for unreleased movies without a verified ticket
    if (!canInteract && (status === 'watched' || status === 'watching') && movie) {
      analytics.track('movie:unreleased_gate_hit', {
        tmdb_id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        has_verified_ticket: hasVerifiedTicket,
      });
      Alert.alert(
        'Not Available Yet',
        `${movie.title} releases on ${formattedReleaseDate}. Scan your ticket if you're attending an early showing.`,
        [{ text: 'OK' }]
      );
      return;
    }

    requireAuth(async () => {
      const movieData = getMovieForSave();
      if (!movieData) return;

      // Track if we're changing TO watched status (for First Take prompt)
      const isChangingToWatched = status === 'watched' && currentStatus !== 'watched';

      try {
        if (status === null) {
          // Remove from watchlist - show confirmation if user has First Take or Review
          if (hasFirstTake || hasReview) {
            const items = [hasFirstTake && 'First Take', hasReview && 'Review'].filter(Boolean).join(' and ');
            setConfirmation({
              title: 'Remove Movie?',
              message: `This will also delete your ${items} for this movie.`,
              confirmLabel: 'Remove All',
              onConfirm: performRemoval,
              destructive: true,
            });
            return;
          }
          await removeFromWatchlist();
          Toast.show({
            type: 'success',
            text1: 'Removed from List',
            visibilityTime: 2000,
          });
        } else if (isSaved && currentStatus === 'watched' && (status === 'watchlist' || status === 'watching')) {
          // Downgrading from "watched" — check if user has content at risk
          const hasJourneyContent = !!(
            userMovie?.ai_poster_url ||
            userMovie?.journey_notes ||
            (userMovie?.journey_photos && userMovie.journey_photos.length > 0)
          );

          if (hasFirstTake || hasReview || hasJourneyContent) {
            const items = [
              hasFirstTake && 'First Take',
              hasReview && 'Review',
              userMovie?.ai_poster_url && 'AI Journey Art',
              (userMovie?.journey_notes || userMovie?.journey_photos?.length) && 'viewing details',
            ].filter(Boolean).join(', ');

            const statusLabel = status === 'watchlist' ? 'Watchlist' : 'Watching';
            setConfirmation({
              title: `Move to ${statusLabel}?`,
              message: `This will permanently delete your ${items} for this movie. This cannot be undone.`,
              confirmLabel: `Move to ${statusLabel}`,
              onConfirm: () => performDowngrade(status),
              destructive: true,
            });
            return;
          }

          // No content at risk, just downgrade directly
          await downgradeStatus(status);
          const toastLabel = status === 'watchlist' ? 'Moved to Watchlist' : 'Now Watching';
          Toast.show({ type: 'success', text1: toastLabel, visibilityTime: 2000 });
        } else if (isSaved) {
          // Movie already in watchlist, change status (non-downgrade)
          await changeStatus(status);
          // Show toast based on new status
          const toastMessage = status === 'watchlist' ? 'Added to Watchlist' :
                               status === 'watching' ? 'Now Watching' : 'Marked as Watched';
          Toast.show({
            type: 'success',
            text1: toastMessage,
            visibilityTime: 2000,
          });
        } else {
          // Add to watchlist with selected status
          await addToWatchlist(movieData, status);
          // Show toast based on new status
          const toastMessage = status === 'watchlist' ? 'Added to Watchlist' :
                               status === 'watching' ? 'Now Watching' : 'Marked as Watched';
          Toast.show({
            type: 'success',
            text1: toastMessage,
            visibilityTime: 2000,
          });
        }

        // After successful status change to "watched", prompt for First Take
        // Only if user doesn't already have a First Take, preference is enabled, and movie is released/accessible
        if (isChangingToWatched && !hasFirstTake && firstTakePromptEnabled && canInteract) {
          setShowFirstTakeModal(true);
        }

        // Success haptic after action completes
        hapticNotification(NotificationFeedbackType.Success);
      } catch {
        Toast.show({ type: 'error', text1: 'Failed to update movie status', visibilityTime: 3000 });
      }
    }, 'Sign in to track movies');
  };

  const handleFirstTakeSubmit = async (data: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
    visibility: import('@/lib/database.types').ReviewVisibility;
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
        visibility: data.visibility,
      });
      analytics.track('movie:rate', {
        tmdb_id: movie.id,
        rating: data.rating,
        has_quote: data.quoteText.length > 0,
        is_spoiler: data.isSpoiler,
        visibility: data.visibility,
      });
      setShowFirstTakeModal(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save your first take', visibilityTime: 3000 });
    }
  };

  const handleReview = () => {
    hapticImpact();

    // Gate: block reviews for unreleased movies without a verified ticket
    if (!canInteract && movie) {
      analytics.track('movie:unreleased_gate_hit', {
        tmdb_id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        has_verified_ticket: hasVerifiedTicket,
      });
      Alert.alert(
        'Not Available Yet',
        `${movie.title} releases on ${formattedReleaseDate}. Scan your ticket if you're attending an early showing.`,
        [{ text: 'OK' }]
      );
      return;
    }

    requireAuth(() => {
      setShowReviewModal(true);
    }, 'Sign in to write reviews');
  };

  const handleReviewSubmit = async (data: {
    rating: number;
    title: string;
    reviewText: string;
    isSpoiler: boolean;
    visibility: import('@/lib/database.types').ReviewVisibility;
  }) => {
    if (!movie) return;

    try {
      if (hasReview && existingReview) {
        await updateReviewAction({
          rating: data.rating,
          title: data.title,
          reviewText: data.reviewText,
          isSpoiler: data.isSpoiler,
          isRewatch: false,
          visibility: data.visibility,
        });
      } else {
        await createReviewAction({
          movieTitle: movie.title,
          posterPath: movie.poster_path,
          title: data.title,
          reviewText: data.reviewText,
          rating: data.rating,
          isSpoiler: data.isSpoiler,
          isRewatch: false,
          visibility: data.visibility,
        });
        analytics.track('movie:rate', {
          tmdb_id: movie.id,
          rating: data.rating,
          has_quote: data.reviewText.length > 0,
          is_spoiler: data.isSpoiler,
          visibility: data.visibility,
        });
      }
      setShowReviewModal(false);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save your review', visibilityTime: 3000 });
    }
  };

  const handleAddToList = () => {
    hapticImpact();
    requireAuth(() => {
      setShowAddToListModal(true);
    }, 'Sign in to save movies to lists');
  };

  const handleSaveToLists = async (selectedListIds: string[]) => {
    if (!movie) return;
    try {
      await Promise.all(
        selectedListIds.map((listId) =>
          addMovieToList(listId, movie.id, movie.title, movie.poster_path)
        )
      );
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.id] });
      Toast.show({
        type: 'success',
        text1: 'Saved to Lists',
        visibilityTime: 2000,
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save to lists', visibilityTime: 3000 });
    }
  };

  // showMoreOptionsSheet and hideMoreOptionsSheet removed - More options button hidden

  // Dynamic styles based on theme
  const insets = useSafeAreaInsets();
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
              <Ionicons name="arrow-back" size={22} color={colors.text} />
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
          <Text style={dynamicStyles.errorTitle}>Movie not found</Text>
          <Text style={dynamicStyles.errorSubtitle}>
            This movie could not be loaded. It may have been removed or the link may be incorrect.
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
        <View style={dynamicStyles.heroBanner}>
          <Image
            source={{ uri: backdropUrl || undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0, 0, 0, 0.3)', 'transparent', colors.background]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Top Buttons */}
          <View style={[dynamicStyles.topButtons, { paddingTop: Platform.OS === 'web' ? Spacing.md : insets.top + Spacing.xs }]}>
            <Pressable onPress={handleGoBack} style={dynamicStyles.iconButton}>
              <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
                <Ionicons name="arrow-back" size={22} color={colors.text} />
              </BlurView>
            </Pressable>
            {/* More options button hidden - Coming Soon */}
          </View>

          {/* Play Trailer Button */}
          {trailer && (
            <Pressable
              onPress={handlePlayTrailer}
              style={({ pressed }) => [
                dynamicStyles.playButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <BlurView intensity={10} tint={effectiveTheme} style={dynamicStyles.playButtonBlur}>
                <Ionicons name="play" size={28} color={colors.text} style={{ marginLeft: 4 }} />
              </BlurView>
            </Pressable>
          )}
        </View>

        {/* Content Container - Overlaps hero by 120px */}
        <View style={dynamicStyles.contentContainer}>
          {/* Poster + Title Section */}
          <View style={dynamicStyles.posterSection}>
            <Image
              source={{ uri: posterUrl || undefined }}
              style={dynamicStyles.posterThumb}
              contentFit="cover"
              transition={200}
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

          {/* External Ratings (IMDb, RT, Metacritic) */}
          <ExternalRatings tmdbId={movie.id} />

          {/* Friends' Ratings */}
          <FriendsRatings tmdbId={movie.id} />

          {/* Synopsis */}
          <Text style={dynamicStyles.synopsis}>{movie.overview || 'No synopsis available.'}</Text>

          {/* Crew Section */}
          {crew.length > 0 && (() => {
            const directors = crew.filter(c => c.job === 'Director');
            const writers = crew.filter(c => ['Writer', 'Screenplay', 'Story'].includes(c.job));
            const uniqueWriters = writers.filter((w, i, arr) => arr.findIndex(x => x.id === w.id) === i);
            const composers = crew.filter(c => c.job === 'Original Music Composer');

            const crewRows = [
              { label: 'Directed by', members: directors },
              { label: 'Written by', members: uniqueWriters },
              { label: 'Music by', members: composers },
            ].filter(row => row.members.length > 0);

            if (crewRows.length === 0) return null;

            return (
              <View style={dynamicStyles.crewSection}>
                {crewRows.map((row) => (
                  <View key={row.label} style={dynamicStyles.crewRow}>
                    <Text style={dynamicStyles.crewLabel}>{row.label}</Text>
                    <View style={dynamicStyles.crewNames}>
                      {row.members.map((member, index) => (
                        <React.Fragment key={member.id}>
                          {index > 0 && <Text style={dynamicStyles.crewSeparator}>, </Text>}
                          <Text
                            style={dynamicStyles.crewName}
                            onPress={() => router.push(`/person/${member.id}`)}
                          >
                            {member.name}
                          </Text>
                        </React.Fragment>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Status Actions - Want to Watch / Watching */}
          <View style={dynamicStyles.statusActionsContainer}>
            <MovieStatusActions
              currentStatus={currentStatus}
              isLoading={isSaving}
              disabled={isSaving}
              onStatusChange={handleStatusChange}
            />
          </View>

          {/* Action Grid - 4 items: Like, Lists, Review, Share */}
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
                <Svg width={24} height={24} viewBox="0 0 24 24" fill={isLiked ? colors.tint : 'none'} stroke={isLiked ? colors.tint : colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </Svg>
              )}
              <Text style={[dynamicStyles.actionLabel, isLiked && dynamicStyles.actionLabelActive]}>
                {isLiked ? 'Liked' : 'Like'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAddToList}
              style={({ pressed }) => [
                dynamicStyles.actionItem,
                pressed && dynamicStyles.actionItemPressed,
              ]}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </Svg>
              <Text style={dynamicStyles.actionLabel}>Lists</Text>
            </Pressable>
            <Pressable
              onPress={handleReview}
              disabled={isCreatingReview || isUpdatingReview}
              style={({ pressed }) => [
                dynamicStyles.actionItem,
                pressed && dynamicStyles.actionItemPressed,
              ]}
            >
              {(isCreatingReview || isUpdatingReview) ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Svg width={24} height={24} viewBox="0 0 24 24" fill={hasReview ? colors.tint : 'none'} stroke={hasReview ? colors.tint : colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </Svg>
              )}
              <Text style={[dynamicStyles.actionLabel, hasReview && dynamicStyles.actionLabelActive]}>
                {hasReview ? 'Reviewed' : 'Review'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                dynamicStyles.actionItem,
                pressed && dynamicStyles.actionItemPressed,
              ]}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <Polyline points="16 6 12 2 8 6" />
                <Line x1={12} y1={2} x2={12} y2={15} />
              </Svg>
              <Text style={dynamicStyles.actionLabel}>Share</Text>
            </Pressable>
          </View>

          {/* Community Reviews */}
          <CommunityReviews tmdbId={movie.id} />

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
                  <Pressable key={person.id} style={dynamicStyles.castCard} onPress={() => router.push(`/person/${person.id}`)}>
                    <Image
                      source={{ uri: getTMDBImageUrl(person.profile_path, 'w185') || undefined }}
                      style={dynamicStyles.castImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <Text style={dynamicStyles.castName} numberOfLines={1}>{person.name}</Text>
                    <Text style={dynamicStyles.castCharacter} numberOfLines={1}>{person.character}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Where to Watch Section */}
          {countryProviders && (countryProviders.flatrate?.length || countryProviders.rent?.length || countryProviders.buy?.length) ? (
            <>
              <Text style={dynamicStyles.sectionTitle}>Where to Watch</Text>
              {countryProviders.flatrate && countryProviders.flatrate.length > 0 && (
                <View style={dynamicStyles.providerCategory}>
                  <Text style={dynamicStyles.providerCategoryLabel}>Stream</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.providerRow}>
                    {countryProviders.flatrate.map((provider) => (
                      <Pressable
                        key={provider.provider_id}
                        onPress={() => watchLink && Linking.openURL(watchLink)}
                        style={({ pressed }) => [dynamicStyles.providerItem, pressed && { opacity: 0.7 }]}
                      >
                        <Image
                          source={{ uri: getTMDBImageUrl(provider.logo_path, 'w92') || undefined }}
                          style={dynamicStyles.providerLogo}
                          contentFit="cover"
                          transition={200}
                        />
                        <Text style={dynamicStyles.providerName} numberOfLines={1}>{provider.provider_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              {countryProviders.rent && countryProviders.rent.length > 0 && (
                <View style={dynamicStyles.providerCategory}>
                  <Text style={dynamicStyles.providerCategoryLabel}>Rent</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.providerRow}>
                    {countryProviders.rent.map((provider) => (
                      <Pressable
                        key={provider.provider_id}
                        onPress={() => watchLink && Linking.openURL(watchLink)}
                        style={({ pressed }) => [dynamicStyles.providerItem, pressed && { opacity: 0.7 }]}
                      >
                        <Image
                          source={{ uri: getTMDBImageUrl(provider.logo_path, 'w92') || undefined }}
                          style={dynamicStyles.providerLogo}
                          contentFit="cover"
                          transition={200}
                        />
                        <Text style={dynamicStyles.providerName} numberOfLines={1}>{provider.provider_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              {countryProviders.buy && countryProviders.buy.length > 0 && (
                <View style={dynamicStyles.providerCategory}>
                  <Text style={dynamicStyles.providerCategoryLabel}>Buy</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dynamicStyles.providerRow}>
                    {countryProviders.buy.map((provider) => (
                      <Pressable
                        key={provider.provider_id}
                        onPress={() => watchLink && Linking.openURL(watchLink)}
                        style={({ pressed }) => [dynamicStyles.providerItem, pressed && { opacity: 0.7 }]}
                      >
                        <Image
                          source={{ uri: getTMDBImageUrl(provider.logo_path, 'w92') || undefined }}
                          style={dynamicStyles.providerLogo}
                          contentFit="cover"
                          transition={200}
                        />
                        <Text style={dynamicStyles.providerName} numberOfLines={1}>{provider.provider_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              <Text style={dynamicStyles.justWatchAttribution}>Powered by JustWatch</Text>
            </>
          ) : (
            <>
              <Text style={dynamicStyles.sectionTitle}>Where to Watch</Text>
              <Text style={dynamicStyles.noProvidersText}>Not available for streaming in your region</Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* First Take Modal */}
      <FirstTakeModal
        visible={showFirstTakeModal}
        onClose={() => setShowFirstTakeModal(false)}
        onSubmit={handleFirstTakeSubmit}
        movieTitle={movie?.title ?? ''}
        moviePosterUrl={posterUrl ?? undefined}
        isSubmitting={isCreatingFirstTake}
      />

      {/* Review Modal */}
      <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        onSubmit={handleReviewSubmit}
        movieTitle={movie?.title ?? ''}
        moviePosterUrl={posterUrl ?? undefined}
        existingReview={existingReview ? {
          rating: existingReview.rating,
          title: existingReview.title,
          reviewText: existingReview.review_text,
          isSpoiler: existingReview.is_spoiler,
          visibility: existingReview.visibility as 'public' | 'followers_only' | 'private',
        } : null}
        isSubmitting={isCreatingReview || isUpdatingReview}
      />

      {/* Login Prompt Modal */}
      <LoginPromptModal
        visible={isLoginPromptVisible}
        onClose={hideLoginPrompt}
        message={loginPromptMessage}
      />

      {/* Trailer Modal */}
      {trailer && (
        <TrailerModal
          visible={showTrailerModal}
          onClose={() => setShowTrailerModal(false)}
          videoKey={trailer.key}
          trailerName={trailer.name}
        />
      )}

      {/* Add to List Modal */}
      <AddToListModal
        visible={showAddToListModal}
        onClose={() => setShowAddToListModal(false)}
        onSave={handleSaveToLists}
        onCreateNewList={() => setShowCreateListModal(true)}
        movie={{
          id: String(movie.id),
          title: movie.title,
          year: movieYear,
          posterUrl: getTMDBImageUrl(movie.poster_path, 'w185') ?? '',
        }}
        lists={userLists?.map((l) => ({
          id: l.id,
          name: l.name,
          icon: 'list-outline' as const,
          count: l.movie_count,
        })) ?? []}
      />

      {/* Create List Modal (from Add to List flow) */}
      <CreateListModal
        visible={showCreateListModal}
        onClose={() => setShowCreateListModal(false)}
        onCreate={async (listData) => {
          if (!user) return;
          try {
            await createList(user.id, listData.name, listData.description, listData.isPublic);
            queryClient.invalidateQueries({ queryKey: ['user-lists', user.id] });
            Toast.show({
              type: 'success',
              text1: 'List Created',
              visibilityTime: 2000,
            });
            // Re-open the add-to-list modal so user can select the new list
            setShowAddToListModal(true);
          } catch {
            Toast.show({ type: 'error', text1: 'Failed to create list', visibilityTime: 3000 });
          }
        }}
      />

      {/* Confirmation Dialog (cross-platform replacement for Alert.alert) */}
      <ConfirmationModal
        visible={!!confirmation}
        onClose={() => setConfirmation(null)}
        title={confirmation?.title ?? ''}
        message={confirmation?.message ?? ''}
        confirmLabel={confirmation?.confirmLabel ?? ''}
        onConfirm={confirmation?.onConfirm ?? (() => {})}
        destructive={confirmation?.destructive}
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
    paddingTop: 60, // Fallback, overridden inline with safe area insets
    zIndex: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: BorderRadius.full,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
    ...(Platform.OS === 'android' ? { backgroundColor: 'rgba(0, 0, 0, 0.55)' } : {}),
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
    ...(Platform.OS === 'android' ? { elevation: 6 } : {}),
  },
  playButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
    ...(Platform.OS === 'android' ? { backgroundColor: 'rgba(0, 0, 0, 0.55)' } : {}),
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

  // Crew
  crewSection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  crewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  crewLabel: {
    ...Typography.body.sm,
    color: colors.textSecondary,
    width: 90,
    flexShrink: 0,
  },
  crewNames: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  crewName: {
    ...Typography.body.smMedium,
    color: colors.text,
  },
  crewSeparator: {
    ...Typography.body.sm,
    color: colors.textSecondary,
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

  // Watch Providers
  providerCategory: {
    marginTop: Spacing.sm,
  },
  providerCategoryLabel: {
    ...Typography.body.smMedium,
    color: colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  providerRow: {
    gap: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  providerItem: {
    alignItems: 'center',
    width: 64,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: colors.card,
    marginBottom: 4,
  },
  providerName: {
    ...Typography.caption.default,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 10,
  },
  justWatchAttribution: {
    ...Typography.caption.default,
    color: colors.textTertiary,
    marginTop: Spacing.sm,
    fontSize: 11,
  },
  noProvidersText: {
    ...Typography.body.sm,
    color: colors.textSecondary,
    marginTop: Spacing.xs,
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
