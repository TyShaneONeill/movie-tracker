/**
 * TV Show Detail Screen
 * Mirrors app/movie/[id].tsx but adapted for TV-specific data.
 *
 * Features:
 * - Hero banner with backdrop image and gradient overlay
 * - Glassmorphism back button
 * - Centered play trailer button
 * - Content overlaps hero by 120px
 * - Poster thumbnail + title/year range/seasons/episodes + rating/tags
 * - Show status badge (Returning Series, Ended, Canceled)
 * - Networks display
 * - Created by / Music by crew rows
 * - Primary status buttons: Watchlist, Watching, Watched, On Hold, Dropped
 * - 4-column action grid (Like, Lists, Review (Coming Soon), Share (Coming Soon))
 * - Seasons & Episodes accordion with per-episode tracking
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
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import * as Localization from 'expo-localization';
import Toast from 'react-native-toast-message';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useQueryClient } from '@tanstack/react-query';
import { FirstTakeModal } from '@/components/first-take-modal';
import { TvShowStatusActions } from '@/components/tv-show-status-actions';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { TrailerModal } from '@/components/modals/trailer-modal';
import { AddToListModal } from '@/components/modals/add-to-list-modal';
import { CreateListModal } from '@/components/modals/create-list-modal';
import { useTvShowDetail } from '@/hooks/use-tv-show-detail';
import { useTvShowActions } from '@/hooks/use-tv-show-actions';
import { useSeasonEpisodes } from '@/hooks/use-season-episodes';
import { useEpisodeActions } from '@/hooks/use-episode-actions';
import { useFirstTakeActions } from '@/hooks/use-first-take-actions';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useUserLists } from '@/hooks/use-user-lists';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/lib/theme-context';
import { addMovieToList, createList } from '@/lib/list-service';
import { addTvShowToLibrary, batchMarkEpisodesWatched, updateTvShowStatus } from '@/lib/tv-show-service';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import type { TMDBTvShow, TMDBWatchProviders, TMDBSeason, TMDBEpisode } from '@/lib/tmdb.types';
import type { TvShowStatus } from '@/lib/database.types';
import { TvWatchedSelectionModal } from '@/components/tv/tv-watched-selection-modal';
import type { WatchedSelectionResult } from '@/components/tv/tv-watched-selection-modal';
import { analytics } from '@/lib/analytics';

// Helper to get status badge color
function getStatusColor(status: string): string {
  switch (status) {
    case 'Returning Series':
      return '#4CAF50';
    case 'Ended':
      return '#9E9E9E';
    case 'Canceled':
      return '#F44336';
    default:
      return '#757575';
  }
}

// Season Accordion Item - separate component so it can call hooks
function SeasonAccordionItem({
  season,
  showId,
  userTvShowId,
  isExpanded,
  onToggle,
  isSaved,
  onAllWatched,
  onAllUnwatched,
}: {
  season: TMDBSeason;
  showId: number;
  userTvShowId: string;
  isExpanded: boolean;
  onToggle: () => void;
  isSaved: boolean;
  onAllWatched?: () => void;
  onAllUnwatched?: () => void;
}) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  const { episodes, isLoading: isLoadingEpisodes } = useSeasonEpisodes({
    showId,
    seasonNumber: season.season_number,
    enabled: isExpanded,
  });

  const {
    isEpisodeWatched,
    markWatched,
    unmarkWatched,
    markAllWatched,
    isMarkingAllWatched,
    unmarkAllWatched,
    isUnmarkingAllWatched,
    allWatched,
  } = useEpisodeActions(userTvShowId, showId, season.season_number, { onAllWatched, onAllUnwatched });

  const isAllWatched = allWatched(episodes.length);

  const seasonYear = season.air_date?.split('-')[0] ?? '';
  const posterUrl = getTMDBImageUrl(season.poster_path, 'w185');

  const handleToggleEpisode = async (episode: TMDBEpisode) => {
    if (!isSaved || !userTvShowId) return;
    if (isEpisodeWatched(episode.episode_number)) {
      await unmarkWatched(episode.episode_number);
    } else {
      await markWatched(episode);
    }
  };

  return (
    <View style={dynamicStyles.seasonItem}>
      {/* Collapsed header - always visible */}
      <Pressable onPress={onToggle} style={dynamicStyles.seasonHeader}>
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={dynamicStyles.seasonPoster} contentFit="cover" transition={200} />
        ) : (
          <View style={[dynamicStyles.seasonPoster, dynamicStyles.seasonPosterPlaceholder]} />
        )}
        <View style={dynamicStyles.seasonInfo}>
          <Text style={dynamicStyles.seasonName}>{season.name}</Text>
          <Text style={dynamicStyles.seasonMeta}>
            {season.episode_count} Episodes{seasonYear ? ` \u00B7 ${seasonYear}` : ''}
          </Text>
        </View>
        <Text style={dynamicStyles.chevron}>{isExpanded ? '\u25B2' : '\u25BC'}</Text>
      </Pressable>

      {/* Expanded content - episodes list */}
      {isExpanded && (
        <View style={dynamicStyles.episodesContainer}>
          {isLoadingEpisodes ? (
            <ActivityIndicator size="small" color={colors.tint} style={{ padding: Spacing.md }} />
          ) : (
            <>
              {/* Mark All Watched button - only if show is in library */}
              {isSaved && userTvShowId && episodes.length > 0 && (
                <Pressable
                  onPress={() => isAllWatched ? unmarkAllWatched() : markAllWatched(episodes)}
                  disabled={isMarkingAllWatched || isUnmarkingAllWatched}
                  style={({ pressed }) => [
                    dynamicStyles.markAllButton,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {(isMarkingAllWatched || isUnmarkingAllWatched) ? (
                    <ActivityIndicator size="small" color={colors.tint} />
                  ) : (
                    <Text style={dynamicStyles.markAllText}>
                      {isAllWatched ? 'Unmark All Watched' : 'Mark All Watched'}
                    </Text>
                  )}
                </Pressable>
              )}
              {episodes.map((episode) => {
                const watched = isSaved && userTvShowId ? isEpisodeWatched(episode.episode_number) : false;
                return (
                  <Pressable
                    key={episode.id}
                    onPress={() => handleToggleEpisode(episode)}
                    disabled={!isSaved || !userTvShowId}
                    style={dynamicStyles.episodeRow}
                  >
                    <View style={[
                      dynamicStyles.episodeCheckbox,
                      watched && dynamicStyles.episodeCheckboxChecked,
                      (!isSaved || !userTvShowId) && { opacity: 0.3 },
                    ]}>
                      {watched && <Text style={dynamicStyles.checkmark}>{'\u2713'}</Text>}
                    </View>
                    <Text style={dynamicStyles.episodeNumber}>E{episode.episode_number}</Text>
                    <Text style={dynamicStyles.episodeName} numberOfLines={1}>{episode.name}</Text>
                    {episode.runtime && (
                      <Text style={dynamicStyles.episodeRuntime}>{episode.runtime}m</Text>
                    )}
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function TvShowDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Support slug-format URLs like "breaking-bad-1396" (title-slug + TMDB ID).
  // Extract the numeric TMDB ID from the trailing segment after the last "-".
  const rawId = id ?? '';
  const tmdbId = rawId.includes('-') ? (rawId.split('-').pop() ?? rawId) : rawId;
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: userLists } = useUserLists();

  // Modal state
  const [showFirstTakeModal, setShowFirstTakeModal] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [watchedModalVisible, setWatchedModalVisible] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);

  // Fetch TV show details using the hook
  const { show, cast, crew, trailer, watchProviders, seasons, recommendations, isLoading, isError, error } = useTvShowDetail({
    showId: tmdbId,
    enabled: !!tmdbId,
  });

  // TV show actions hook for save/like functionality
  const {
    userTvShow,
    isSaved,
    currentStatus,
    isLiked,
    isSaving,
    isTogglingLike,
    addToLibrary,
    removeFromLibrary,
    changeStatus,
    toggleLike,
  } = useTvShowActions(Number(tmdbId) || 0);

  // First Take actions hook
  const {
    hasFirstTake,
    isCreating: isCreatingFirstTake,
    createTake,
    deleteTake,
  } = useFirstTakeActions(Number(tmdbId) || 0, 'tv_show');

  // User preferences hook (for First Take prompt setting)
  const { preferences } = useUserPreferences();
  // Default to true if preference is undefined (backwards compatibility)
  const firstTakePromptEnabled = preferences?.firstTakePromptEnabled ?? true;

  // Derive display data from fetched show
  const startYear = show?.first_air_date?.split('-')[0] ?? 'N/A';
  const endYear = show?.last_air_date?.split('-')[0] ?? '';
  const yearDisplay = show?.in_production
    ? `${startYear}\u2013Present`
    : (endYear && endYear !== startYear)
      ? `${startYear}\u2013${endYear}`
      : startYear;

  const showRating = show?.vote_average ? show.vote_average.toFixed(1) : 'N/A';
  const showGenres = show?.genres?.map(g => g.name) ?? [];
  const backdropUrl = getTMDBImageUrl(show?.backdrop_path ?? null, 'original');
  const posterUrl = getTMDBImageUrl(show?.poster_path ?? null, 'w342');

  // Track TV show detail view
  const hasTrackedView = useRef(false);
  useEffect(() => {
    if (show && !hasTrackedView.current) {
      hasTrackedView.current = true;
      analytics.track('tv:view', { tmdb_id: show.id, name: show.name });
    }
  }, [show]);

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

  const handleAddToList = () => {
    hapticImpact();
    requireAuth(() => {
      setShowAddToListModal(true);
    }, 'Sign in to save TV shows to lists');
  };

  const handleSaveToLists = async (selectedListIds: string[]) => {
    if (!show) return;
    try {
      await Promise.all(
        selectedListIds.map((listId) =>
          addMovieToList(listId, show.id, show.name, show.poster_path, undefined, 'tv_show')
        )
      );
      queryClient.invalidateQueries({ queryKey: ['user-lists', user?.id] });
      Toast.show({
        type: 'success',
        text1: 'Saved to Lists',
        visibilityTime: 2000,
      });
    } catch {
      Alert.alert('Error', 'Failed to save TV show to lists. Please try again.');
    }
  };

  // Convert show detail to TMDBTvShow format for saving
  const getShowForSave = (): TMDBTvShow | null => {
    if (!show) return null;
    return {
      id: show.id,
      name: show.name,
      overview: show.overview,
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      first_air_date: show.first_air_date,
      vote_average: show.vote_average,
      vote_count: show.vote_count,
      genre_ids: show.genre_ids,
      origin_country: show.origin_country,
      original_language: show.original_language,
      popularity: 0,
    };
  };

  const handleLike = async () => {
    hapticImpact();
    requireAuth(async () => {
      const showData = getShowForSave();
      if (showData) {
        try {
          await toggleLike(showData);
        } catch {
          Alert.alert('Error', 'Failed to update like status. Please try again.');
        }
      }
    }, 'Sign in to like TV shows');
  };

  // Helper function to perform the actual removal
  const performRemoval = async () => {
    hapticImpact();
    try {
      if (hasFirstTake) {
        await deleteTake();
      }
      await removeFromLibrary();
      Toast.show({
        type: 'success',
        text1: 'Removed from Library',
        visibilityTime: 2000,
      });
    } catch {
      Alert.alert('Error', 'Failed to remove show. Please try again.');
    }
  };

  // Batched confirm handler for the TV Watched Selection Modal
  const handleWatchedConfirm = async (result: WatchedSelectionResult) => {
    if (!user || !show || isConfirming) return;
    const showData = getShowForSave();
    if (!showData) return;

    setIsConfirming(true);
    try {
      // Step 1: Get or create the user TV show record
      let tvShowId: string;
      if (isSaved && userTvShow && userTvShow.id !== 'optimistic') {
        tvShowId = userTvShow.id;
      } else {
        // Upsert to library (safe even if already exists due to onConflict)
        const created = await addTvShowToLibrary(user.id, showData, 'watching');
        tvShowId = created.id;
        queryClient.setQueryData(['userTvShow', user.id, show.id], created);
      }

      // Step 2: Batch mark all selected episodes in one call.
      // batchMarkEpisodesWatched uses INSERT ON CONFLICT DO NOTHING (no column spec)
      // which handles the partial unique index on user_episode_watches correctly.
      // Deduplicate by (season_number, episode_number) — prevents within-batch duplicate key
      // errors if the same episode somehow appears in both fullySelectedSeasons and partialSeasons.
      const seen = new Set<string>();
      const allEpisodes = [
        ...result.fullySelectedSeasons.flatMap(({ episodes }) => episodes),
        ...result.partialSeasons.flatMap(({ episodes }) => episodes),
      ].filter((ep) => {
        const key = `${ep.season_number}:${ep.episode_number}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      await batchMarkEpisodesWatched(user.id, tvShowId, show.id, allEpisodes);

      // Close modal immediately — don't make user wait for status write
      setWatchedModalVisible(false);

      // Step 3: Set final status
      const finalStatus: TvShowStatus = result.isComplete ? 'watched' : 'watching';
      await updateTvShowStatus(user.id, show.id, finalStatus);

      // Write correct values to cache immediately so stale reads can't re-trigger the modal
      queryClient.setQueryData(['userTvShow', user.id, show.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          status: finalStatus,
          episodes_watched: result.isComplete
            ? (show.number_of_episodes ?? old.episodes_watched)
            : old.episodes_watched + result.totalEpisodesSelected,
        };
      });

      // Step 4: Invalidate relevant queries for eventual consistency
      queryClient.invalidateQueries({ queryKey: ['episodeWatches', user.id] });
      queryClient.invalidateQueries({ queryKey: ['userTvShow', user.id, show.id] });
      queryClient.invalidateQueries({ queryKey: ['userTvShows'] });

      // Step 5: Optionally prompt for First Take
      if (result.isComplete && !hasFirstTake && firstTakePromptEnabled) {
        setShowFirstTakeModal(true);
      }

      Toast.show({
        type: 'success',
        text1: result.isComplete ? 'Marked as Watched' : 'Now Watching',
        visibilityTime: 2000,
      });
      hapticNotification(NotificationFeedbackType.Success);
    } catch (err) {
      console.error('TV batch watched confirm error:', err);
      Alert.alert('Error', 'Failed to save your episode progress. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleStatusChange = async (status: TvShowStatus | null) => {
    if (isSaving || isConfirming) return;
    hapticImpact();
    requireAuth(async () => {
      const showData = getShowForSave();
      if (!showData) return;

      // Intercept "Watched" when not all episodes are tracked — show selection modal
      const episodesWatched = userTvShow?.episodes_watched ?? 0;
      const totalEpisodes = show?.number_of_episodes ?? 0;
      if (status === 'watched' && totalEpisodes > 0 && episodesWatched < totalEpisodes) {
        setWatchedModalVisible(true);
        return;
      }

      // Track if we're changing TO watched status (for First Take prompt)
      const isChangingToWatched = status === 'watched' && currentStatus !== 'watched';

      try {
        if (status === null) {
          // Remove from library - show confirmation if user has First Take
          if (hasFirstTake) {
            Alert.alert(
              'Remove Watched status?',
              'This will affect your viewing statistics, watch time totals, and any achievements earned for completing this series. Your episode history will be preserved.\n\nAny First Takes you\'ve written will also be removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: performRemoval },
              ]
            );
            return;
          }
          await removeFromLibrary();
          Toast.show({
            type: 'success',
            text1: 'Removed from Library',
            visibilityTime: 2000,
          });
        } else if (isSaved) {
          // Show already in library, change status
          await changeStatus(status);
          const toastMessage = status === 'watchlist' ? 'Added to Watchlist' :
                               status === 'watching' ? 'Now Watching' :
                               status === 'watched' ? 'Marked as Watched' :
                               status === 'on_hold' ? 'Put On Hold' : 'Dropped';
          Toast.show({
            type: 'success',
            text1: toastMessage,
            visibilityTime: 2000,
          });
        } else {
          // Add to library with selected status
          await addToLibrary(showData, status);
          const toastMessage = status === 'watchlist' ? 'Added to Watchlist' :
                               status === 'watching' ? 'Now Watching' :
                               status === 'watched' ? 'Marked as Watched' :
                               status === 'on_hold' ? 'Put On Hold' : 'Dropped';
          Toast.show({
            type: 'success',
            text1: toastMessage,
            visibilityTime: 2000,
          });
        }

        // After successful status change to "watched", prompt for First Take
        // Only if user doesn't already have a First Take and preference is enabled
        if (isChangingToWatched && !hasFirstTake && firstTakePromptEnabled) {
          setShowFirstTakeModal(true);
        }

        // Success haptic after action completes
        hapticNotification(NotificationFeedbackType.Success);
      } catch (err) {
        console.error('TV show status error:', err);
        Alert.alert('Error', 'Failed to update show status. Please try again.');
      }
    }, 'Sign in to track TV shows');
  };

  const handleAutoPromoteWatched = () => {
    if (currentStatus !== 'watched') {
      changeStatus('watched');
    }
  };

  const handleAutoDemoteWatching = () => {
    if (isSaved && currentStatus === 'watched') {
      changeStatus('watching');
    }
  };

  const handleFirstTakeSubmit = async (data: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
  }) => {
    if (!show) return;

    try {
      await createTake({
        movieTitle: show.name,
        posterPath: show.poster_path,
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

  // Dynamic styles based on theme
  const insets = useSafeAreaInsets();
  const dynamicStyles = useMemo(() => createStyles(colors), [colors]);

  // Show loading state
  if (isLoading) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={dynamicStyles.loadingText}>Loading show details...</Text>
        </View>
        {/* Back button even during loading */}
        <View style={dynamicStyles.loadingBackButton}>
          <Pressable onPress={handleGoBack} accessibilityRole="button" accessibilityLabel="Go back" style={dynamicStyles.iconButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
              <Text style={dynamicStyles.backIcon}>{'\u2190'}</Text>
            </BlurView>
          </Pressable>
        </View>
      </View>
    );
  }

  // Show error state
  if (isError || !show) {
    return (
      <View style={dynamicStyles.container}>
        <View style={dynamicStyles.errorContainer}>
          <Text style={dynamicStyles.errorTitle}>Show not found</Text>
          <Text style={dynamicStyles.errorSubtitle}>
            This TV show could not be loaded. It may have been removed or the link may be incorrect.
          </Text>
          <Pressable onPress={handleGoBack} style={dynamicStyles.errorBackButton}>
            <Text style={dynamicStyles.errorBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Build crew rows for TV (Created by + Music by)
  const composers = crew.filter(c => c.job === 'Original Music Composer');
  const crewRows = [
    { label: 'Created by', members: show.created_by?.map(c => ({ id: c.id, name: c.name })) ?? [] },
    { label: 'Music by', members: composers },
  ].filter(row => row.members.length > 0);

  // Metadata string: "2020-2024 . 3 Seasons . 36 Episodes"
  const seasonsCount = show.number_of_seasons;
  const episodesCount = show.number_of_episodes;
  const metadataParts = [yearDisplay];
  if (seasonsCount) {
    metadataParts.push(`${seasonsCount} Season${seasonsCount !== 1 ? 's' : ''}`);
  }
  if (episodesCount) {
    metadataParts.push(`${episodesCount} Episode${episodesCount !== 1 ? 's' : ''}`);
  }
  const metadataText = metadataParts.join(' \u2022 ');

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
            <Pressable onPress={handleGoBack} accessibilityRole="button" accessibilityLabel="Go back" style={dynamicStyles.iconButton}>
              <BlurView intensity={20} tint={effectiveTheme} style={dynamicStyles.blurContainer}>
                <Text style={dynamicStyles.backIcon}>{'\u2190'}</Text>
              </BlurView>
            </Pressable>
            {/* More options button hidden - Coming Soon */}
          </View>

          {/* Play Trailer Button */}
          {trailer && (
            <Pressable
              onPress={handlePlayTrailer}
              accessibilityRole="button"
              accessibilityLabel="Play trailer"
              style={({ pressed }) => [
                dynamicStyles.playButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <BlurView intensity={10} tint={effectiveTheme} style={dynamicStyles.playButtonBlur}>
                <Text style={dynamicStyles.playIcon}>{'\u25B6'}</Text>
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
              <Text style={dynamicStyles.title}>{show.name}</Text>
              {/* Status Badge */}
              {show.status && (
                <Text style={[dynamicStyles.showStatusBadge, { color: getStatusColor(show.status) }]}>
                  {show.status}
                </Text>
              )}
              <Text style={dynamicStyles.metadata}>{metadataText}</Text>
              {/* Networks */}
              {show.networks?.length > 0 && (
                <Text style={dynamicStyles.networksText}>
                  {show.networks.map(n => n.name).join(' \u00B7 ')}
                </Text>
              )}
              <View style={dynamicStyles.ratingTags}>
                <Text style={dynamicStyles.rating}>{'\u2605'} {showRating}</Text>
                {showGenres.slice(0, 3).map((genre, index) => (
                  <View key={index} style={dynamicStyles.tag}>
                    <Text style={dynamicStyles.tagText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Synopsis */}
          <Text style={dynamicStyles.synopsis}>{show.overview || 'No synopsis available.'}</Text>

          {/* Crew Section */}
          {crewRows.length > 0 && (
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
          )}

          {/* Status Actions - Watchlist / Watching / Watched / On Hold / Dropped */}
          <View style={dynamicStyles.statusActionsContainer}>
            <TvShowStatusActions
              currentStatus={currentStatus}
              isLoading={isSaving || isConfirming}
              disabled={isSaving || isConfirming}
              onStatusChange={handleStatusChange}
            />
          </View>

          {/* Action Grid - 4 items: Like, Lists, Review (Coming Soon), Share (Coming Soon) */}
          <View style={dynamicStyles.actionGrid}>
            <Pressable
              onPress={handleLike}
              disabled={isTogglingLike}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Unlike this show' : 'Like this show'}
              accessibilityState={{ selected: isLiked }}
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
              accessibilityRole="button"
              accessibilityLabel="Add to list"
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
            <View style={dynamicStyles.actionItemDisabled}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </Svg>
              <Text style={dynamicStyles.actionLabelDisabled}>Review</Text>
              <Text style={dynamicStyles.comingSoonText}>Soon</Text>
            </View>
            <View style={dynamicStyles.actionItemDisabled}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <Polyline points="16 6 12 2 8 6" />
                <Line x1={12} y1={2} x2={12} y2={15} />
              </Svg>
              <Text style={dynamicStyles.actionLabelDisabled}>Share</Text>
              <Text style={dynamicStyles.comingSoonText}>Soon</Text>
            </View>
          </View>

          {/* Seasons & Episodes */}
          {seasons.length > 0 && (
            <>
              <Text style={dynamicStyles.sectionTitle}>Seasons & Episodes</Text>
              {/* Regular seasons first (filter out season 0), then specials at bottom */}
              {seasons
                .filter(s => s.season_number > 0)
                .map((season) => (
                  <SeasonAccordionItem
                    key={season.id}
                    season={season}
                    showId={Number(tmdbId)}
                    userTvShowId={userTvShow?.id ?? ''}
                    isExpanded={expandedSeason === season.season_number}
                    onToggle={() => setExpandedSeason(
                      expandedSeason === season.season_number ? null : season.season_number
                    )}
                    isSaved={isSaved}
                    onAllWatched={handleAutoPromoteWatched}
                    onAllUnwatched={handleAutoDemoteWatching}
                  />
                ))}
              {/* Specials season at the bottom if it exists */}
              {seasons.filter(s => s.season_number === 0).map((season) => (
                <SeasonAccordionItem
                  key={season.id}
                  season={season}
                  showId={Number(tmdbId)}
                  userTvShowId={userTvShow?.id ?? ''}
                  isExpanded={expandedSeason === season.season_number}
                  onToggle={() => setExpandedSeason(
                    expandedSeason === season.season_number ? null : season.season_number
                  )}
                  isSaved={isSaved}
                  onAllWatched={handleAutoPromoteWatched}
                  onAllUnwatched={handleAutoDemoteWatching}
                />
              ))}
            </>
          )}

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
                  <Pressable key={person.id} style={dynamicStyles.castCard} onPress={() => router.push(`/person/${person.id}`)} accessibilityRole="button" accessibilityLabel={`${person.name} as ${person.character}`}>
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

          {/* You Might Also Like Section */}
          {recommendations.length > 0 && (
            <>
              <Text style={dynamicStyles.sectionTitle}>You Might Also Like</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={dynamicStyles.recsScrollContent}
                style={dynamicStyles.recsScroll}
              >
                {recommendations.map((rec) => {
                  const recPosterUrl = getTMDBImageUrl(rec.poster_path, 'w185');
                  return (
                    <Pressable
                      key={rec.id}
                      onPress={() => router.push(`/tv/${rec.id}`)}
                      style={({ pressed }) => [
                        dynamicStyles.recCard,
                        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                      ]}
                    >
                      {recPosterUrl ? (
                        <Image
                          source={{ uri: recPosterUrl }}
                          style={dynamicStyles.recPoster}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={[dynamicStyles.recPoster, dynamicStyles.recPosterPlaceholder]} />
                      )}
                      <Text style={dynamicStyles.recName} numberOfLines={1}>{rec.name}</Text>
                      {rec.vote_average > 0 && (
                        <Text style={dynamicStyles.recRating}>
                          {'\u2605'} {rec.vote_average.toFixed(1)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>

      {/* First Take Modal */}
      <FirstTakeModal
        visible={showFirstTakeModal}
        onClose={() => setShowFirstTakeModal(false)}
        onSubmit={handleFirstTakeSubmit}
        movieTitle={show?.name ?? ''}
        moviePosterUrl={posterUrl ?? undefined}
        isSubmitting={isCreatingFirstTake}
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
          id: String(show?.id ?? ''),
          title: show?.name ?? '',
          year: startYear,
          posterUrl: getTMDBImageUrl(show?.poster_path ?? null, 'w185') ?? '',
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
            Alert.alert('Error', 'Failed to create list. Please try again.');
          }
        }}
      />

      {/* TV Watched Selection Modal */}
      {show && (
        <TvWatchedSelectionModal
          visible={watchedModalVisible}
          show={{
            id: userTvShow?.id ?? '',
            tmdbId: show.id,
            name: show.name,
            numberOfSeasons: show.number_of_seasons ?? 0,
            numberOfEpisodes: show.number_of_episodes ?? 0,
            episodesWatched: userTvShow?.episodes_watched ?? 0,
          }}
          onClose={() => setWatchedModalVisible(false)}
          onConfirm={handleWatchedConfirm}
        />
      )}
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
  // Show status badge
  showStatusBadge: {
    ...Typography.caption.default,
    fontWeight: '600',
    marginBottom: 2,
  },
  metadata: {
    ...Typography.body.sm,
    color: colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  // Networks
  networksText: {
    ...Typography.caption.default,
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

  // Recommendations
  recsScroll: {
    marginHorizontal: -Spacing.md,
  },
  recsScrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  recCard: {
    width: 130,
    alignItems: 'center',
  },
  recPoster: {
    width: 130,
    aspectRatio: 2 / 3,
    borderRadius: BorderRadius.md,
    backgroundColor: colors.card,
    marginBottom: Spacing.xs,
  },
  recPosterPlaceholder: {
    backgroundColor: colors.border,
  },
  recName: {
    ...Typography.body.sm,
    color: colors.text,
    textAlign: 'center',
    width: 130,
  },
  recRating: {
    ...Typography.caption.default,
    color: colors.gold,
    marginTop: 2,
  },

  // Seasons & Episodes
  seasonItem: {
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: colors.card,
    gap: Spacing.sm,
  },
  seasonPoster: {
    width: 50,
    height: 75,
    borderRadius: BorderRadius.sm,
  },
  seasonPosterPlaceholder: {
    backgroundColor: colors.border,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonName: {
    ...Typography.body.smMedium,
    color: colors.text,
  },
  seasonMeta: {
    ...Typography.caption.default,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  episodesContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  markAllButton: {
    padding: Spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  markAllText: {
    ...Typography.body.smMedium,
    color: colors.tint,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  episodeCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeCheckboxChecked: {
    backgroundColor: colors.accentSecondary,
    borderColor: colors.accentSecondary,
  },
  checkmark: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  episodeNumber: {
    ...Typography.body.sm,
    color: colors.textSecondary,
    width: 28,
  },
  episodeName: {
    ...Typography.body.sm,
    color: colors.text,
    flex: 1,
  },
  episodeRuntime: {
    ...Typography.caption.default,
    color: colors.textSecondary,
  },

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
