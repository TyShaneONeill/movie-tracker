/**
 * One card in the blank-stubs rating deck (mock frame 7). The deck ASKS — stars
 * start EMPTY, it never shows a pre-filled score (TV Time carries no ratings).
 *
 * Interaction, reusing the app's Pile-deck swipe primitives
 * (react-native-gesture-handler Pan + react-native-reanimated fly-off, seeded
 * tilt): tap a star (1–5) to rate → the card commits and flies right; swipe
 * left past threshold to SKIP → it flies left and re-surfaces later. Swiping
 * right only commits once a rating is chosen, otherwise it snaps back.
 *
 * The card is keyed by item in the parent, so each new item mounts fresh — no
 * rating leaks between cards (the keyed-singleton lesson, #662).
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, Spacing, BorderRadius, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { StarRating } from '@/components/ui/star-rating';
import { hapticSelection, hapticImpact } from '@/lib/haptics';
import { seededRotation, PILE } from '@/lib/lists-v2-logic';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

const SCREEN_W = Dimensions.get('window').width;
const FLY_OFF_X = SCREEN_W * 1.4;
const THROW_THRESHOLD = 90;
const EASE = Easing.bezier(0.2, 0.8, 0.3, 1);

interface DeckCardProps {
  item: DeckItem;
  reduced: boolean;
  disabled: boolean;
  onRate: (item: DeckItem, stars: number) => void;
  onSkip: (item: DeckItem) => void;
}

export function DeckCard({ item, reduced, disabled, onRate, onSkip }: DeckCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);

  const [stars, setStars] = useState(0);
  const dragX = useSharedValue(0);
  const flying = useSharedValue(0);

  const seededDeg = seededRotation(item.target.tmdbId) * PILE.jitter;

  const commitRate = (value: number) => {
    onRate(item, value);
  };
  const commitSkip = () => {
    onSkip(item);
  };

  const flyOff = (direction: 'left' | 'right', done: () => void) => {
    'worklet';
    const target = direction === 'right' ? FLY_OFF_X : -FLY_OFF_X;
    if (reduced) {
      runOnJS(done)();
      return;
    }
    flying.value = 1;
    dragX.value = withTiming(target, { duration: PILE.throwMs, easing: EASE }, (finished) => {
      if (finished) runOnJS(done)();
    });
  };

  const handleStarChange = (value: number) => {
    if (disabled || value <= 0) return;
    setStars(value);
    runOnJS(hapticSelection)();
    // Brief beat so the filled stars register, then commit + fly right.
    setTimeout(() => {
      flyOff('right', () => commitRate(value));
    }, 240);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-18, 18])
    .onUpdate((e) => {
      if (flying.value) return;
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      if (flying.value) return;
      if (e.translationX < -THROW_THRESHOLD) {
        flyOff('left', () => {
          runOnJS(hapticImpact)();
          commitSkip();
        });
      } else if (e.translationX > THROW_THRESHOLD && stars > 0) {
        flyOff('right', () => commitRate(stars));
      } else {
        dragX.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rot = seededDeg + dragX.value / 22;
    return {
      opacity: 1 - flying.value * 0.15,
      transform: [{ translateX: dragX.value }, { rotate: `${rot}deg` }],
    };
  });

  // Left (skip) / right (rate) intent hints fade in as the card is dragged.
  const skipHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [-THROW_THRESHOLD, -20, 0], [1, 0, 0], Extrapolation.CLAMP),
  }));
  const rateHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragX.value, [0, 20, THROW_THRESHOLD], [0, 0, stars > 0 ? 1 : 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Animated.View style={[styles.hint, styles.hintLeft, skipHintStyle]}>
          <Text style={styles.hintText}>SKIP</Text>
        </Animated.View>
        <Animated.View style={[styles.hint, styles.hintRight, rateHintStyle]}>
          <Text style={[styles.hintText, { color: colors.tint }]}>RATE</Text>
        </Animated.View>

        <Text style={styles.film} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta}>
          {item.year ? `${item.year} · ` : ''}watched via TV Time import
        </Text>

        <View style={styles.perforation}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={styles.perfDot} />
          ))}
        </View>

        <View style={styles.ratingBlock}>
          <Text style={styles.ratingLabel}>
            {stars > 0 ? 'YOUR RATING' : 'YOUR RATING — NOT SET'}
          </Text>
          <StarRating rating={stars} onRatingChange={handleStarChange} size={40} disabled={disabled} />
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => !disabled && flyOff('left', () => { hapticImpact(); commitSkip(); })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${item.title}`}
          >
            <Text style={styles.footerText}>← SKIP</Text>
          </Pressable>
          <Text style={styles.footerText}>TAP TO RATE</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    card: {
      width: '84%',
      aspectRatio: 2 / 2.5,
      alignSelf: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
      justifyContent: 'flex-start',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.4,
      shadowRadius: 30,
      elevation: 12,
    },
    hint: {
      position: 'absolute',
      top: Spacing.md,
      borderWidth: 2,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    hintLeft: { left: Spacing.md, borderColor: colors.textSecondary, transform: [{ rotate: '-12deg' }] },
    hintRight: { right: Spacing.md, borderColor: colors.tint, transform: [{ rotate: '12deg' }] },
    hintText: {
      ...Typography.body.xs,
      fontFamily: Fonts.inter.semibold,
      letterSpacing: 1,
      color: colors.textSecondary,
    },
    film: {
      ...Typography.display.h3,
      color: colors.text,
      textTransform: 'uppercase',
      marginTop: Spacing.sm,
    },
    meta: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      marginTop: 6,
    },
    // Ticket perforation: a row of dots (iOS ignores dashed/dotted borders — the
    // standing RN gotcha — so we draw the dots ourselves).
    perforation: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: Spacing.lg,
      marginBottom: Spacing.lg,
      overflow: 'hidden',
    },
    perfDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    ratingBlock: {
      marginTop: 'auto',
      marginBottom: Spacing.lg,
      alignItems: 'center',
      gap: Spacing.md,
    },
    ratingLabel: {
      ...Typography.body.xs,
      fontFamily: Fonts.inter.semibold,
      letterSpacing: 1.5,
      color: colors.textSecondary,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerText: {
      ...Typography.body.xs,
      fontFamily: Fonts.inter.semibold,
      letterSpacing: 1.5,
      color: colors.textTertiary,
    },
  });
