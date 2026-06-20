import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { MONO_FONT } from './mono';

interface ProgressBarProps {
  /** 1-based step number (1..total). */
  current: number;
  total: number;
}

/**
 * Thin top progress bar with a "STEP 0N / 0M" mono label.
 * The filled width animates as the user advances.
 */
export function ProgressBar({ current, total }: ProgressBarProps) {
  const colors = Colors.dark; // onboarding is always dark
  const progress = useSharedValue(current / total);

  useEffect(() => {
    progress.value = withTiming(current / total, { duration: 380 });
  }, [current, total, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <ThemedText style={[styles.label, { color: colors.textTertiary }]}>
          STEP {pad(current)} / {pad(total)}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.card }]}>
        <Animated.View
          style={[styles.fill, { backgroundColor: colors.tint }, fillStyle]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
  },
  label: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    letterSpacing: 2,
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
});
