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
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  ImageBackground,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { useJourneysByMovie, useCreateJourney } from '@/hooks/use-journey';
import type { UserMovie, FirstTake } from '@/lib/database.types';

// Type for the colors object
type ThemeColors = typeof Colors.dark;

// Helper to format date nicely
function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

// Helper to format time nicely
function formatTime(timeString: string | null): string {
  if (!timeString) return 'Not set';
  const [hours, minutes] = timeString.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Helper to format watch format nicely
function formatWatchFormat(format: string | null): string {
  if (!format) return 'Not set';
  return format.toUpperCase();
}

// Helper to format price
function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return 'Not set';
  return `$${price.toFixed(2)}`;
}

// Barcode component
function BarcodeVisual({ colors }: { colors: ThemeColors }) {
  const barWidths = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1];

  return (
    <Svg height={40} width={120} viewBox="0 0 120 40">
      {barWidths.map((width, index) => {
        const x = barWidths.slice(0, index).reduce((sum, w) => sum + w + 2, 0);
        return (
          <Rect
            key={index}
            x={x}
            y={0}
            width={width}
            height={40}
            fill={colors.textSecondary}
          />
        );
      })}
    </Svg>
  );
}

// Perforated edge with notches
function PerforatedEdge({ colors }: { colors: ThemeColors }) {
  return (
    <View style={perforatedStyles(colors).container}>
      <View style={perforatedStyles(colors).notchLeft} />
      <View style={perforatedStyles(colors).dashedLine}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View key={i} style={perforatedStyles(colors).dash} />
        ))}
      </View>
      <View style={perforatedStyles(colors).notchRight} />
    </View>
  );
}

const perforatedStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  notchLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    marginLeft: -10,
  },
  notchRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    marginRight: -10,
  },
  dashedLine: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  dash: {
    width: 8,
    height: 2,
    backgroundColor: colors.border,
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
}

