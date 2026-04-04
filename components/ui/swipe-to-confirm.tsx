import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { hapticNotification, NotificationFeedbackType } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';

const PUCK_SIZE = 48;
const TRACK_HEIGHT = 56;
const TRACK_PADDING = 4;
const THRESHOLD = 0.85;

export interface SwipeToConfirmProps {
  label: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}

export function SwipeToConfirm({ label, onConfirm, disabled = false }: SwipeToConfirmProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [isLoading, setIsLoading] = useState(false);

  const trackWidthSV = useSharedValue(0);
  const puckX = useSharedValue(0);
  const isTriggered = useSharedValue(false);

  const handleConfirm = useCallback(async () => {
    hapticNotification(NotificationFeedbackType.Success);
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
      isTriggered.value = false;
      puckX.value = withSpring(0);
    }
  }, [onConfirm, isTriggered, puckX]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !isLoading)
    .onUpdate((e) => {
      if (isTriggered.value) return;
      const maxT = trackWidthSV.value - PUCK_SIZE - TRACK_PADDING * 2;
      puckX.value = Math.max(0, Math.min(e.translationX, maxT));
    })
    .onEnd(() => {
      if (isTriggered.value) return;
      const maxT = trackWidthSV.value - PUCK_SIZE - TRACK_PADDING * 2;
      if (maxT > 0 && puckX.value / maxT >= THRESHOLD) {
        isTriggered.value = true;
        puckX.value = withSpring(maxT);
        runOnJS(handleConfirm)();
      } else {
        puckX.value = withSpring(0);
      }
    });

  const puckStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: puckX.value }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const maxT = trackWidthSV.value - PUCK_SIZE - TRACK_PADDING * 2;
    const progress = maxT > 0 ? puckX.value / maxT : 0;
    return {
      width: puckX.value + PUCK_SIZE + TRACK_PADDING,
      opacity: interpolate(progress, [0, 0.02, 1], [0, 0.35, 1], Extrapolation.CLAMP),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.track,
          { backgroundColor: colors.backgroundSecondary },
          disabled && styles.trackDisabled,
        ]}
        onLayout={(e) => {
          trackWidthSV.value = e.nativeEvent.layout.width;
        }}
      >
        {/* Progress fill */}
        <Animated.View
          style={[styles.fill, { backgroundColor: colors.tint }, fillStyle]}
        />

        {/* Centered label — passes touches through to GestureDetector */}
        <View style={styles.labelWrapper} pointerEvents="none">
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {isLoading ? 'Adding episodes...' : label}
          </Text>
        </View>

        {/* Draggable puck */}
        <Animated.View
          style={[styles.puck, { backgroundColor: colors.tint }, puckStyle]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.chevronText}>{'»'}</Text>
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  trackDisabled: {
    opacity: 0.5,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  labelWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: PUCK_SIZE + TRACK_PADDING + 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  puck: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    borderRadius: PUCK_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
});
