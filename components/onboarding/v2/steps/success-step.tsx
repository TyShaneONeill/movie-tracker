import { useState } from 'react';
import { View, StyleSheet, InteractionManager } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { StubCard } from '@/components/onboarding/v2/shared/stub-card';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { useTour } from '@/lib/onboarding/tour-context';
import type { StepProps } from '@/components/onboarding/v2/types';
import { TvTimeImportCard } from '@/components/tvtime-import/tvtime-import-card';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';

function MetaCol({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const colors = Colors.dark;
  return (
    <View style={styles.metaCol}>
      <ThemedText style={[styles.metaLabel, { color: colors.textTertiary }]}>{label}</ThemedText>
      <ThemedText style={[styles.metaValue, { color: valueColor ?? colors.text }]} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

export function SuccessStep(_props: StepProps) {
  const colors = Colors.dark;
  const insets = useSafeAreaInsets();
  const { data, commit, isSubmitting } = useOnboardingV2();
  const { startTourIfNotCompleted } = useTour();
  const reduceMotion = useReducedMotion();
  const tvtime = useTvTimeImportGate();
  const [tvtimeDismissed, setTvtimeDismissed] = useState(false);
  // The "welcome stub" prints in: a springy drop from above. Reduced motion → fade.
  const stubEntering = reduceMotion
    ? FadeIn.duration(250)
    : FadeInDown.springify().damping(13).mass(0.9).stiffness(120);

  const count = data.watchlist.length;
  const dynamicLine =
    count > 0
      ? `${count} ${count === 1 ? 'film' : 'films'} queued up and ready.`
      : "Your seat's ready. Let's find your first film.";

  const handleEnter = async () => {
    const ok = await commit();
    if (!ok) {
      Toast.show({ type: 'error', text1: 'Something went wrong saving your profile', visibilityTime: 2500 });
      return;
    }
    router.replace('/(tabs)');
    InteractionManager.runAfterInteractions(() => startTourIfNotCompleted());
  };

  // Completion-screen entry to import. Commits onboarding first (never leaves
  // required steps unsaved), enters the app, then opens the import screen.
  const handleImportFromTvTime = async () => {
    const ok = await commit();
    if (!ok) {
      Toast.show({ type: 'error', text1: 'Something went wrong saving your profile', visibilityTime: 2500 });
      return;
    }
    router.replace('/(tabs)');
    InteractionManager.runAfterInteractions(() => router.push('/settings/tvtime-import'));
  };

  return (
    <View style={styles.container}>
      <View style={styles.stubWrap}>
        <Animated.View entering={stubEntering}>
          <StubCard
            radius={20}
            topHeight={230}
            top={
              <View style={styles.top}>
                <ThemedText style={[styles.eyebrow, { color: colors.tint }]}>ADMIT ONE</ThemedText>
                <ThemedText style={[styles.welcome, { color: colors.text }]}>
                  Welcome, <ThemedText style={[styles.welcome, styles.welcomeName, { color: colors.tint }]}>{data.name.trim() || 'friend'}</ThemedText>.
                </ThemedText>
                <ThemedText style={[styles.dynamic, { color: colors.textSecondary }]}>{dynamicLine}</ThemedText>
              </View>
            }
            bottom={
              <View style={styles.meta}>
                <MetaCol label="NAME" value={`@${data.handle || '—'}`} />
                <MetaCol label="GENRES" value={String(data.genres.length)} />
                <MetaCol label="WATCHLIST" value={String(count)} />
                <MetaCol label="STATUS" value="ACTIVE" valueColor={colors.tint} />
              </View>
            }
          />
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {tvtime.enabled && !tvtime.resolving && !tvtimeDismissed && (
          <TvTimeImportCard
            onPress={handleImportFromTvTime}
            onDismiss={() => setTvtimeDismissed(true)}
            style={styles.tvtimeCard}
          />
        )}
        <CTAButton label="Enter PocketStubs" onPress={handleEnter} loading={isSubmitting} icon="arrow-forward" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  stubWrap: { flex: 1, justifyContent: 'center' },
  top: { flex: 1, justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  eyebrow: { fontFamily: MONO_FONT, fontSize: 11, letterSpacing: 2 },
  welcome: { fontFamily: Fonts.outfit.extrabold, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 },
  welcomeName: {},
  dynamic: { ...Typography.body.lgRegular },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  metaCol: { gap: 3, flexShrink: 1 },
  metaLabel: { fontFamily: MONO_FONT, fontSize: 9, letterSpacing: 1.5 },
  metaValue: { fontFamily: MONO_FONT, fontSize: 12 },
  footer: { paddingTop: Spacing.md },
  tvtimeCard: { marginBottom: Spacing.md },
});
