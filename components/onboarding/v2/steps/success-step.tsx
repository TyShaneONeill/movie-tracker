import { View, StyleSheet, InteractionManager } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { StubCard } from '@/components/onboarding/v2/shared/stub-card';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { useTour } from '@/lib/onboarding/tour-context';
import type { StepProps } from '@/components/onboarding/v2/types';

function MetaRow({ label, value }: { label: string; value: string }) {
  const colors = Colors.dark;
  return (
    <View style={styles.metaRow}>
      <ThemedText style={[styles.metaLabel, { color: colors.textTertiary }]}>{label}</ThemedText>
      <ThemedText style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>{value}</ThemedText>
    </View>
  );
}

export function SuccessStep(_props: StepProps) {
  const colors = Colors.dark;
  const insets = useSafeAreaInsets();
  const { data, commit, isSubmitting } = useOnboardingV2();
  const { startTourIfNotCompleted } = useTour();

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

  return (
    <View style={styles.container}>
      <View style={styles.stubWrap}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <StubCard
            topHeight={180}
            top={
              <View style={styles.top}>
                <ThemedText style={[styles.eyebrow, { color: colors.tint }]}>ADMIT ONE</ThemedText>
                <ThemedText style={[styles.welcome, { color: colors.text }]}>
                  Welcome, <ThemedText style={[styles.welcomeName, { color: colors.tint }]}>{data.name.trim() || 'friend'}</ThemedText>.
                </ThemedText>
                <ThemedText style={[styles.dynamic, { color: colors.textSecondary }]}>{dynamicLine}</ThemedText>
              </View>
            }
            bottom={
              <View style={styles.meta}>
                <MetaRow label="NAME" value={`${data.name.trim() || '—'}  @${data.handle || '—'}`} />
                <MetaRow label="GENRES" value={String(data.genres.length)} />
                <MetaRow label="WATCHLIST" value={String(count)} />
                <MetaRow label="STATUS" value="ACTIVE" />
              </View>
            }
          />
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <CTAButton label="Enter PocketStubs" onPress={handleEnter} loading={isSubmitting} icon="arrow-forward" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  stubWrap: { flex: 1, justifyContent: 'center' },
  top: { flex: 1, justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  eyebrow: { fontFamily: MONO_FONT, fontSize: 11, letterSpacing: 3 },
  welcome: { ...Typography.display.h2 },
  welcomeName: { ...Typography.display.h2, fontStyle: 'italic' },
  dynamic: { ...Typography.body.lgRegular },
  meta: { gap: Spacing.sm },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  metaLabel: { fontFamily: MONO_FONT, fontSize: 10, letterSpacing: 2 },
  metaValue: { fontFamily: MONO_FONT, fontSize: 13, flexShrink: 1, textAlign: 'right' },
  footer: { paddingTop: Spacing.md },
});
