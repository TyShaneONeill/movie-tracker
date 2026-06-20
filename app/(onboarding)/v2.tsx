import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';
import { analytics } from '@/lib/analytics';
import { OnboardingV2Provider } from '@/components/onboarding/v2/onboarding-v2-context';
import type { StepProps } from '@/components/onboarding/v2/types';
import { ProgressBar } from '@/components/onboarding/v2/shared/progress-bar';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';
import { WelcomeStep } from '@/components/onboarding/v2/steps/welcome-step';
import { GenresStep } from '@/components/onboarding/v2/steps/genres-step';
import { ErasStep } from '@/components/onboarding/v2/steps/eras-step';
import { WhereStep } from '@/components/onboarding/v2/steps/where-step';
import { MontageStep } from '@/components/onboarding/v2/steps/montage-step';
import { WatchlistStep } from '@/components/onboarding/v2/steps/watchlist-step';
import { ProfileStep } from '@/components/onboarding/v2/steps/profile-step';
import { SuccessStep } from '@/components/onboarding/v2/steps/success-step';

const STEPS = ['welcome', 'genres', 'eras', 'where', 'montage', 'watchlist', 'profile', 'success'] as const;
type StepKey = (typeof STEPS)[number];

const NUMBERED_TOTAL = 6; // genres..profile

function OnboardingV2Flow() {
  const colors = Colors.dark;
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  const stepKey: StepKey = STEPS[index];
  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, STEPS.length - 1)), []);
  const goBack = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Transition: forward = fade-up (~380ms), back = plain fade; reduced-motion =
  // opacity-only. `direction` reads prevIndex BEFORE the post-render effect
  // updates it, so it reflects the transition currently happening.
  const reduceMotion = useReducedMotion();
  const prevIndex = useRef(index);
  const goingForward = index >= prevIndex.current;
  useEffect(() => {
    prevIndex.current = index;
  }, [index]);
  const entering = reduceMotion
    ? FadeIn.duration(200)
    : goingForward
      ? FadeInUp.duration(380)
      : FadeIn.duration(260);

  // Per-step analytics so we can see drop-off points (variant-tagged).
  useEffect(() => {
    analytics.track('onboarding:step', { variant: 'v2', step: stepKey, index });
  }, [stepKey, index]);

  // index 1..6 are the numbered steps (genres..profile).
  const isNumbered = index >= 1 && index <= NUMBERED_TOTAL;
  const showBack = index > 0 && index < STEPS.length - 1;

  const stepProps: StepProps = { onNext: goNext, onBack: goBack };

  const renderStep = () => {
    switch (stepKey) {
      case 'welcome': return <WelcomeStep {...stepProps} />;
      case 'genres': return <GenresStep {...stepProps} />;
      case 'eras': return <ErasStep {...stepProps} />;
      case 'where': return <WhereStep {...stepProps} />;
      case 'montage': return <MontageStep {...stepProps} />;
      case 'watchlist': return <WatchlistStep {...stepProps} />;
      case 'profile': return <ProfileStep {...stepProps} />;
      case 'success': return <SuccessStep {...stepProps} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {(showBack || isNumbered) && (
        <View style={styles.headerRow}>
          {showBack ? (
            <Pressable onPress={goBack} hitSlop={12} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
          {isNumbered && (
            <View style={styles.progressWrap}>
              <ProgressBar current={index} total={NUMBERED_TOTAL} />
            </View>
          )}
          <View style={styles.backButton} />
        </View>
      )}

      <Animated.View key={index} entering={entering} style={styles.stepBody}>
        {renderStep()}
      </Animated.View>
    </View>
  );
}

export default function OnboardingV2Screen() {
  // Hardware-back / swipe-back is disabled via the parent Stack.Screen
  // (gestureEnabled: false); the flow advances linearly through the in-screen
  // back chevron and CTAs.
  return (
    <OnboardingV2Provider>
      <OnboardingV2Flow />
    </OnboardingV2Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: {
    flex: 1,
  },
  stepBody: {
    flex: 1,
  },
});
