import { Redirect } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { OnboardingV1Carousel } from '@/components/onboarding/onboarding-v1-carousel';
import { useOnboardingVariant } from '@/hooks/use-onboarding-variant';

/**
 * Onboarding entry gate.
 *
 * Resolves the `onboarding_v2` PostHog flag and branches:
 *   - v2 (beta testers) -> redirect into the new cinematic flow.
 *   - v1 (everyone else / default) -> the existing 5-slide carousel.
 *
 * While the flag is still resolving we render a neutral dark screen (the root
 * layout already shows a spinner during auth load) to avoid flashing v1 and
 * snapping to v2 for a tester.
 */
export default function OnboardingIndex() {
  const { variant, resolving } = useOnboardingVariant();

  if (resolving) {
    return <ThemedView style={{ flex: 1 }} />;
  }

  if (variant === 'v2') {
    return <Redirect href="/(onboarding)/v2" />;
  }

  return <OnboardingV1Carousel />;
}
