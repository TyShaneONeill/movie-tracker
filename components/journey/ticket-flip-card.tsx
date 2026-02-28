/**
 * TicketFlipCard Component
 * Flippable bottom half of the journey ticket.
 * Front: title, rating, info carousel, notes, "tap to flip" hint.
 * Back: "ADMIT ONE" disclaimer, ticket ID, barcode visual.
 *
 * Uses Reanimated rotateY with backfaceVisibility: hidden for the flip.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
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
import { PerforatedEdge } from '@/components/ui/perforated-edge';
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

  return (
    <View>
      {/* Perforated edge stays fixed — does NOT flip */}
      <PerforatedEdge colors={colors} />

      {/* Flip wrapper */}
      <Pressable
        onPress={handleFlip}
        style={styles.flipWrapper}
        accessibilityRole="button"
        accessibilityLabel={isFlipped ? 'Flip ticket to front' : 'Flip ticket to see barcode'}
      >
        {/* Front face */}
        <Animated.View style={[styles.face, frontAnimatedStyle]}>
          {/* Title & Rating */}
          <View style={styles.titleSection}>
            <Text style={styles.movieTitle}>{journey.title}</Text>
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

          {/* Notes */}
          {journey.journey_notes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesText}>&ldquo;{journey.journey_notes}&rdquo;</Text>
            </View>
          )}

          {/* Tap-to-flip hint */}
          {showHint && (
            <View style={styles.hintRow}>
              <Text style={styles.hintText}>Tap to flip</Text>
            </View>
          )}
        </Animated.View>

        {/* Back face — absolutely positioned to fill */}
        <Animated.View style={[styles.face, styles.backFace, backAnimatedStyle]}>
          {/* ADMIT ONE disclaimer */}
          <Text style={styles.admitOneText}>
            ADMIT ONE{'\n'}NON-TRANSFERABLE{'\n'}SUBJECT TO TERMS
          </Text>

          {/* Ticket ID — monospace, rotated */}
          <View style={styles.backIdContainer}>
            <Text style={styles.backIdText}>{ticketId}</Text>
          </View>

          {/* Barcode */}
          <View style={styles.barcodeContainer}>
            <BarcodeVisual colors={colors} />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// --- Styles ---

const createFlipCardStyles = (colors: ThemeColors, isDark: boolean, infoPageWidth: number) =>
  StyleSheet.create({
    flipWrapper: {
      minHeight: 340,
    },

    // Shared face styles
    face: {
      paddingBottom: Spacing.lg,
    },
    backFace: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isDark ? '#1a1a24' : '#e8e8ed',
      borderBottomLeftRadius: BorderRadius.lg,
      borderBottomRightRadius: BorderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 0,
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
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
      borderRadius: BorderRadius.md,
      marginHorizontal: Spacing.md,
      marginTop: Spacing.md,
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

    // Notes
    notesSection: {
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      padding: Spacing.md,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
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

    // Hint
    hintRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Spacing.md,
      gap: 6,
    },
    hintText: {
      ...Typography.caption.medium,
      color: colors.textTertiary,
    },

    // Back face content
    admitOneText: {
      ...Typography.caption.medium,
      color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'right',
      lineHeight: 18,
      position: 'absolute',
      top: Spacing.lg,
      right: Spacing.lg,
    },
    backIdContainer: {
      position: 'absolute',
      left: Spacing.lg,
      bottom: Spacing.lg,
      transform: [{ rotate: '-90deg' }],
      transformOrigin: 'left bottom',
    },
    backIdText: {
      fontFamily: Platform.select({
        ios: 'Courier',
        android: 'monospace',
        web: '"Courier New", Courier, monospace',
      }),
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 3,
      color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
    },
    barcodeContainer: {
      position: 'absolute',
      bottom: Spacing.lg,
      right: Spacing.lg,
      opacity: 0.6,
    },
  });
