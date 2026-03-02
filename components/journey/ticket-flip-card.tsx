/**
 * TicketFlipCard Component
 * Flippable bottom half of the journey ticket.
 * Front: title, rating, info carousel, "tap to flip" hint.
 * Back: "ADMIT ONE" disclaimer, ticket ID, barcode visual.
 *
 * Uses Reanimated rotateY with backfaceVisibility: hidden for the flip.
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Rect } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import type { UserMovie, FirstTake } from '@/lib/database.types';

type ThemeColors = typeof Colors.dark;

// --- Helpers ---

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeString: string | null): string {
  if (!timeString) return 'Not set';
  const [hours, minutes] = timeString.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function formatWatchFormat(format: string | null): string {
  if (!format) return 'Not set';
  return format.toUpperCase();
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return 'Not set';
  return `$${price.toFixed(2)}`;
}

// --- BarcodeVisual ---

function BarcodeVisual({ colors }: { colors: ThemeColors }) {
  const barWidths = [
    2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1,
    1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1,
    3, 1, 2, 1, 1, 3, 2, 1,
  ];

  return (
    <Svg height={45} width={176} viewBox="0 0 176 45">
      {barWidths.map((width, index) => {
        const x = barWidths.slice(0, index).reduce((sum, w) => sum + w + 2, 0);
        if (x + width > 176) return null;
        return (
          <Rect
            key={index}
            x={x}
            y={0}
            width={width}
            height={45}
            fill={colors.textSecondary}
          />
        );
      })}
    </Svg>
  );
}

// --- Flip hint persistence ---

const FLIP_HINT_KEY = 'journey_flip_hint_views';
const FLIP_HINT_MAX_VIEWS = 3;

function useFlipHint() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FLIP_HINT_KEY);
        const count = raw ? parseInt(raw, 10) : 0;
        if (count < FLIP_HINT_MAX_VIEWS) {
          setShowHint(true);
          await AsyncStorage.setItem(FLIP_HINT_KEY, String(count + 1));
        }
      } catch {
        // Silently ignore storage errors
      }
    })();
  }, []);

  return showHint;
}

// --- Props ---

export interface TicketFlipCardProps {
  journey: UserMovie;
  firstTake: FirstTake | null;
  colors: ThemeColors;
  isDark: boolean;
  infoPageWidth: number;
  companionAvatarMap?: Map<string, string | null>;
}

// --- Tap detection ---
// A touch is considered a "tap" (not a swipe) when the finger moves
// less than this threshold and the duration is short.
const TAP_MOVE_THRESHOLD = 10;
const TAP_DURATION_MS = 300;

// --- Component ---

export function TicketFlipCard({
  journey,
  firstTake,
  colors,
  isDark,
  infoPageWidth,
  companionAvatarMap,
}: TicketFlipCardProps) {
  const rotation = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [infoPageIndex, setInfoPageIndex] = useState(0);
  const showHint = useFlipHint();

  // Track touch start to distinguish taps from swipes
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const styles = useMemo(
    () => createFlipCardStyles(colors, isDark, infoPageWidth),
    [colors, isDark, infoPageWidth],
  );

  const handleFlip = useCallback(() => {
    const target = isFlipped ? 0 : 180;
    rotation.value = withTiming(target, {
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    setIsFlipped(!isFlipped);
  }, [isFlipped, rotation]);

  const handleTouchStart = useCallback((e: { nativeEvent: { pageX: number; pageY: number } }) => {
    touchStartRef.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      const start = touchStartRef.current;
      if (!start) return;

      const dx = Math.abs(e.nativeEvent.pageX - start.x);
      const dy = Math.abs(e.nativeEvent.pageY - start.y);
      const elapsed = Date.now() - start.time;

      if (dx < TAP_MOVE_THRESHOLD && dy < TAP_MOVE_THRESHOLD && elapsed < TAP_DURATION_MS) {
        handleFlip();
      }

      touchStartRef.current = null;
    },
    [handleFlip],
  );

  const handleInfoScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / infoPageWidth);
      setInfoPageIndex(pageIndex);
    },
    [infoPageWidth],
  );

  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${rotation.value}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${rotation.value + 180}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const ticketId = journey.ticket_id || 'CNTK-' + journey.id.slice(0, 8).toUpperCase();

  // Shared content for both faces + hint (rendered inside the flip wrapper)
  const flipContent = (
    <>
      {/* Front face */}
      <Animated.View style={[styles.face, frontAnimatedStyle]}>
        {/* Title & Rating */}
        <View style={styles.titleSection}>
          <Text style={styles.movieTitle}>{journey.title}</Text>
          {firstTake?.rating && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingText}>
                {firstTake.rating.toFixed(1)}
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
                  {journey.watched_with?.length ? (
                    <View style={styles.companionList}>
                      {journey.watched_with.map((name, i) => {
                        const avatarUrl = companionAvatarMap?.get(name.toLowerCase());
                        return (
                          <View key={i} style={styles.companionItem}>
                            {avatarUrl ? (
                              <ExpoImage
                                source={{ uri: avatarUrl }}
                                style={styles.companionAvatar}
                                contentFit="cover"
                                transition={200}
                              />
                            ) : null}
                            <Text style={styles.infoValue}>{name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>Solo</Text>
                  )}
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

      </Animated.View>

      {/* Back face — absolutely positioned to fill */}
      <Animated.View style={[styles.face, styles.backFace, backAnimatedStyle]}>
        {/* Large rotated ticket number on the left edge */}
        <View style={styles.backIdRotatedContainer}>
          <Text style={styles.backIdRotatedText}>
            #{journey.id.slice(0, 6).toUpperCase()}
          </Text>
        </View>

        {/* Disclaimer text — upper right */}
        <Text style={styles.admitOneText}>
          {'ADMIT ONE\nNON-TRANSFERABLE\nSUBJECT TO TERMS'}
        </Text>

        {/* Monospace ticket ID — middle right */}
        <Text style={styles.backIdText}>{ticketId}</Text>

        {/* Wide barcode — bottom right */}
        <View style={styles.barcodeContainer}>
          <BarcodeVisual colors={colors} />
        </View>
      </Animated.View>

      {/* Tap-to-flip hint — inside the flip wrapper so tapping it flips */}
      {showHint && (
        <View style={styles.hintRow}>
          <View style={styles.hintPill}>
            <Text style={styles.hintText}>Tap to flip</Text>
          </View>
        </View>
      )}
    </>
  );

  const a11yLabel = isFlipped ? 'Flip ticket to front' : 'Flip ticket to see barcode';

  return (
    <View>
      {/* Web: Pressable with onPress — doesn't interfere with nested ScrollView scrolling.
          Native: View with manual touch detection (onTouchStart/onTouchEnd) — preserves
          the responder-based swipe discrimination that Pressable can break on native. */}
      {Platform.OS === 'web' ? (
        <Pressable
          style={styles.flipWrapper}
          onPress={handleFlip}
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
        >
          {flipContent}
        </Pressable>
      ) : (
        <View
          style={styles.flipWrapper}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
        >
          {flipContent}
        </View>
      )}
    </View>
  );
}

// --- Styles ---

const createFlipCardStyles = (colors: ThemeColors, isDark: boolean, infoPageWidth: number) =>
  StyleSheet.create({
    flipWrapper: {
    },

    // Shared face styles
    face: {
    },
    backFace: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      borderBottomLeftRadius: BorderRadius.lg,
      borderBottomRightRadius: BorderRadius.lg,
      overflow: 'hidden',
    },

    // Title Section
    titleSection: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
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
    taglineText: {
      ...Typography.body.base,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },

    // Info Carousel
    infoCarouselContainer: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.35)',
      borderRadius: BorderRadius.md,
      marginHorizontal: Spacing.md,
      marginTop: Spacing.sm,
      overflow: 'hidden',
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
    companionList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      alignItems: 'center',
    },
    companionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    companionAvatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: Spacing.xs,
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

    // Hint
    hintRow: {
      alignItems: 'center',
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    hintPill: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    hintText: {
      ...Typography.caption.medium,
      color: colors.textTertiary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontSize: 11,
    },

    // Back face content

    // Large rotated ticket number on the left edge
    backIdRotatedContainer: {
      position: 'absolute',
      left: 40,
      bottom: 16,
      transformOrigin: 'left bottom',
      transform: [{ rotate: '-90deg' }],
    },
    backIdRotatedText: {
      fontFamily: Platform.select({
        ios: 'Courier',
        android: 'monospace',
        web: '"Courier New", Courier, monospace',
      }),
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 4,
      color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
    },

    // "ADMIT ONE / NON-TRANSFERABLE / SUBJECT TO TERMS" — upper right
    admitOneText: {
      position: 'absolute',
      bottom: 100,
      right: 20,
      textAlign: 'right',
      fontSize: 10,
      letterSpacing: 0.5,
      lineHeight: 15,
      color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)',
      textTransform: 'uppercase',
      fontFamily: Platform.select({
        ios: 'Courier',
        android: 'monospace',
        web: '"Courier New", Courier, monospace',
      }),
    },

    // Monospace ticket ID — middle right area
    backIdText: {
      position: 'absolute',
      right: 20,
      bottom: 80,
      fontFamily: Platform.select({
        ios: 'Courier',
        android: 'monospace',
        web: '"Courier New", Courier, monospace',
      }),
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 2,
      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)',
    },

    // Wide barcode — bottom right
    barcodeContainer: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      alignItems: 'flex-end',
      opacity: 0.5,
    },
  });
