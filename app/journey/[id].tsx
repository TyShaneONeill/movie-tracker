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

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle, NotificationFeedbackType } from '@/lib/haptics';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { useJourney } from '@/hooks/use-journey';
import { useGenerateArt } from '@/hooks/use-generate-art';
import { useGrantAdReward } from '@/hooks/use-grant-ad-reward';
import { useRewardedAd } from '@/hooks/use-rewarded-ad';
import { useMutualFollows } from '@/hooks/use-mutual-follows';
import { getGenreNamesByIds } from '@/lib/genre-service';
import { useAuth } from '@/lib/auth-context';
import { buildAvatarUrl } from '@/lib/avatar-service';
import { TicketFlipCard } from '@/components/journey/ticket-flip-card';
import { PerforatedEdge } from '@/components/ui/perforated-edge';
import { PosterInspectionModal } from '@/components/poster-inspection';
import { usePremium } from '@/hooks/use-premium';
import { UpgradePromptSheet } from '@/components/premium/upgrade-prompt-sheet';
import { analytics } from '@/lib/analytics';

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

// Header height constant
const HEADER_HEIGHT = 100; // paddingTop (60) + content (~40)
const MAX_JOURNEY_WIDTH = 480;

export default function JourneyCardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { height: screenHeight, width: windowWidth } = useWindowDimensions();
  const screenWidth = Platform.OS === 'web' ? Math.min(windowWidth, MAX_JOURNEY_WIDTH) : windowWidth;
  const insets = useSafeAreaInsets();

  // Poster inspection modal state
  const [isPosterModalVisible, setIsPosterModalVisible] = useState(false);
  const [upgradeSheetVisible, setUpgradeSheetVisible] = useState(false);

  // Active page index for hero photo pager
  const [activeHeroPage, setActiveHeroPage] = useState(0);

  // Auth & companion avatars
  const { user } = useAuth();
  const { mutualFollows } = useMutualFollows(user?.id ?? '');

  const companionAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of mutualFollows) {
      const name = (p.full_name || p.username || '').toLowerCase();
      if (name) map.set(name, buildAvatarUrl(p.avatar_url, p.updated_at));
    }
    return map;
  }, [mutualFollows]);

  // Fetch journey data
  const { data: journeyData, isLoading, isError } = useJourney(id);
  const journey = journeyData;
  const firstTake = journeyData?.firstTake;

  // Track journey view
  const hasTrackedJourneyView = useRef(false);
  useEffect(() => {
    if (journey && !hasTrackedJourneyView.current) {
      hasTrackedJourneyView.current = true;
      analytics.track('journey:view', { journey_id: journey.id, tmdb_id: journey.tmdb_id });
    }
  }, [journey]);

  // AI art generation
  const { tier } = usePremium();
  const { generateArt, isGenerating, hasUsedFreeTrial } = useGenerateArt();
  const { loaded: adLoaded, showAd, reloadAd } = useRewardedAd('ai');
  const { grantCredit, isGranting } = useGrantAdReward();

  // Calculate available height for ticket card
  // Screen height - header - top safe area - bottom safe area - padding
  const ticketHeight = screenHeight - HEADER_HEIGHT - insets.top - insets.bottom - (Spacing.md * 2);

  // Calculate info carousel page width (screen width - horizontal paddings)
  // Info page width = container width (screen - scroll padding - container margins)
  const infoPageWidth = screenWidth - (Spacing.md * 4);

  // Theme detection
  const isDark = effectiveTheme === 'dark';

  // Dynamic styles based on theme
  const styles = useMemo(() => createStyles(colors, ticketHeight, insets.top, isDark), [colors, ticketHeight, insets.top, isDark]);

  // Handle poster modal close
  const handlePosterModalClose = useCallback(() => {
    hapticImpact();
    setIsPosterModalVisible(false);
  }, []);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // Handle watch ad to earn a generation credit
  const handleWatchAd = useCallback(async () => {
    hapticImpact();
    const earned = await showAd();
    if (earned) {
      const granted = await grantCredit();
      if (granted) {
        Toast.show({
          type: 'success',
          text1: 'Credit earned!',
          text2: 'Tap Generate AI Art to use it.',
        });
      }
      reloadAd();
    } else {
      Toast.show({
        type: 'info',
        text1: 'Watch the full ad to earn a credit',
      });
    }
  }, [showAd, grantCredit, reloadAd]);

  // Handle generate AI art
  const handleGenerateArt = useCallback(async () => {
    if (!journey) return;
    hapticImpact();
    try {
      const genreNames = journey.genre_ids
        ? getGenreNamesByIds(journey.genre_ids)
        : [];
      const posterUrl = getTMDBImageUrl(journey.poster_path ?? null, 'w780') || '';
      await generateArt({
        journeyId: journey.id,
        movieTitle: journey.title,
        genres: genreNames,
        posterUrl,
      });
      hapticNotification(NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to generate art:', error);
    }
  }, [journey, generateArt]);

  // Determine poster state
  const hasAiPoster = !!journey?.ai_poster_url;

  // Build hero photo sources array (journey photos or TMDB poster fallback)
  const heroPhotos = useMemo(() => {
    if (journey?.journey_photos?.length) {
      return journey.journey_photos as string[];
    }
    const tmdbUrl = getTMDBImageUrl(journey?.poster_path ?? null, 'w780');
    return tmdbUrl ? [tmdbUrl] : [];
  }, [journey]);

  // Width of the ticket card (screen minus scroll padding)
  const ticketCardWidth = screenWidth - (Spacing.md * 2);

  // Poster URL for frosted glass background on lower ticket area
  const blurPosterUrl = getTMDBImageUrl(journey?.poster_path ?? null, 'w500');

  // Handle poster tap for inspection modal (must be after heroImageUrl declaration)
  const handlePosterTap = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Medium);
    setIsPosterModalVisible(true);
  }, []);

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
          {heroPhotos.length > 1 ? (
            <View style={styles.heroSection}>
              {/* Scrollable photo pager */}
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) => {
                  const x = event.nativeEvent.contentOffset.x;
                  const page = Math.round(x / ticketCardWidth);
                  setActiveHeroPage(Math.max(0, Math.min(page, heroPhotos.length - 1)));
                }}
                style={StyleSheet.absoluteFill}
              >
                {heroPhotos.map((photoUri, index) => (
                  <Pressable
                    key={index}
                    onPress={handlePosterTap}
                    style={{ width: ticketCardWidth, height: 350 }}
                    android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    <Image
                      source={{ uri: photoUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>

              {/* Gradient overlay */}
              <View style={styles.heroGradient} pointerEvents="none">
                <LinearGradient
                  colors={['transparent', isDark ? 'rgba(26, 26, 32, 0.8)' : 'rgba(255, 255, 255, 0.8)']}
                  style={StyleSheet.absoluteFill}
                />
              </View>

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

              {/* Dot indicators */}
              <View style={styles.heroDots} pointerEvents="none">
                {heroPhotos.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.heroDot,
                      i === activeHeroPage ? styles.heroDotActive : styles.heroDotInactive,
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handlePosterTap}
              style={({ pressed }) => [
                styles.heroSection,
                pressed && { opacity: 0.8 },
              ]}
              android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
            >
              <Image
                source={{ uri: heroPhotos[0] || undefined }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              <View style={styles.heroGradient} pointerEvents="none">
                <LinearGradient
                  colors={['transparent', isDark ? 'rgba(26, 26, 32, 0.8)' : 'rgba(255, 255, 255, 0.8)']}
                  style={StyleSheet.absoluteFill}
                />
              </View>

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
            </Pressable>
          )}

          {/* Perforated edge — between hero and bottom section so blur starts below it */}
          <PerforatedEdge colors={colors} dashColor="rgba(255, 255, 255, 0.5)" />

          {/* Bottom half — frosted glass starts below perforation */}
          <View style={styles.bottomSection}>
            {/* Frosted poster background — only below perforation */}
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

          {/* Flip card: front/back faces (no perforated edge — rendered above) */}
          <TicketFlipCard
            journey={journey}
            firstTake={firstTake ?? null}
            colors={colors}
            isDark={isDark}
            infoPageWidth={infoPageWidth}
            companionAvatarMap={companionAvatarMap}
          />

          {/* Generate AI Art Button - below flip card */}
          {!hasAiPoster && (
            <View style={styles.posterOptionsSection}>
              {tier === 'free' && hasUsedFreeTrial ? (
                <>
                  {/* Primary: Watch ad to earn a generation credit */}
                  <Pressable
                    style={[styles.generateArtButton, !adLoaded && styles.generateArtButtonDisabled]}
                    onPress={handleWatchAd}
                    disabled={!adLoaded || isGranting}
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                      <Path d="M15 10l4.553-2.277A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
                    </Svg>
                    <Text style={styles.generateArtButtonText}>
                      {!adLoaded ? 'Loading ad...' : 'Watch Ad for 1 Generation'}
                    </Text>
                  </Pressable>

                  {/* Secondary: Upgrade nudge */}
                  <Pressable
                    style={styles.upgradeNudge}
                    onPress={() => setUpgradeSheetVisible(true)}
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.tint} strokeWidth={2}>
                      <Path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </Svg>
                    <View style={styles.upgradeNudgeText}>
                      <Text style={styles.upgradeNudgeTitle}>Free AI poster used</Text>
                      <Text style={styles.upgradeNudgeSubtitle}>Upgrade to PocketStubs+ for unlimited AI art</Text>
                    </View>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}>
                      <Path d="M9 18l6-6-6-6" />
                    </Svg>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.generateArtButton}
                  onPress={handleGenerateArt}
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
                      <Text style={styles.generateArtButtonText}>
                        {tier === 'free' ? 'Generate AI Art (1 free trial)' : 'Generate AI Art'}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
          </View>
        </View>

      </ScrollView>

      {/* Poster Inspection Modal */}
      <PosterInspectionModal
        visible={isPosterModalVisible}
        imageUrl={heroPhotos[activeHeroPage] || ''}
        aiImageUrl={journey.ai_poster_url}
        movieTitle={journey.title}
        onClose={handlePosterModalClose}
      />

      {/* Upgrade prompt — shown when free AI poster limit is reached */}
      <UpgradePromptSheet
        visible={upgradeSheetVisible}
        featureKey="ai_poster_generation"
        onClose={() => setUpgradeSheetVisible(false)}
      />
    </View>
  );
}

// Create styles function that takes theme colors, ticket height, info page width, and theme
const createStyles = (colors: ThemeColors, ticketHeight: number, topInset: number, isDark: boolean) => StyleSheet.create({
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
    backgroundColor: colors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    minHeight: ticketHeight,
  },
  bottomSection: {
    overflow: 'hidden',
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
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

  // Hero Section
  heroSection: {
    height: 350,
    position: 'relative',
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
  locationBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  heroDots: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  heroDot: {},
  heroDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.tint,
  },
  heroDotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
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

  // Poster Options Section
  posterOptionsSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
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
  generateArtButtonDisabled: {
    opacity: 0.5,
  },
  upgradeNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upgradeNudgeText: {
    flex: 1,
  },
  upgradeNudgeTitle: {
    ...Typography.body.smMedium,
    color: colors.text,
  },
  upgradeNudgeSubtitle: {
    ...Typography.caption.default,
    color: colors.textSecondary,
    marginTop: 2,
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
