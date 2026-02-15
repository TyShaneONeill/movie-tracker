// Initialize Sentry first (side-effect import)
import '@/lib/sentry-init';

import { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import * as Linking from 'expo-linking';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { QueryProvider } from '@/lib/query-client';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { useOnboarding, OnboardingProvider } from '@/hooks/use-onboarding';
import { GuestProvider, useGuest } from '@/lib/guest-context';
import { Colors } from '@/constants/theme';
import { toastConfig } from '@/lib/toast-config';
import { handleAuthDeepLink } from '@/lib/deep-link-handler';
import { supabase } from '@/lib/supabase';
import { preloadGenres } from '@/lib/genre-service';
import { NetworkProvider } from '@/lib/network-context';
import { OfflineBanner } from '@/components/offline-banner';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AdsProvider } from '@/lib/ads-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { AchievementProvider } from '@/lib/achievement-context';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Preload genres for faster UI rendering
preloadGenres();

export const unstable_settings = {
  anchor: '(tabs)',
};

function useProtectedRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const { isGuest, hasSeenWelcome, isLoading: guestLoading } = useGuest();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const pendingPasswordReset = useRef(false);

  // Listen for deep links and PASSWORD_RECOVERY auth events
  useEffect(() => {
    // Handle deep links (e.g., cinetrak://reset-password?code=xxx)
    const handleUrl = async (event: { url: string }) => {
      const path = await handleAuthDeepLink(event.url);
      if (path === 'reset-password') {
        pendingPasswordReset.current = true;
      }
    };

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Listen for deep links while app is open
    const linkSubscription = Linking.addEventListener('url', handleUrl);

    // Listen for PASSWORD_RECOVERY event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        pendingPasswordReset.current = true;
        // Navigate to reset-password screen
        setTimeout(() => {
          router.replace('/(auth)/reset-password');
        }, 0);
      }
    });

    return () => {
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!navigationState?.key || authLoading || onboardingLoading || guestLoading) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    // Defer navigation to next tick to ensure all routes are mounted
    // This prevents "route not found" errors during initial render
    const performNavigation = (route: string) => {
      setTimeout(() => {
        router.replace(route as '/(tabs)' | '/(auth)/signin' | '/(auth)/welcome' | '/(onboarding)');
      }, 0);
    };

    // If we're handling a password reset deep link, go to reset-password screen
    if (pendingPasswordReset.current && user) {
      pendingPasswordReset.current = false;
      performNavigation('/(auth)/reset-password');
      return;
    }

    if (!user && !inAuthGroup && !inOnboardingGroup) {
      // Not authenticated and not on auth screens
      if (isGuest) {
        // Guest mode - allow browsing
        return;
      }
      // Not in guest mode - show welcome screen (or signin if they've seen welcome)
      if (!hasSeenWelcome) {
        performNavigation('/(auth)/welcome');
      } else {
        performNavigation('/(auth)/signin');
      }
    } else if (!user && inOnboardingGroup) {
      // User is in onboarding but not logged in - redirect to auth
      if (!hasSeenWelcome) {
        performNavigation('/(auth)/welcome');
      } else {
        performNavigation('/(auth)/signin');
      }
    } else if (user && inAuthGroup) {
      // Authenticated but on auth screens → check onboarding
      // (but don't redirect away from reset-password)
      const currentScreen = (segments as string[])[1];
      if (currentScreen === 'reset-password') {
        return; // Let user stay on reset-password
      }
      if (hasCompletedOnboarding) {
        performNavigation('/(tabs)');
      } else {
        performNavigation('/(onboarding)');
      }
    } else if (user && !hasCompletedOnboarding && !inOnboardingGroup && !inAuthGroup) {
      // Authenticated but hasn't completed onboarding → go to onboarding
      performNavigation('/(onboarding)');
    } else if (user && hasCompletedOnboarding && inOnboardingGroup) {
      // Authenticated and completed onboarding but still on onboarding → go to tabs
      performNavigation('/(tabs)');
    }
  }, [user, segments, authLoading, onboardingLoading, guestLoading, hasCompletedOnboarding, isGuest, hasSeenWelcome, navigationState?.key]);
}

function RootLayoutNav() {
  const { effectiveTheme } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: onboardingLoading } = useOnboarding();
  const { isLoading: guestLoading } = useGuest();
  useProtectedRoute();

  if (authLoading || onboardingLoading || guestLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors[effectiveTheme].background }]}>
        <ActivityIndicator size="large" color={Colors[effectiveTheme].tint} />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={effectiveTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="category" options={{ headerShown: false }} />
        <Stack.Screen name="movie" options={{ headerShown: false }} />
        <Stack.Screen name="person" options={{ headerShown: false }} />
        <Stack.Screen name="list" options={{ headerShown: false }} />
        <Stack.Screen name="scan/review" options={{ headerShown: false }} />
        <Stack.Screen name="journey" options={{ headerShown: false }} />
        <Stack.Screen name="followers/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="following/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="achievements" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
      <Toast config={toastConfig} />
      <OfflineBanner />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Request App Tracking Transparency permission before ads load (iOS 14.5+)
  useEffect(() => {
    (async () => {
      const { status } = await requestTrackingPermissionsAsync();
      console.log(`[ATT] Tracking permission status: ${status}`);
    })();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <QueryProvider>
      <NetworkProvider>
        <AdsProvider>
          <GuestProvider>
            <AuthProvider>
              <OnboardingProvider>
                <ThemeProvider>
                  <AchievementProvider>
                    <ErrorBoundary>
                      <RootLayoutNav />
                    </ErrorBoundary>
                  </AchievementProvider>
                </ThemeProvider>
              </OnboardingProvider>
            </AuthProvider>
          </GuestProvider>
        </AdsProvider>
      </NetworkProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
