import { View, StyleSheet, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius, Gradients } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SignInScreen() {
  const colorScheme = useColorScheme() ?? 'dark';
  const theme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[theme];

  const handleOAuthSignIn = (provider: 'google' | 'apple' | 'meta') => {
    // OAuth UI only - actual implementation out of scope
    alert(`${provider} OAuth coming soon`);
  };

  const handleSkipToDemo = () => {
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Logo & Title */}
      <View style={styles.header}>
        <LinearGradient
          colors={Gradients.main as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoContainer}
        >
          <Ionicons name="film" size={40} color="white" />
        </LinearGradient>
        <ThemedText style={[styles.title, { color: colors.text }]}>CineTrack</ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          Track, Share, and Discover Movies.
        </ThemedText>
      </View>

      {/* OAuth Buttons */}
      <View style={styles.oauthContainer}>
        <Pressable
          onPress={() => handleOAuthSignIn('google')}
          style={({ pressed }) => [
            styles.socialButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={styles.socialButtonContent}>
            <View style={styles.iconPlaceholder}>
              <Ionicons name="logo-google" size={20} color="#DB4437" />
            </View>
            <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
              Continue with Google
            </ThemedText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleOAuthSignIn('apple')}
          style={({ pressed }) => [
            styles.socialButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={styles.socialButtonContent}>
            <View style={styles.iconPlaceholder}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
            </View>
            <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
              Continue with Apple
            </ThemedText>
          </View>
        </Pressable>

        <Pressable
          onPress={() => handleOAuthSignIn('meta')}
          style={({ pressed }) => [
            styles.socialButton,
            { backgroundColor: '#1877F2', borderColor: '#1877F2', opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.socialButtonContent}>
            <View style={styles.iconPlaceholder}>
              <Ionicons name="logo-facebook" size={20} color="white" />
            </View>
            <ThemedText style={[styles.socialButtonText, { color: 'white' }]}>
              Continue with Meta
            </ThemedText>
          </View>
        </Pressable>
      </View>

      {/* Footer Links */}
      <View style={styles.footer}>
        <View style={styles.signupContainer}>
          <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
            Don&apos;t have an account?{' '}
          </ThemedText>
          <Link href="/(auth)/signup" asChild>
            <Pressable>
              <ThemedText style={[styles.linkText, { color: colors.tint }]}>Sign up</ThemedText>
            </Pressable>
          </Link>
        </View>
        <Pressable onPress={handleSkipToDemo}>
          <ThemedText style={[styles.skipText, { color: colors.textSecondary }]}>
            Skip to Demo App
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
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 8,
  },
  title: {
    ...Typography.display.h2,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...Typography.body.base,
    marginBottom: Spacing.xxl,
  },
  oauthContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  socialButton: {
    width: '100%',
    height: 56,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 20,
    height: 20,
    marginRight: Spacing.sm,
  },
  socialButtonText: {
    ...Typography.button.primary,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  signupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  footerText: {
    ...Typography.body.sm,
  },
  linkText: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
  skipText: {
    ...Typography.body.sm,
    textDecorationLine: 'underline',
  },
});
