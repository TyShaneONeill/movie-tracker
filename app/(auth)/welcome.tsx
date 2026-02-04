import {
  View,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import { Link, router } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useGuest } from '@/lib/guest-context';

export default function WelcomeScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { enterGuestMode } = useGuest();

  const handleBrowseFirst = async () => {
    await enterGuestMode();
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Logo & Title */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImage}
        />
        <ThemedText style={[styles.title, { color: colors.text }]}>
          Welcome to CineTrak
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          Track your movie journey
        </ThemedText>
      </View>

      {/* Features Highlight */}
      <View style={styles.featuresContainer}>
        <View style={styles.featureItem}>
          <ThemedText style={[styles.featureIcon]}>🎬</ThemedText>
          <ThemedText style={[styles.featureText, { color: colors.textSecondary }]}>
            Discover trending movies
          </ThemedText>
        </View>
        <View style={styles.featureItem}>
          <ThemedText style={[styles.featureIcon]}>📋</ThemedText>
          <ThemedText style={[styles.featureText, { color: colors.textSecondary }]}>
            Build your watchlist
          </ThemedText>
        </View>
        <View style={styles.featureItem}>
          <ThemedText style={[styles.featureIcon]}>🎟️</ThemedText>
          <ThemedText style={[styles.featureText, { color: colors.textSecondary }]}>
            Log your movie journeys
          </ThemedText>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        <Link href="/(auth)/signin" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <ThemedText style={styles.primaryButtonText}>Sign In</ThemedText>
          </Pressable>
        </Link>

        <Link href="/(auth)/signup" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.outlineButton,
              { borderColor: colors.tint, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <ThemedText style={[styles.outlineButtonText, { color: colors.tint }]}>
              Create Account
            </ThemedText>
          </Pressable>
        </Link>

        {/* Browse First Link */}
        <Pressable
          onPress={handleBrowseFirst}
          style={({ pressed }) => [
            styles.browseFirstButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText style={[styles.browseFirstText, { color: colors.textSecondary }]}>
            Browse First
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 24,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h2,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body.base,
    textAlign: 'center',
  },
  featuresContainer: {
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    ...Typography.body.base,
  },
  buttonsContainer: {
    gap: Spacing.md,
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  outlineButton: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  browseFirstButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  browseFirstText: {
    ...Typography.body.base,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
