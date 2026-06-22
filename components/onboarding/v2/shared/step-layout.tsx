import { type ReactNode } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky footer content (usually a CTAButton). */
  footer: ReactNode;
  /** Set false for steps that manage their own scrolling (e.g. grids). */
  scroll?: boolean;
}

/**
 * Shared layout for the numbered onboarding v2 steps: a title/subtitle block,
 * a scrollable body, and a sticky footer. Always dark.
 */
export function StepLayout({ title, subtitle, children, footer, scroll = true }: StepLayoutProps) {
  const colors = Colors.dark;
  const insets = useSafeAreaInsets();

  const Header = (
    <View style={styles.header}>
      <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
      {subtitle ? (
        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {Header}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flexBody}>
          {Header}
          {children}
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  flexBody: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h2,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body.base,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
});
