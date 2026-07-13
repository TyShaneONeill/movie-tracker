/**
 * One card in the Watchlist swipe deck (contract A2). Owns its layout position
 * as a shared value so the pile RISES when the order cycles; the top card adds a
 * drag + fly-off. Rotation is seeded per item id (deterministic — no shimmer on
 * re-render, the tear-line lesson). Feel constants come from PILE (locked).
 */

import { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { seededRotation, PILE } from '@/lib/lists-v2-logic';

const SCREEN_W = Dimensions.get('window').width;
export const DECK_CARD_W = 156;
export const DECK_CARD_H = 234;
const FLY_OFF_X = SCREEN_W * 1.4;
const EASE = Easing.bezier(0.2, 0.8, 0.3, 1);

export interface DeckItem {
  key: string;
  tmdbId: number;
  posterPath: string | null;
  media?: MediaKind;
  title?: string;
}

type MediaKind = 'movie' | 'tv';

interface PileCardProps {
  item: DeckItem;
  /** Position in the pile (0 = top). Drives layout; animates on change (rise). */
  pos: number;
  isTop: boolean;
  reduced: boolean;
  /** Fires after the top card flies off (or immediately when reduced) — cycle. */
  onThrow: () => void;
  onTap: (item: DeckItem) => void;
  cardColor: string;
  borderColor: string;
}

export function PileCard({
  item,
  pos,
  isTop,
  reduced,
  onThrow,
  onTap,
  cardColor,
  borderColor,
}: PileCardProps) {
  const layoutPos = useSharedValue(pos);
  const dragX = useSharedValue(0);
  const flying = useSharedValue(0); // 0..1 fly-off progress (top card only)

  // Animate to the new pile position when the order cycles — this is the rise.
  useEffect(() => {
    if (reduced) {
      layoutPos.value = pos;
    } else {
      layoutPos.value = withTiming(pos, { duration: PILE.throwMs, easing: EASE });
    }
  }, [pos, reduced, layoutPos]);

  const seededDeg = seededRotation(item.tmdbId) * PILE.jitter;

  const animatedStyle = useAnimatedStyle(() => {
    // Depth layout: rise (translateY), recede (scale), fade (opacity).
    const p = layoutPos.value;
    const translateY = -p * PILE.peek;
    const scale = 1 - p * 0.03;
    const opacity = interpolate(p, [0, PILE.depth, PILE.depth + 1], [1, 1 - PILE.depth * 0.09, 0], Extrapolation.CLAMP);
    // Rotation: 0 at the very top, full seeded jitter behind (clamped by pos).
    const layoutRot = seededDeg * interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP);

    // Drag + fly-off only meaningfully move the top card.
    const dragRot = dragX.value / 18;
    const flyX = flying.value * (dragX.value >= 0 ? FLY_OFF_X : -FLY_OFF_X);
    const flyRot = flying.value * (dragX.value >= 0 ? 24 : -24);

    return {
      opacity: opacity * (1 - flying.value),
      transform: [
        { translateX: dragX.value + flyX },
        { translateY },
        { rotate: `${layoutRot + dragRot + flyRot}deg` },
        { scale },
      ],
    };
  });

  const finishThrow = () => {
    dragX.value = 0;
    flying.value = 0;
    onThrow();
  };

  const pan = Gesture.Pan()
    .enabled(isTop)
    // Activate only on horizontal intent so vertical scrolls pass through to the
    // enclosing list (the deck must never trap the page scroll).
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      dragX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > PILE.throwThreshold) {
        if (reduced) {
          runOnJS(finishThrow)();
        } else {
          flying.value = withTiming(1, { duration: PILE.throwMs, easing: EASE }, (done) => {
            if (done) runOnJS(finishThrow)();
          });
        }
      } else {
        dragX.value = withTiming(0, { duration: PILE.throwMs, easing: EASE });
      }
    });

  const tap = Gesture.Tap()
    .enabled(isTop)
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success) runOnJS(onTap)(item);
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const posterUrl = getTMDBImageUrl(item.posterPath, 'w500');

  // Always wrap in GestureDetector (toggle via .enabled) so the top<->non-top
  // transition never restructures the tree — a remount would reset the shared
  // values and snap the rise. Non-top cards are pointerEvents:none so touches
  // pass through to the top card.
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        pointerEvents={isTop ? 'auto' : 'none'}
        style={[styles.card, { backgroundColor: cardColor, borderColor, zIndex: 100 - pos }, animatedStyle]}
        accessibilityRole={isTop ? 'button' : undefined}
        accessibilityLabel={
          isTop ? `${item.title ?? 'Top of your watchlist pile'}. Tap to open, swipe to shuffle.` : undefined
        }
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 0, // anchored to the stage floor; the pile rises upward into headroom
    left: 0,
    width: DECK_CARD_W,
    height: DECK_CARD_H,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
});
