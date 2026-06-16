import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';

export default function OnboardingLayout() {
  const { user } = useAuth();
  const { hasCompletedOnboarding, isLoading } = useOnboarding();

  // Root layout already shows a spinner while loading — render nothing here to avoid flash.
  if (isLoading) return null;

  // Authenticated user who has already completed onboarding should never see this group.
  if (user && hasCompletedOnboarding === true) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile-setup" />
      <Stack.Screen name="v2" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
