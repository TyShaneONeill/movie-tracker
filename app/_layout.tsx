// Initialize Sentry first (side-effect import)
import '@/lib/sentry-init';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, useColorScheme, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import { handleAuthDeepLink, handleContentDeepLink } from '@/lib/deep-link-handler';
import { assertAuthEnv } from '@/lib/auth-env-assert';
import { supabase } from '@/lib/supabase';
import { preloadGenres } from '@/lib/genre-service';
import { NetworkProvider } from '@/lib/network-context';
import { OfflineBanner } from '@/components/offline-banner';
import { AdsProvider } from '@/lib/ads-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { BugReportRoot } from '@/components/BugReportRoot';
import { AchievementProvider } from '@/lib/achievement-context';
import { PremiumProvider, usePremium } from '@/lib/premium-context';
import { TourProvider } from '@/lib/onboarding/tour-context';
import { TourOverlay } from '@/components/coachmark/tour-overlay';
import { initAnalytics, analytics, shutdownAnalytics } from '@/lib/analytics';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useWidgetSync } from '@/hooks/use-widget-sync';
import { useAuthTokenSync } from '@/hooks/use-auth-token-sync';

export const unstable_settings = {
  anchor: '(tabs)',
};

const RootBackgroundContext = createContext<{
  setBg: (color: string) => void;
}>({ setBg: () => {} });

function useProtectedRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const { isGuest, isLoading: guestLoading } = useGuest();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const pendingPasswordReset = useRef(false);
  // Holds an initial deep-link URL captured before the root navigator mounted.
  // router.push() is a no-op until navigationState.key exists, so on cold start
  // we stash the URL here and replay it in the effect below.
  const pendingInitialUrl = useRef<string | null>(null);

  // Listen for deep links and PASSWORD_RECOVERY auth events
  useEffect(() => {
    // Handle deep links (e.g., pocketstubs://reset-password?code=xxx,
    // pocketstubs://email-confirmed?code=xxx). handleAuthDeepLink performs the
    // PKCE code exchange (or implicit setSession) for any auth-bearing URL,
    // then returns the path segment so we can route the user appropriately.
    const handleUrl = async (event: { url: string }) => {
      // Content deep links (pocketstubs://movie/{id}, https://pocketstubs.com/movie/{id})
      // are routed first. Content and auth links live in disjoint URL spaces, so
      // running both handlers is safe; whichever recognizes the URL handles it.
      handleContentDeepLink(event.url);

      const path = await handleAuthDeepLink(event.url);
      if (path === 'reset-password') {
        pendingPasswordReset.current = true;
      } else if (path === 'email-confirmed') {
        // If exchangeCodeForSession succeeded, onAuthStateChange will route the
        // now-authenticated user through the normal flow. If it failed (no code
        // param, expired link, etc.), nudge them to sign in with a friendly toast.
        Toast.show({
          type: 'success',
          text1: 'Email confirmed',
          text2: 'You can now sign in.',
          visibilityTime: 4000,
        });
      }
    };

    // Check if app was opened via deep link. On cold start the root navigator
    // is not yet mounted, so router.push() inside handleContentDeepLink would
    // silently no-op. Stash the URL and let the navigationState effect below
    // replay it once the nav tree is ready.
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (navigationState?.key) {
        handleUrl({ url });
      } else {
        pendingInitialUrl.current = url;
      }
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

  // Replay a cold-start content deep link once the root navigator is mounted.
  // Auth deep links don't need this — their routing path runs through the
  // pendingPasswordReset ref + the navigationState-gated effect below.
  useEffect(() => {
    if (!navigationState?.key || !pendingInitialUrl.current) return;
    const url = pendingInitialUrl.current;
    pendingInitialUrl.current = null;
    handleContentDeepLink(url);
  }, [navigationState?.key]);

  useEffect(() => {
    if (!navigationState?.key || authLoading || onboardingLoading || guestLoading) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    // Defer navigation to next frame to ensure all routes are mounted
    // requestAnimationFrame is more reliable than setTimeout(0) on Android
    const performNavigation = (route: string) => {
      requestAnimationFrame(() => {
        router.replace(route as '/(tabs)' | '/(auth)/signin' | '/(onboarding)');
      });
    };

    // If we're handling a password reset deep link, go to reset-password screen
    if (pendingPasswordReset.current && user) {
      pendingPasswordReset.current = false;
      performNavigation('/(auth)/reset-password');
      return;
    }

    if (!user && !inAuthGroup && !inOnboardingGroup) {
      // On web, always allow unauthenticated browsing (content-first, like Letterboxd)
      if (Platform.OS === 'web') return;
      // On native, allow guest mode browsing
      if (isGuest) return;
      // Not in guest mode on native - go to signin
      performNavigation('/(auth)/signin');
    } else if (!user && inOnboardingGroup) {
      // User is in onboarding but not logged in
      if (Platform.OS === 'web') {
        // Redirect to home — onboarding is only for authenticated users
        performNavigation('/(tabs)');
        return;
      }
      performNavigation('/(auth)/signin');
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
      // Defense-in-depth: (onboarding)/_layout.tsx also carries a synchronous Redirect guard.
      // Authenticated and completed onboarding but still on onboarding → go to tabs
      performNavigation('/(tabs)');
    }
  }, [user, segments, authLoading, onboardingLoading, guestLoading, hasCompletedOnboarding, isGuest, navigationState?.key]);
}

/** Identify / reset analytics user when auth state changes */
function useAnalyticsIdentity() {
  const { user } = useAuth();
  const { tier, isPremium } = usePremium();

  useEffect(() => {
    if (user) {
      analytics.identify(user.id, {
        email: user.email ?? undefined,
        auth_provider: user.app_metadata?.provider ?? 'email',
        created_at: user.created_at,
        is_premium: isPremium,
        premium_tier: tier,
      });
    } else {
      analytics.reset();
    }
  }, [user, tier, isPremium]);
}

function RootLayoutNav() {
  const { effectiveTheme } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: onboardingLoading } = useOnboarding();
  const { isLoading: guestLoading } = useGuest();
  const { setBg } = useContext(RootBackgroundContext);
  useProtectedRoute();
  useAnalyticsIdentity();
  usePushNotifications();
  useWidgetSync();
  useAuthTokenSync();

  useEffect(() => {
    setBg(Colors[effectiveTheme].background);
  }, [effectiveTheme, setBg]);

  // Sync the page background color on web so the area outside the max-width container matches
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = Colors[effectiveTheme].background;
      document.body.style.backgroundColor = Colors[effectiveTheme].background;
    }
  }, [effectiveTheme]);

  if (authLoading || onboardingLoading || guestLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors[effectiveTheme].background }]}>
        <ActivityIndicator size="large" color={Colors[effectiveTheme].tint} />
      </View>
    );
  }

  // Override the nav theme background so the Stack container's
  // "letterbox" gutters beside ContentContainer use the app's palette
  // instead of React Navigation's default near-black / off-white.
  const baseNavTheme = effectiveTheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: { ...baseNavTheme.colors, background: Colors[effectiveTheme].background },
  };

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: Colors[effectiveTheme].background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="analytics" options={{ headerShown: false }} />
        <Stack.Screen name="category" options={{ headerShown: false }} />
        <Stack.Screen name="movie" options={{ headerShown: false }} />
        <Stack.Screen name="tv" options={{ headerShown: false }} />
        <Stack.Screen name="person" options={{ headerShown: false }} />
        <Stack.Screen name="list" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ headerShown: false }} />
        <Stack.Screen name="journey" options={{ headerShown: false }} />
        <Stack.Screen name="followers/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="following/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="achievements" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="lists" options={{ headerShown: false }} />
        <Stack.Screen name="release-calendar" options={{ headerShown: false }} />
        <Stack.Screen name="streaming-services" options={{ headerShown: false }} />
        <Stack.Screen name="upgrade" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
      <Toast config={toastConfig} />
      <OfflineBanner />
      <TourOverlay />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const [rootBg, setRootBg] = useState(
    () => Colors[systemScheme === 'dark' ? 'dark' : 'light'].background
  );

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
    preloadGenres();
    // Loudly report any missing OAuth / Supabase env vars on boot so future
    // builds with broken Doppler / EAS config don't silently disable sign-in.
    assertAuthEnv();
  }, []);

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

  // Initialize PostHog analytics (web only)
  useEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
    const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    if (apiKey) {
      initAnalytics(apiKey, host);
    }
    return () => shutdownAnalytics();
  }, []);

  // Request App Tracking Transparency permission before ads load (iOS 14.5+)
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'ios') {
        const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
        await requestTrackingPermissionsAsync();
      }
    })();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <RootBackgroundContext.Provider value={{ setBg: setRootBg }}>
      <GestureHandlerRootView
        style={[
          styles.webContainer,
          Platform.OS === 'android' && { backgroundColor: rootBg },
        ]}
      >
        <QueryProvider>
          <NetworkProvider>
            <AdsProvider>
              <GuestProvider>
                <AuthProvider>
                  <OnboardingProvider>
                    <ThemeProvider>
                      <PremiumProvider>
                        <AchievementProvider>
                          <TourProvider>
                            <ErrorBoundary>
                              <BugReportRoot>
                                <RootLayoutNav />
                              </BugReportRoot>
                            </ErrorBoundary>
                          </TourProvider>
                        </AchievementProvider>
                      </PremiumProvider>
                    </ThemeProvider>
                  </OnboardingProvider>
                </AuthProvider>
              </GuestProvider>
            </AdsProvider>
          </NetworkProvider>
        </QueryProvider>
      </GestureHandlerRootView>
    </RootBackgroundContext.Provider>
  );
}

const MAX_APP_WIDTH = 768;

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? MAX_APP_WIDTH : undefined,
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
