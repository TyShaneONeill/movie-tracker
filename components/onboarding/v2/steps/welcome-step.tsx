import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { StubCard } from '@/components/onboarding/v2/shared/stub-card';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import type { StepProps } from '@/components/onboarding/v2/types';

function SpinningReel() {
  const colors = Colors.dark;
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 9000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name="film-outline" size={40} color={colors.tint} />
    </Animated.View>
  );
}

function formatToday(): string {
  const d = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')} ${d.getFullYear()}`;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  const colors = Colors.dark;
  return (
    <View style={styles.metaItem}>
      <ThemedText style={[styles.metaLabel, { color: colors.textTertiary }]}>{label}</ThemedText>
      <ThemedText style={[styles.metaValue, { color: colors.text }]}>{value}</ThemedText>
    </View>
  );
}

export function WelcomeStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const insets = useSafeAreaInsets();
  // Cosmetic generated stub number (not persisted).
  const [stubNo] = useState(() => String(Math.floor(10000 + Math.random() * 89999)));

  return (
    <View style={styles.container}>
      <View style={styles.stubWrap}>
        <StubCard
          topHeight={260}
          top={
            <View style={styles.top}>
              <ThemedText style={[styles.eyebrow, { color: colors.tint }]}>POCKETSTUBS</ThemedText>
              <SpinningReel />
              <View style={styles.hero}>
                <ThemedText style={[styles.heroLine, { color: colors.text }]}>WELCOME TO THE</ThemedText>
                <ThemedText style={[styles.heroShow, { color: colors.tint }]}>show.</ThemedText>
              </View>
            </View>
          }
          bottom={
            <View>
              <ThemedText style={[styles.tonight, { color: colors.text }]}>Tonight.</ThemedText>
              <View style={styles.metaRow}>
                <MetaItem label="NO." value={stubNo} />
                <MetaItem label="DATE" value={formatToday()} />
                <MetaItem label="SEAT" value="A1" />
              </View>
            </View>
          }
        />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <CTAButton label="Start your journey" onPress={onNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  stubWrap: { flex: 1, justifyContent: 'center' },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg },
  eyebrow: { fontFamily: MONO_FONT, fontSize: 12, letterSpacing: 4 },
  hero: { alignItems: 'center' },
  heroLine: { ...Typography.display.h2, letterSpacing: 1 },
  heroShow: { ...Typography.display.h1, fontStyle: 'italic' },
  tonight: { ...Typography.display.h3, fontStyle: 'italic', marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaItem: { gap: 2 },
  metaLabel: { fontFamily: MONO_FONT, fontSize: 10, letterSpacing: 2 },
  metaValue: { fontFamily: MONO_FONT, fontSize: 13 },
  footer: { paddingTop: Spacing.md },
});
