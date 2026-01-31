/**
 * Journey Card Screen
 * Ticket-style display of a user's personal movie experience.
 *
 * Features:
 * - Ticket metaphor UI with perforated edges
 * - Hero image with holographic location badge
 * - First Take rating display (read-only)
 * - Journey details grid (date, cinema, seat, with)
 * - Notes section
 * - Barcode footer with ticket ID
 */

import React, { useMemo, useState, useCallback } from 'react';
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
import { useJourney } from '@/hooks/use-journey';

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
  // Time string is in HH:MM format
  const [hours, minutes] = timeString.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Helper to format watch format nicely
function formatWatchFormat(format: string | null): string {
  if (!format) return 'Not set';
  // Capitalize first letter of each word
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

// Header height constant
const HEADER_HEIGHT = 100; // paddingTop (60) + content (~40)

export default function JourneyCardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Info carousel state
  const [infoPageIndex, setInfoPageIndex] = useState(0);

  // Fetch journey data
  const { data: journeyData, isLoading, isError } = useJourney(id);
  const journey = journeyData;
  const firstTake = journeyData?.firstTake;

  // Calculate available height for ticket card
  // Screen height - header - top safe area - bottom safe area - padding
  const ticketHeight = screenHeight - HEADER_HEIGHT - insets.top - insets.bottom - (Spacing.md * 2);

  // Calculate info carousel page width (screen width - horizontal paddings)
  // Info page width = container width (screen - scroll padding - container margins)
  const infoPageWidth = screenWidth - (Spacing.md * 4);

  // Dynamic styles based on theme
  const styles = useMemo(() => createStyles(colors, ticketHeight, infoPageWidth), [colors, ticketHeight, infoPageWidth]);

  // Handle info carousel scroll
  const handleInfoScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / infoPageWidth);
    setInfoPageIndex(pageIndex);
  }, [infoPageWidth]);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Hero image - use first journey photo if available, otherwise poster
  const heroImageUrl = journey?.journey_photos?.[0]
    ? journey.journey_photos[0]
    : getTMDBImageUrl(journey?.poster_path ?? null, 'w780');

  const backdropUrl = getTMDBImageUrl(journey?.backdrop_path ?? null, 'w780');

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Loading your journey...</Text>
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

  // Show error state
  if (isError || !journey) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Journey not found</Text>
          <Text style={styles.errorSubtitle}>
            We could not load this movie journey.
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
          <Text style={styles.headerLabel}>MY JOURNEY</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{journey.title}</Text>
        </View>

        <Link href={`/journey/edit/${id}` as never} asChild>
          <Pressable style={styles.iconButton}>
            <BlurView intensity={20} tint={effectiveTheme} style={styles.blurContainer}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </Svg>
            </BlurView>
          </Pressable>
        </Link>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Ticket Card */}
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

      </ScrollView>
    </View>
  );
}

// Create styles function that takes theme colors, ticket height, and info page width
const createStyles = (colors: ThemeColors, ticketHeight: number, infoPageWidth: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    flexGrow: 1,
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
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: BorderRadius.full,
  },

  // Ticket Card - fills available height
  ticketCard: {
    backgroundColor: '#1a1a20',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    minHeight: ticketHeight,
  },

  // Hero Section - expands to fill available space
  heroSection: {
    flex: 1,
    minHeight: 250,
    position: 'relative',
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

  // Title Section
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

  // Info Carousel
  infoCarouselContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  infoCarouselContent: {
    // Content container for horizontal scroll
  },
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

  // Notes Section
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

  // Footer
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
