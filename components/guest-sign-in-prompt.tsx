/**
 * GuestSignInPrompt Component
 * Standardized sign-in prompt shown to guest users on protected screens.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

interface GuestSignInPromptProps {
  /** Icon name from Ionicons */
  icon: keyof typeof Ionicons.glyphMap;
  /** Title text */
  title: string;
  /** Description message */
  message: string;
}

/**
 * Standardized guest sign-in prompt for protected screens.
 *
 * @example
 * <GuestSignInPrompt
 *   icon="person-circle-outline"
 *   title="Your Profile"
 *   message="Sign in to see your collection, watchlist, and first takes"
 * />
 */
export function GuestSignInPrompt({ icon, title, message }: GuestSignInPromptProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.content}>
        <Ionicons name={icon} size={72} color={colors.textSecondary} />

        <Text style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>

        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {message}
        </Text>

        <View style={styles.buttonContainer}>
          <Link href="/(auth)/signin" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.primaryButtonText}>Sign In</Text>
            </Pressable>
          </Link>

          <Link href="/(auth)/signup" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.outlineButton,
                { borderColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={[styles.outlineButtonText, { color: colors.tint }]}>
                Create Account
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  title: {
    ...Typography.display.h3,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  message: {
    ...Typography.body.base,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryButton: {
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
