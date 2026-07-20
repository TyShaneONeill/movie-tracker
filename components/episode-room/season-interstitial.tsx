/**
 * Season-crossing interstitial — a brief ink-stamp flourish shown when episode
 * nav in the room actually crosses a season boundary (e.g. a season finale into
 * the next premiere). A centered "SEASON N" stamp scales + fades in, holds,
 * then fades out (~700ms total). Same aesthetic as RatingStamp: a −6° ring in
 * colors.tint with letterspaced caps.
 *
 * Never blocks input (pointerEvents="none") and only plays when `season` is
 * non-null — the room sets it exclusively on a cross-season hop, so it never
 * fires on same-season nav or on initial mount. A new crossing replaces an
 * in-flight one cleanly: the effect re-runs on the new season value, stops the
 * prior animation, and restarts from zero.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text, Easing } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface SeasonInterstitialProps {
  /** Non-null triggers one play; the parent clears it via `onDone`. */
  season: number | null;
  onDone: () => void;
}

const IN_MS = 220;
const HOLD_MS = 260;
const OUT_MS = 220;

export function SeasonInterstitial({ season, onDone }: SeasonInterstitialProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (season == null) return;
    progress.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(progress, {
        toValue: 0,
        duration: OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => anim.stop();
  }, [season, progress, onDone]);

  if (season == null) return null;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.stamp,
          { borderColor: colors.tint, opacity: progress, transform: [{ rotate: '-6deg' }, { scale }] },
        ]}
      >
        <Text style={[styles.text, { color: colors.tint }]}>SEASON {season}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  text: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
  },
});
