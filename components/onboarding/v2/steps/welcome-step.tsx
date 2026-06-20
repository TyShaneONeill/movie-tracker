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
import { Colors, Spacing, Fonts } from '@/constants/theme';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { StubCard } from '@/components/onboarding/v2/shared/stub-card';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import type { StepProps } from '@/components/onboarding/v2/types';

function SpinningReel() {
  const colors = Colors.dark;
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 7000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name="aperture-outline" size={30} color={colors.textTertiary} />
    </Animated.View>
  );
}

function formatToday(): string {
  const d = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[d.getMonth()]} ${d.getDate()} · ${String(d.getFullYear()).slice(-2)}`;
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
  // Cosmetic generated stub number (not persisted) — NNNN-L format.
  const [stubNo] = useState(() => {
    const n = Math.floor(1000 + Math.random() * 8999);
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return `${n}-${letter}`;
  });

  return (
    <View style={styles.container}>
      <View style={styles.stubWrap}>
        <StubCard
          radius={22}
          topFlex
          top={
            <View style={styles.top}>
              <View style={styles.brandRow}>
                <ThemedText style={[styles.brand, { color: colors.tint }]}>POCKETSTUBS</ThemedText>
                <SpinningReel />
              </View>
              <View style={styles.hero}>
                <ThemedText style={[styles.heroEyebrow, { color: colors.textTertiary }]}>
                  WELCOME TO THE
                </ThemedText>
                <View style={styles.heroLine}>
                  <ThemedText style={[styles.heroShow, styles.italicWord, { color: colors.tint }]}>
                    show
                  </ThemedText>
                  <ThemedText style={[styles.heroShow, { color: colors.text }]}>.</ThemedText>
                </View>
              </View>
            </View>
          }
          bottom={
            <View>
              <View style={styles.tonightLine}>
                <ThemedText style={[styles.tonight, styles.italicWord, { color: colors.tint }]}>
                  Tonight
                </ThemedText>
                <ThemedText style={[styles.tonight, { color: colors.text }]}>.</ThemedText>
              </View>
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
  container: { flex: 1, paddingHorizontal: Spacing.lg },
  stubWrap: { flex: 1, paddingTop: 64, paddingBottom: Spacing.lg },
  top: { flex: 1, justifyContent: 'space-between', padding: Spacing.lg },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: MONO_FONT, fontSize: 10, letterSpacing: 2.5 },
  hero: {},
  heroEyebrow: { fontFamily: MONO_FONT, fontSize: 11, letterSpacing: 1.8, marginBottom: 4 },
  heroLine: { flexDirection: 'row', alignItems: 'flex-end' },
  heroShow: { fontFamily: Fonts.outfit.extrabold, fontSize: 82, lineHeight: 78, letterSpacing: -3 },
  italicWord: { transform: [{ skewX: '-11deg' }] },
  tonightLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: Spacing.md },
  tonight: { fontFamily: Fonts.outfit.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaItem: { gap: 2 },
  metaLabel: { fontFamily: MONO_FONT, fontSize: 9, letterSpacing: 2 },
  metaValue: { fontFamily: MONO_FONT, fontSize: 11 },
  footer: { paddingTop: Spacing.md },
});
