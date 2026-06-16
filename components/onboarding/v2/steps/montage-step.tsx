import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import type { StepProps } from '@/components/onboarding/v2/types';

const BEAT_MS = 4500;

const BEATS = [
  { key: 'scan', copy: 'Scan your ticket — we log the showing instantly.' },
  { key: 'take', copy: 'Capture your first take the moment the credits roll.' },
  { key: 'stats', copy: 'Watch your taste come into focus over time.' },
] as const;

function ScanMock() {
  const colors = Colors.dark;
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [y]);
  const lineStyle = useAnimatedStyle(() => ({ top: `${10 + y.value * 70}%` }));
  return (
    <View style={[styles.mock, { borderColor: colors.tint }]}>
      <Ionicons name="ticket-outline" size={56} color={colors.textTertiary} />
      <Animated.View style={[styles.scanLine, { backgroundColor: colors.tint }, lineStyle]} />
      <View style={[styles.cornerTL, { borderColor: colors.tint }]} />
      <View style={[styles.cornerBR, { borderColor: colors.tint }]} />
    </View>
  );
}

function TakeMock() {
  const colors = Colors.dark;
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <View style={styles.mockPlain}>
      <View style={[styles.bubble, { backgroundColor: colors.card }]}>
        <ThemedText style={[styles.bubbleText, { color: colors.text }]}>That ending wrecked me…</ThemedText>
      </View>
      <View style={styles.waveform}>
        {bars.map((i) => (
          <WaveBar key={i} index={i} />
        ))}
      </View>
    </View>
  );
}

function WaveBar({ index }: { index: number }) {
  const colors = Colors.dark;
  const h = useSharedValue(0.3);
  useEffect(() => {
    h.value = withDelay(
      index * 120,
      withRepeat(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [h, index]);
  const style = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return <Animated.View style={[styles.waveBar, { backgroundColor: colors.tint }, style]} />;
}

function StatsMock() {
  const colors = Colors.dark;
  const heights = [0.5, 0.8, 0.35, 1, 0.65];
  return (
    <View style={styles.mockPlain}>
      <View style={styles.chart}>
        {heights.map((target, i) => (
          <StatBar key={i} target={target} index={i} />
        ))}
      </View>
      <ThemedText style={[styles.chartLabel, { color: colors.textTertiary }]}>Your genre split</ThemedText>
    </View>
  );
}

function StatBar({ target, index }: { target: number; index: number }) {
  const colors = Colors.dark;
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(index * 150, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [h, target, index]);
  const style = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return <Animated.View style={[styles.statBar, { backgroundColor: index % 2 ? colors.tint : colors.gold }, style]} />;
}

export function MontageStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const [beat, setBeat] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setBeat((b) => (b + 1) % BEATS.length), BEAT_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const jumpTo = (i: number) => {
    setBeat(i);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setBeat((b) => (b + 1) % BEATS.length), BEAT_MS);
  };

  return (
    <StepLayout
      title="Everything in one place"
      subtitle="A quick look at what you can do."
      footer={<CTAButton label="Continue" onPress={onNext} />}
    >
      <View style={styles.window}>
        {beat === 0 && <ScanMock />}
        {beat === 1 && <TakeMock />}
        {beat === 2 && <StatsMock />}
      </View>

      <ThemedText style={[styles.copy, { color: colors.textSecondary }]}>{BEATS[beat].copy}</ThemedText>

      <View style={styles.dots}>
        {BEATS.map((b, i) => (
          <Pressable key={b.key} onPress={() => jumpTo(i)} hitSlop={8}>
            <View
              style={[
                styles.dot,
                { backgroundColor: i === beat ? colors.tint : colors.border, width: i === beat ? 24 : 8 },
              ]}
            />
          </Pressable>
        ))}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  window: {
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#0d0d11',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  mock: {
    width: '70%',
    height: '70%',
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockPlain: { width: '80%', height: '70%', justifyContent: 'center', gap: Spacing.lg },
  scanLine: { position: 'absolute', left: '8%', right: '8%', height: 2, opacity: 0.9 },
  cornerTL: { position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerBR: { position: 'absolute', bottom: 8, right: 8, width: 18, height: 18, borderBottomWidth: 3, borderRightWidth: 3 },
  bubble: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderBottomLeftRadius: 4 },
  bubbleText: { ...Typography.body.baseMedium },
  waveform: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 48 },
  waveBar: { flex: 1, borderRadius: 2, minHeight: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, gap: Spacing.sm },
  statBar: { flex: 1, borderRadius: 4, minHeight: 4 },
  chartLabel: { ...Typography.body.xs, textAlign: 'center' },
  copy: { ...Typography.body.lgRegular, textAlign: 'center', marginTop: Spacing.lg, minHeight: 52 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md },
  dot: { height: 8, borderRadius: 4 },
});
