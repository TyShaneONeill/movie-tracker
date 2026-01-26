import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, router, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { useOnboarding } from '@/hooks/use-onboarding';
import { Colors } from '@/constants/theme';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function useProtectedRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useOnboarding();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key || authLoading || onboardingLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user && !inAuthGroup) {
      // Not authenticated and not on auth screens → go to signin
      router.replace('/(auth)/signin');
    } else if (user && inAuthGroup) {
      // Authenticated but on auth screens → check onboarding
      if (hasCompletedOnboarding) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)');
      }
    } else if (user && !hasCompletedOnboarding && !inOnboardingGroup && !inAuthGroup) {
      // Authenticated but hasn't completed onboarding → go to onboarding
      router.replace('/(onboarding)');
    } else if (user && hasCompletedOnboarding && inOnboardingGroup) {
      // Authenticated and completed onboarding but still on onboarding → go to tabs
      router.replace('/(tabs)');
    }
  }, [user, segments, authLoading, onboardingLoading, hasCompletedOnboarding, navigationState?.key]);
}

function RootLayoutNav() {
  const { effectiveTheme } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: onboardingLoading } = useOnboarding();
  useProtectedRoute();

  if (authLoading || onboardingLoading) {
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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={effectiveTheme === 'dark' ? 'light' : 'dark'} />
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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <RootLayoutNav />
        </ThemeProvider>
      </AuthProvider>
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
