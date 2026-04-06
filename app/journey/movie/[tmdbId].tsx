/**
 * Journey Carousel Screen
 * Displays all journeys (rewatches) for a specific movie in a horizontal carousel.
 *
 * Features:
 * - Horizontal swipeable carousel of journey tickets
 * - "Journey X of Y" indicator
 * - "Add New Journey" card at the end for rewatches
 * - Dot pagination indicators
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  ViewToken,
  LayoutChangeEvent,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { useJourneysByMovie, useJourneyMutations } from '@/hooks/use-journey';
import { useGenerateArt } from '@/hooks/use-generate-art';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { getGenreNamesByIds } from '@/lib/genre-service';
import { TicketFlipCard } from '@/components/journey/ticket-flip-card';
import { PerforatedEdge } from '@/components/ui/perforated-edge';
import { PosterInspectionModal } from '@/components/poster-inspection';
import { LoginPromptModal } from '@/components/modals/login-prompt-modal';
import { hapticImpact, ImpactFeedbackStyle } from '@/lib/haptics';
import type { UserMovie, FirstTake } from '@/lib/database.types';

// Type for the colors object
type ThemeColors = typeof Colors.dark;

// Helper to get location type badge text
function getLocationBadgeText(locationType: string | null): string {
  switch (locationType?.toLowerCase()) {
    case 'theater':
      return 'THEATRICAL RUN';
    case 'home':
      return 'HOME VIEWING';
    case 'airplane':
      return 'IN-FLIGHT';
    case 'outdoor':
      return 'OUTDOOR CINEMA';
    default:
      return 'VIEWING';
  }
}

// Poster Toggle Component
interface PosterToggleProps {
  isAiSelected: boolean;
  isHolographic: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  isDark: boolean;
}

function PosterToggle({ isAiSelected, isHolographic, onToggle, colors, isDark }: PosterToggleProps) {
  return (
    <View style={posterToggleStyles(colors, isDark).container}>
      <Pressable
        style={[
          posterToggleStyles(colors, isDark).option,
          !isAiSelected && posterToggleStyles(colors, isDark).optionSelected,
        ]}
        onPress={() => isAiSelected && onToggle()}
      >
        <View style={posterToggleStyles(colors, isDark).radioOuter}>
          {!isAiSelected && <View style={posterToggleStyles(colors, isDark).radioInner} />}
        </View>
        <Text style={[
          posterToggleStyles(colors, isDark).optionText,
          !isAiSelected && posterToggleStyles(colors, isDark).optionTextSelected,
        ]}>
          Original
        </Text>
      </Pressable>

      <Pressable
        style={[
          posterToggleStyles(colors, isDark).option,
          isAiSelected && posterToggleStyles(colors, isDark).optionSelected,
        ]}
        onPress={() => !isAiSelected && onToggle()}
      >
        <View style={posterToggleStyles(colors, isDark).radioOuter}>
          {isAiSelected && <View style={[
            posterToggleStyles(colors, isDark).radioInner,
            isHolographic && posterToggleStyles(colors, isDark).radioInnerHolo,
          ]} />}
        </View>
        <Text style={[
          posterToggleStyles(colors, isDark).optionText,
          isAiSelected && posterToggleStyles(colors, isDark).optionTextSelected,
        ]}>
          AI Art
        </Text>
        {isHolographic && (
          <Text style={posterToggleStyles(colors, isDark).holoBadge}>✨</Text>
        )}
      </Pressable>
    </View>
  );
}

const posterToggleStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: BorderRadius.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: 6,
  },
  optionSelected: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tint,
  },
  radioInnerHolo: {
    backgroundColor: '#FFD700',
  },
  optionText: {
    ...Typography.caption.medium,
    color: colors.textSecondary,
  },
  optionTextSelected: {
    color: colors.text,
  },
  holoBadge: {
    fontSize: 12,
    marginLeft: 2,
  },
});

// Single Journey Ticket Card Component
interface JourneyTicketProps {
  journey: UserMovie;
  firstTake: FirstTake | null;
  colors: ThemeColors;
  effectiveTheme: 'light' | 'dark';
  ticketHeight: number;
  ticketWidth: number;
  infoPageWidth: number;
  onGenerateArt: () => void;
  onTogglePoster: () => void;
  isGenerating: boolean;
  onPosterTap: () => void;
}

function JourneyTicket({
  journey,
  firstTake,
  colors,
  effectiveTheme,
  ticketHeight,
  ticketWidth,
  infoPageWidth,
  onGenerateArt,
  onTogglePoster,
  isGenerating,
  onPosterTap,
}: JourneyTicketProps) {
  const showAiPoster = journey.display_poster === 'ai_generated' && journey.ai_poster_url;
  const hasAiPoster = !!journey.ai_poster_url;
  const isHolographic = journey.ai_poster_rarity === 'holographic';
  const blurPosterUrl = getTMDBImageUrl(journey.poster_path ?? null, 'w500');

  // Build hero photo carousel: TMDB poster first, then ticket stubs, then AI art
  const heroPhotos = useMemo(() => {
    const photos: string[] = [];
    const tmdbUrl = getTMDBImageUrl(journey.poster_path ?? null, 'w780');
    if (tmdbUrl) photos.push(tmdbUrl);
    if (journey.journey_photos?.length) photos.push(...(journey.journey_photos as string[]));
    if (journey.ai_poster_url) photos.push(journey.ai_poster_url);
    return photos;
  }, [journey]);

  const [activeHeroPage, setActiveHeroPage] = useState(0);
  const heroScrollRef = useRef<ScrollView>(null);

  const handleHeroPrev = useCallback(() => {
    if (activeHeroPage > 0) {
      const newPage = activeHeroPage - 1;
      heroScrollRef.current?.scrollTo({ x: newPage * ticketWidth, animated: true });
      setActiveHeroPage(newPage);
    }
  }, [activeHeroPage, ticketWidth]);

  const handleHeroNext = useCallback(() => {
    if (activeHeroPage < heroPhotos.length - 1) {
      const newPage = activeHeroPage + 1;
      heroScrollRef.current?.scrollTo({ x: newPage * ticketWidth, animated: true });
      setActiveHeroPage(newPage);
    }
  }, [activeHeroPage, heroPhotos.length, ticketWidth]);

  const isDark = effectiveTheme === 'dark';
  const styles = useMemo(() => createTicketStyles(colors, ticketHeight, ticketWidth, infoPageWidth, isDark), [colors, ticketHeight, ticketWidth, infoPageWidth, isDark]);

  const router = useRouter();

  return (
    <View style={styles.ticketCard}>
      {/* Hero Image Area — top 50% */}
      <View style={styles.heroSection}>
        {heroPhotos.length > 1 ? (
          <ScrollView
            ref={heroScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              const x = event.nativeEvent.contentOffset.x;
              const page = Math.round(x / ticketWidth);
              setActiveHeroPage(Math.max(0, Math.min(page, heroPhotos.length - 1)));
            }}
            style={StyleSheet.absoluteFill}
          >
            {heroPhotos.map((photoUri, index) => {
              const isTicketPhoto = photoUri.includes('/ticket-photos/');
              return (
                <Pressable
                  key={index}
                  onPress={onPosterTap}
                  style={[{ width: ticketWidth, height: '100%' as any }, isTicketPhoto && { backgroundColor: '#0a0a0a' }]}
                >
                  <Image
                    source={{ uri: photoUri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode={isTicketPhoto ? 'contain' : 'cover'}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <>
            <Image
              source={{ uri: heroPhotos[0] || undefined }}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Poster tap overlay — single photo only */}
            <Pressable onPress={onPosterTap} style={StyleSheet.absoluteFill} />
          </>
        )}
        <LinearGradient
          colors={['transparent', isDark ? 'rgba(26, 26, 32, 0.8)' : 'rgba(255, 255, 255, 0.8)']}
          style={styles.heroGradient}
          pointerEvents="none"
        />

        {/* Location Badge */}
        <View style={styles.locationBadge} pointerEvents="none">
          <LinearGradient
            colors={['rgba(225, 29, 72, 0.9)', 'rgba(190, 18, 60, 0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.badgeGradient}
          >
            <Text style={styles.badgeText}>
              {getLocationBadgeText(journey.location_type)}
            </Text>
          </LinearGradient>
        </View>

        {/* Holographic Rarity Badge */}
        {isHolographic && hasAiPoster && (
          <View style={styles.rarityBadge} pointerEvents="none">
            <LinearGradient
              colors={['#FFD700', '#FFA500', '#FFD700']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rarityBadgeGradient}
            >
              <Text style={styles.rarityBadgeText}>RARE</Text>
            </LinearGradient>
          </View>
        )}

        {/* Navigation arrows — multi-photo only */}
        {heroPhotos.length > 1 && activeHeroPage > 0 && (
          <Pressable onPress={handleHeroPrev} style={styles.heroArrowLeft}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
          </Pressable>
        )}
        {heroPhotos.length > 1 && activeHeroPage < heroPhotos.length - 1 && (
          <Pressable onPress={handleHeroNext} style={styles.heroArrowRight}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
              <Path d="M9 18l6-6-6-6" />
            </Svg>
          </Pressable>
        )}

        {/* Edit button — rendered after poster overlay so it sits on top in z-order */}
        <View style={styles.heroButtonsRow} pointerEvents="box-none">
          <Pressable
            style={styles.editButton}
            onPress={() => router.push(`/journey/edit/${journey.id}` as never)}
          >
            <BlurView intensity={20} tint={effectiveTheme} style={styles.editBlurContainer}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </Svg>
            </BlurView>
          </Pressable>
        </View>
      </View>

      {/* Perforated edge — between hero and bottom section so blur starts below it */}
      <PerforatedEdge colors={colors} dashColor="rgba(255, 255, 255, 0.5)" />

      {/* Bottom half — frosted glass background + content */}
      <View style={styles.bottomSection}>
        {/* Frosted poster background — only on bottom half, below perforation */}
        {blurPosterUrl && (
          <>
            <ExpoImage
              source={{ uri: blurPosterUrl }}
              style={[StyleSheet.absoluteFill, styles.blurredPosterImage]}
              contentFit="cover"
              transition={200}
            />
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, styles.posterOverlay]} />
            ) : (
              <BlurView
                intensity={80}
                tint={isDark ? 'dark' : 'light'}
                experimentalBlurMethod="dimezisBlurView"
                style={[StyleSheet.absoluteFill, styles.posterOverlay]}
              />
            )}
          </>
        )}

        {/* Flip card: front/back faces */}
        <TicketFlipCard
          journey={journey}
          firstTake={firstTake}
          colors={colors}
          isDark={isDark}
          infoPageWidth={infoPageWidth}
        />

        {/* Poster Options - below flip card */}
        {hasAiPoster ? (
          <PosterToggle
            isAiSelected={!!showAiPoster}
            isHolographic={isHolographic}
            onToggle={onTogglePoster}
            colors={colors}
            isDark={isDark}
          />
        ) : (
          <View style={styles.generateArtSection}>
            <Pressable
              style={styles.generateArtButton}
              onPress={onGenerateArt}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <ActivityIndicator size="small" color={colors.text} />
                  <Text style={styles.generateArtButtonText}>Generating...</Text>
                </>
              ) : (
                <>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                    <Path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </Svg>
                  <Text style={styles.generateArtButtonText}>Generate AI Art</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// Add New Journey Card Component
interface AddJourneyCardProps {
  colors: ThemeColors;
  ticketHeight: number;
  ticketWidth: number;
  onPress: () => void;
  isCreating: boolean;
}

function AddJourneyCard({ colors, ticketHeight, ticketWidth, onPress, isCreating }: AddJourneyCardProps) {
  const styles = useMemo(() => createAddCardStyles(colors, ticketHeight, ticketWidth), [colors, ticketHeight, ticketWidth]);

  return (
    <View style={styles.card}>
      <Pressable style={styles.content} onPress={onPress} disabled={isCreating}>
        {isCreating ? (
          <ActivityIndicator size="large" color={colors.tint} />
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={colors.tint} strokeWidth={2}>
                <Path d="M12 5v14M5 12h14" />
              </Svg>
            </View>
            <Text style={styles.title}>Log Another Viewing</Text>
            <Text style={styles.subtitle}>Add a new journey for this movie</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

// Header height constant
const HEADER_HEIGHT = 100;
const MAX_JOURNEY_WIDTH = 480;
const CAROUSEL_HORIZONTAL_PADDING = Spacing.md;
type CarouselItem =
  | { type: 'journey'; journey: UserMovie }
  | { type: 'add' };

export default function JourneyCarouselScreen() {
  const router = useRouter();
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { height: screenHeight, width: windowWidth } = useWindowDimensions();
  const screenWidth = Platform.OS === 'web' ? Math.min(windowWidth, MAX_JOURNEY_WIDTH) : windowWidth;
  const insets = useSafeAreaInsets();

  // Auth gating hook
  const { requireAuth, isLoginPromptVisible, loginPromptMessage, hideLoginPrompt } = useRequireAuth();

  // Journey carousel state
  const [currentJourneyIndex, setCurrentJourneyIndex] = useState(0);
  const carouselRef = useRef<FlatList<CarouselItem>>(null);

  // Parse tmdbId once for all hooks
  const parsedTmdbId = tmdbId ? parseInt(tmdbId, 10) : undefined;

  // Fetch all journeys for this movie
  const { data: journeyData, isLoading, isError } = useJourneysByMovie(parsedTmdbId);
  const journeys = useMemo(() => journeyData?.journeys ?? [], [journeyData?.journeys]);
  const firstTake = journeyData?.firstTake ?? null;

  // AI art generation
  const { generateArt } = useGenerateArt();
  const { updateJourney } = useJourneyMutations(parsedTmdbId);

  // Track which journey is currently generating
  const [generatingJourneyId, setGeneratingJourneyId] = useState<string | null>(null);

  // Poster inspection modal state
  const [isPosterModalVisible, setIsPosterModalVisible] = useState(false);
  const [selectedPosterJourney, setSelectedPosterJourney] = useState<UserMovie | null>(null);

  // Handle poster tap for inspection modal
  const handlePosterTap = useCallback((journey: UserMovie) => {
    setSelectedPosterJourney(journey);
    setIsPosterModalVisible(true);
    hapticImpact(ImpactFeedbackStyle.Medium);
  }, []);

  // Measure FlatList area height on web for precise card sizing
  const [carouselAreaHeight, setCarouselAreaHeight] = useState(0);
  const handleCarouselLayout = useCallback((e: LayoutChangeEvent) => {
    setCarouselAreaHeight(e.nativeEvent.layout.height);
  }, []);

  // Calculate dimensions
  const pageWidth = screenWidth;
  const nativeTicketHeight = screenHeight - HEADER_HEIGHT - insets.top - insets.bottom - (Spacing.md * 2);
  // On web: use measured FlatList height minus card marginTop; fallback to native calc
  const ticketHeight = Platform.OS === 'web' && carouselAreaHeight > 0
    ? carouselAreaHeight - Spacing.md
    : nativeTicketHeight;
  const ticketWidth = screenWidth - (CAROUSEL_HORIZONTAL_PADDING * 2);
  // Info page width = container width (ticket width minus container's horizontal margins)
  const infoPageWidth = ticketWidth - (Spacing.md * 2);

  // Total pages = journeys + 1 (add new journey card)
  const totalPages = journeys.length + 1;

  const styles = useMemo(() => createStyles(colors, ticketHeight, ticketWidth, insets.top), [colors, ticketHeight, ticketWidth, insets.top]);

  // Carousel data for FlatList
  const carouselData: CarouselItem[] = useMemo(() => {
    const items: CarouselItem[] = journeys.map((journey) => ({
      type: 'journey' as const,
      journey,
    }));
    items.push({ type: 'add' as const });
    return items;
  }, [journeys]);

  // FlatList viewability callbacks (matches onboarding pattern)
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentJourneyIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  // Handle go back
  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Handle next journey (or wrap to first)
  const handleNextJourney = useCallback(() => {
    const nextIndex = currentJourneyIndex + 1 >= journeys.length
      ? 0
      : currentJourneyIndex + 1;
    carouselRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    hapticImpact(ImpactFeedbackStyle.Light);
  }, [currentJourneyIndex, journeys.length]);

  // Handle create new journey — navigate to edit screen in create mode (journey is only
  // persisted when the user presses Save, not when they tap "Log Another Viewing").
  const handleCreateJourney = useCallback(() => {
    requireAuth(() => {
      if (journeys.length === 0 || !parsedTmdbId) return;
      router.push(`/journey/edit/new?tmdbId=${parsedTmdbId}` as never);
    }, 'Sign in to log another viewing');
  }, [requireAuth, journeys, parsedTmdbId, router]);

  // Handle generate AI art for a journey
  const handleGenerateArt = useCallback(async (journey: UserMovie) => {
    requireAuth(async () => {
      setGeneratingJourneyId(journey.id);
      // Get genre names from genre_ids
      const genreNames = journey.genre_ids
        ? getGenreNamesByIds(journey.genre_ids)
        : [];

      // Get the poster URL for style transfer
      const posterUrl = getTMDBImageUrl(journey.poster_path ?? null, 'w780') || '';

      // Fire and forget - errors handled globally via MutationCache toast
      generateArt({
        journeyId: journey.id,
        movieTitle: journey.title,
        genres: genreNames,
        posterUrl,
      }).finally(() => {
        setGeneratingJourneyId(null);
      });
    }, 'Sign in to generate AI art');
  }, [generateArt, requireAuth]);

  // Handle toggle between original and AI poster
  const handleTogglePoster = useCallback(async (journey: UserMovie) => {
    const newDisplayPoster = journey.display_poster === 'ai_generated' ? 'original' : 'ai_generated';
    try {
      await updateJourney({
        journeyId: journey.id,
        data: { display_poster: newDisplayPoster },
      });

      // Show feedback toast when switching to AI art
      if (newDisplayPoster === 'ai_generated') {
        const isHolographic = journey.ai_poster_rarity === 'holographic';
        Toast.show({
          type: 'success',
          text1: isHolographic ? '🌟 Rare art set as poster' : '✨ AI art set as poster',
          text2: 'This artwork will display in your collection',
        });
      }
    } catch (error) {
      console.error('Failed to toggle poster:', error);
    }
  }, [updateJourney]);

  // Get movie title from first journey
  const movieTitle = journeys[0]?.title ?? 'Movie';

  // Render a carousel item (journey ticket or add card)
  const renderCarouselItem = useCallback(
    ({ item }: { item: CarouselItem }) => {
      // AddJourneyCard uses a plain View wrapper — ScrollView can
      // intercept press events on web and prevent the button from firing.
      if (item.type === 'add') {
        return (
          <View style={{ width: pageWidth, paddingHorizontal: CAROUSEL_HORIZONTAL_PADDING }}>
            <AddJourneyCard
              colors={colors}
              ticketHeight={ticketHeight}
              ticketWidth={ticketWidth}
              onPress={handleCreateJourney}
              isCreating={false}
            />
          </View>
        );
      }

      return (
        <View style={{ width: pageWidth, paddingHorizontal: CAROUSEL_HORIZONTAL_PADDING }}>
          <JourneyTicket
            journey={item.journey}
            firstTake={firstTake}
            colors={colors}
            effectiveTheme={effectiveTheme}
            ticketHeight={ticketHeight}
            ticketWidth={ticketWidth}
            infoPageWidth={infoPageWidth}
            onGenerateArt={() => handleGenerateArt(item.journey)}
            onTogglePoster={() => handleTogglePoster(item.journey)}
            isGenerating={generatingJourneyId === item.journey.id}
            onPosterTap={() => handlePosterTap(item.journey)}
          />
        </View>
      );
    },
    [colors, effectiveTheme, ticketHeight, ticketWidth, infoPageWidth, pageWidth,
     firstTake, generatingJourneyId, handleGenerateArt, handleTogglePoster,
     handlePosterTap, handleCreateJourney],
  );

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading your journeys...</Text>
        </View>
        {/* Back button even during loading */}
        <View style={styles.loadingBackButton}>
          <Pressable onPress={handleGoBack} style={styles.iconButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={styles.blurContainer}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                <Path d="M19 12H5M12 19l-7-7 7-7" />
              </Svg>
            </BlurView>
          </Pressable>
        </View>
      </View>
    );
  }

  // Show error state or empty state
  if (isError || journeys.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>No journeys found</Text>
          <Text style={styles.errorSubtitle}>
            You have not logged any viewings for this movie yet.
          </Text>
          <Pressable onPress={handleGoBack} style={styles.errorBackButton}>
            <Text style={styles.errorBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Solid background — no ambient blur so ticket punch-hole divots match cleanly */}

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleGoBack} style={styles.iconButton}>
          <BlurView intensity={20} tint={effectiveTheme} style={styles.blurContainer}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
              <Path d="M19 12H5M12 19l-7-7 7-7" />
            </Svg>
          </BlurView>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>
            {currentJourneyIndex >= journeys.length
              ? 'NEW JOURNEY'
              : `JOURNEY ${currentJourneyIndex + 1} OF ${journeys.length}`}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{movieTitle}</Text>
        </View>

        {/* Next / Rewind button (hidden on "Add New Journey" card) */}
        {currentJourneyIndex < journeys.length ? (
          <Pressable onPress={handleNextJourney} style={styles.iconButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={styles.blurContainer}>
              {currentJourneyIndex < journeys.length - 1 ? (
                // Forward arrow → next journey
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                  <Path d="M5 12h14M12 5l7 7-7 7" />
                </Svg>
              ) : (
                // Rewind icon ⟪ wrap to first
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                  <Path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                </Svg>
              )}
            </BlurView>
          </Pressable>
        ) : (
          <View style={styles.iconButtonPlaceholder} />
        )}
      </View>

      {/* Journey Carousel */}
      <FlatList
        ref={carouselRef}
        data={carouselData}
        renderItem={renderCarouselItem}
        keyExtractor={(item, index) =>
          item.type === 'journey' ? item.journey.id : `add-${index}`
        }
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        bounces={false}
        style={{ flex: 1 }}
        onLayout={handleCarouselLayout}
        initialNumToRender={totalPages}
      />

      {/* Dot Indicators for Journey Carousel */}
      <View style={styles.carouselDotsContainer}>
        {Array.from({ length: totalPages }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.carouselDot,
              currentJourneyIndex === index && styles.carouselDotActive,
              index === totalPages - 1 && styles.addDot,
            ]}
          />
        ))}
      </View>

      {/* Poster Inspection Modal */}
      <PosterInspectionModal
        visible={isPosterModalVisible}
        imageUrl={getTMDBImageUrl(selectedPosterJourney?.poster_path ?? null, 'w780') || ''}
        aiImageUrl={selectedPosterJourney?.display_poster === 'ai_generated' ? selectedPosterJourney?.ai_poster_url : null}
        movieTitle={selectedPosterJourney?.title || ''}
        onClose={() => {
          setIsPosterModalVisible(false);
          setSelectedPosterJourney(null);
        }}
      />

      {/* Login Prompt Modal */}
      <LoginPromptModal
        visible={isLoginPromptVisible}
        onClose={hideLoginPrompt}
        message={loginPromptMessage}
      />
    </View>
  );
}

// Create styles for the main screen
const createStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number, topInset: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: topInset + (Platform.OS === 'web' ? Spacing.md : Spacing.sm),
    paddingBottom: Spacing.sm,
    zIndex: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  headerLabel: {
    ...Typography.caption.medium,
    color: colors.tint,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    ...Typography.body.baseMedium,
    color: colors.text,
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: BorderRadius.full,
  },
  iconButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
  },

  // Carousel Dots
  carouselDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 8,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  carouselDotActive: {
    backgroundColor: colors.text,
    width: 24,
  },
  addDot: {
    backgroundColor: colors.tint + '50',
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
    color: Colors.dark.text,
  },
});

// Create styles for ticket cards
const createTicketStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number, infoPageWidth: number, isDark: boolean) => StyleSheet.create({
  ticketCard: {
    width: ticketWidth,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    ...(Platform.OS === 'web' ? { height: ticketHeight } : { minHeight: ticketHeight }),
  },
  bottomSection: {
    overflow: 'hidden',
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    paddingBottom: Spacing.sm,
  },
  posterOverlay: {
    backgroundColor: isDark ? 'rgba(9, 9, 11, 0.55)' : 'rgba(255, 255, 255, 0.55)',
  },
  blurredPosterImage: {
    ...Platform.select({
      web: { filter: 'blur(20px)', transform: 'scale(1.1)' } as any,
      default: {},
    }),
  },
  heroSection: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    zIndex: 1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  heroArrowLeft: {
    position: 'absolute',
    left: 12,
    top: '50%' as any,
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  heroArrowRight: {
    position: 'absolute',
    right: 12,
    top: '50%' as any,
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  locationBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  badgeGradient: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    ...Typography.caption.medium,
    color: '#ffffff',
    letterSpacing: 1,
    fontWeight: '700',
  },
  heroButtonsRow: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  generateArtSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  generateArtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: colors.tint,
    borderRadius: BorderRadius.md,
  },
  generateArtButtonText: {
    ...Typography.button.primary,
    color: colors.text,
  },
  editButton: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    borderRadius: BorderRadius.full,
  },
  editBlurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
  },
  rarityBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  rarityBadgeGradient: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  rarityBadgeText: {
    ...Typography.caption.medium,
    color: '#000000',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 10,
  },
});

// Create styles for add journey card
const createAddCardStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number) => StyleSheet.create({
  card: {
    width: ticketWidth,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    minHeight: Platform.OS === 'web' ? undefined : ticketHeight,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h4,
    color: colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