function JourneyTicket({
  journey,
  firstTake,
  colors,
  effectiveTheme,
  ticketHeight,
  ticketWidth,
  infoPageWidth,
}: JourneyTicketProps) {
  const [infoPageIndex, setInfoPageIndex] = useState(0);

  const handleInfoScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / infoPageWidth);
    setInfoPageIndex(pageIndex);
  }, [infoPageWidth]);

  const heroImageUrl = journey.journey_photos?.[0]
    ? journey.journey_photos[0]
    : getTMDBImageUrl(journey.poster_path ?? null, 'w780');

  const styles = useMemo(() => createTicketStyles(colors, ticketHeight, ticketWidth, infoPageWidth), [colors, ticketHeight, ticketWidth, infoPageWidth]);

  return (
    <View style={styles.ticketCard}>
      {/* Hero Image Area */}
      <View style={styles.heroSection}>
        <Image
          source={{ uri: heroImageUrl || undefined }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(26, 26, 32, 0.8)']}
          style={styles.heroGradient}
        />

        {/* Location Badge */}
        <View style={styles.locationBadge}>
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

        {/* Edit button */}
        <Link href={`/journey/edit/${journey.id}` as never} asChild>
          <Pressable style={styles.editButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={styles.editBlurContainer}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </Svg>
            </BlurView>
          </Pressable>
        </Link>
      </View>

      {/* Perforated Edge */}
      <PerforatedEdge colors={colors} />

      {/* Movie Title & Rating */}
      <View style={styles.titleSection}>
        <Text style={styles.movieTitle}>{journey.title}</Text>

        {/* First Take Rating (read-only) */}
        {firstTake?.rating && (
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>
              <Text style={styles.ratingStar}>★</Text> {firstTake.rating.toFixed(1)}
            </Text>
            {journey.journey_tagline && (
              <Text style={styles.taglineText}>
                {' '}• {journey.journey_tagline}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Info Carousel */}
      <View style={styles.infoCarouselContainer}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleInfoScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={infoPageWidth}
          snapToAlignment="start"
          contentContainerStyle={styles.infoCarouselContent}
        >
          {/* Page 1: Core Info */}
          <View style={[styles.infoPage, { width: infoPageWidth }]}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>DATE</Text>
                <Text style={styles.infoValue}>{formatDate(journey.watched_at)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>CINEMA</Text>
                <Text style={styles.infoValue}>{journey.location_name || 'Not set'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>SEAT</Text>
                <Text style={styles.infoValue}>{journey.seat_location || 'Not set'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>WITH</Text>
                <Text style={styles.infoValue}>
                  {journey.watched_with?.join(', ') || 'Solo'}
                </Text>
              </View>
            </View>
          </View>

          {/* Page 2: Extended Details */}
          <View style={[styles.infoPage, { width: infoPageWidth }]}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>TIME</Text>
                <Text style={styles.infoValue}>{formatTime(journey.watch_time)}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>FORMAT</Text>
                <Text style={styles.infoValue}>{formatWatchFormat(journey.watch_format)}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>AUDITORIUM</Text>
                <Text style={styles.infoValue}>{journey.auditorium || 'Not set'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>PRICE</Text>
                <Text style={styles.infoValue}>{formatPrice(journey.ticket_price)}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Dot Indicators */}
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, infoPageIndex === 0 && styles.dotActive]} />
          <View style={[styles.dot, infoPageIndex === 1 && styles.dotActive]} />
        </View>
      </View>

      {/* Notes Section */}
      {journey.journey_notes && (
        <View style={styles.notesSection}>
          <Text style={styles.notesText}>&ldquo;{journey.journey_notes}&rdquo;</Text>
        </View>
      )}

      {/* Perforated Edge */}
      <PerforatedEdge colors={colors} />

      {/* Footer with Barcode */}
      <View style={styles.footer}>
        <Text style={styles.ticketIdText}>
          ID: {journey.ticket_id || 'CNTK-' + journey.id.slice(0, 8).toUpperCase()}
        </Text>
        <BarcodeVisual colors={colors} />
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
const CAROUSEL_HORIZONTAL_PADDING = Spacing.md;
const CARD_GAP = Spacing.md; // Gap between carousel cards

export default function JourneyCarouselScreen() {
  const router = useRouter();
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Journey carousel state
  const [currentJourneyIndex, setCurrentJourneyIndex] = useState(0);
  const carouselRef = useRef<ScrollView>(null);

  // Fetch all journeys for this movie
  const { data: journeyData, isLoading, isError } = useJourneysByMovie(
    tmdbId ? parseInt(tmdbId, 10) : undefined
  );
  const journeys = journeyData?.journeys ?? [];
  const firstTake = journeyData?.firstTake ?? null;

  // Create journey mutation
  const { createJourney, isCreating } = useCreateJourney();

  // Calculate dimensions
  const ticketHeight = screenHeight - HEADER_HEIGHT - insets.top - insets.bottom - (Spacing.md * 2);
  const ticketWidth = screenWidth - (CAROUSEL_HORIZONTAL_PADDING * 2);
  // Info page width = container width (ticket width minus container's horizontal margins)
  const infoPageWidth = ticketWidth - (Spacing.md * 2);

  // Total pages = journeys + 1 (add new journey card)
  const totalPages = journeys.length + 1;

  const styles = useMemo(() => createStyles(colors, ticketHeight, ticketWidth), [colors, ticketHeight, ticketWidth]);

  // Handle carousel scroll
  const handleCarouselScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / (ticketWidth + CARD_GAP));
    setCurrentJourneyIndex(pageIndex);
  }, [ticketWidth]);

  // Handle go back
  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Handle create new journey
  const handleCreateJourney = async () => {
    if (journeys.length === 0) return;
    try {
      const newJourney = await createJourney(journeys[0]);
      // Navigate to the edit screen for the new journey
      router.push(`/journey/edit/${newJourney.id}` as never);
    } catch (error) {
      console.error('Failed to create new journey:', error);
    }
  };

  // Get backdrop from first journey
  const backdropUrl = journeys[0]
    ? getTMDBImageUrl(journeys[0].backdrop_path ?? null, 'w780')
    : null;

  // Get movie title from first journey
  const movieTitle = journeys[0]?.title ?? 'Movie';

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
      {/* Ambient background blur */}
      {backdropUrl && (
        <ImageBackground
          source={{ uri: backdropUrl }}
          style={styles.ambientBackground}
          blurRadius={50}
        >
          <LinearGradient
            colors={[colors.background, 'rgba(9, 9, 11, 0.8)', colors.background]}
            style={StyleSheet.absoluteFill}
          />
        </ImageBackground>
      )}

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

        {/* Placeholder for symmetry */}
        <View style={styles.iconButtonPlaceholder} />
      </View>

      {/* Journey Carousel */}
      <ScrollView
        ref={carouselRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        onScroll={handleCarouselScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={ticketWidth + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.carouselContent}
      >
        {journeys.map((journey) => (
          <JourneyTicket
            key={journey.id}
            journey={journey}
            firstTake={firstTake}
            colors={colors}
            effectiveTheme={effectiveTheme}
            ticketHeight={ticketHeight}
            ticketWidth={ticketWidth}
            infoPageWidth={infoPageWidth}
          />
        ))}
        {/* Add New Journey Card */}
        <AddJourneyCard
          colors={colors}
          ticketHeight={ticketHeight}
          ticketWidth={ticketWidth}
          onPress={handleCreateJourney}
          isCreating={isCreating}
        />
      </ScrollView>

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
    </View>
  );
}

// Create styles for the main screen
const createStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  carouselContent: {
    paddingHorizontal: CAROUSEL_HORIZONTAL_PADDING,
  },

  // Ambient Background
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 60,
    paddingBottom: Spacing.md,
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
const createTicketStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number, infoPageWidth: number) => StyleSheet.create({
  ticketCard: {
    width: ticketWidth,
    backgroundColor: '#1a1a20',
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    marginRight: CARD_GAP,
    minHeight: ticketHeight,
    // Note: No overflow hidden - allows notches to show background
  },
  heroSection: {
    flex: 1,
    minHeight: 250,
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
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
  editButton: {
    position: 'absolute',
    top: 16,
    right: 16,
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
  titleSection: {
    paddingHorizontal: Spacing.lg,
  },
  movieTitle: {
    ...Typography.display.h3,
    color: colors.text,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ratingText: {
    ...Typography.body.lg,
    color: colors.gold,
    fontFamily: Fonts.outfit.bold,
  },
  ratingStar: {
    color: colors.gold,
  },
  taglineText: {
    ...Typography.body.base,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  infoCarouselContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  infoCarouselContent: {},
  infoPage: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    ...Typography.caption.medium,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoValue: {
    ...Typography.body.baseMedium,
    color: colors.text,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.text,
  },
  notesSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.tint,
  },
  notesText: {
    ...Typography.body.base,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  ticketIdText: {
    ...Typography.caption.medium,
    color: colors.textTertiary,
    letterSpacing: 1,
  },
});

// Create styles for add journey card
const createAddCardStyles = (colors: ThemeColors, ticketHeight: number, ticketWidth: number) => StyleSheet.create({
  card: {
    width: ticketWidth,
    backgroundColor: '#1a1a20',
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    marginRight: CARD_GAP,
    minHeight: ticketHeight,
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
