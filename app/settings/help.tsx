import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Polyline } from 'react-native-svg';
import { hapticImpact } from '@/lib/haptics';
import { useTheme } from '@/lib/theme-context';
import { useTour } from '@/lib/onboarding/tour-context';
import { useBugReport } from '@/contexts/BugReportContext';
import { captureBugReportScreenshot } from '@/lib/bug-report-screenshot';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ContentContainer } from '@/components/content-container';
import { FaqAccordion } from '@/components/help/faq-accordion';
import { FAQ } from '@/lib/help/faq';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export default function HelpScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { replay } = useTour();
  const { openBugReport } = useBugReport();

  const handleReplayTour = async () => {
    hapticImpact();
    try {
      await replay();
    } catch {
      // resetTour swallows storage errors via Sentry; safe to ignore here.
    }
    router.replace('/(tabs)');
  };

  const handleReportBug = async () => {
    hapticImpact();
    const screenshot = await captureBugReportScreenshot();
    openBugReport('settings', screenshot);
  };

  const handleRequestFeature = () => {
    hapticImpact();
    router.push('/settings/feedback');
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  // OTA fingerprint for support/diagnosis: which JS bundle is actually
  // running. 'embedded' = the binary's built-in bundle (no OTA applied yet);
  // in dev (Metro) there is no update id.
  const otaLabel = __DEV__
    ? 'dev'
    : Updates.isEmbeddedLaunch
      ? 'embedded'
      : (Updates.updateId ?? 'unknown').slice(0, 8);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ContentContainer>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <ChevronLeftIcon color={colors.text} />
            </Pressable>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Help & Feedback</Text>
          </View>

          {/* Actions Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>ACTIONS</Text>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.firstItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={handleReplayTour}
              accessibilityRole="button"
              accessibilityLabel="Replay onboarding tour"
            >
              <View style={styles.rowContent}>
                <Ionicons name="play-circle-outline" size={24} color={colors.text} />
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Replay tour</Text>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={handleReportBug}
              accessibilityRole="button"
              accessibilityLabel="Report a bug"
            >
              <View style={styles.rowContent}>
                <Ionicons name="bug-outline" size={24} color={colors.text} />
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Report a bug</Text>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.lastItem,
                { backgroundColor: colors.card },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={handleRequestFeature}
              accessibilityRole="button"
              accessibilityLabel="Request a feature"
            >
              <View style={styles.rowContent}>
                <Ionicons name="bulb-outline" size={24} color={colors.text} />
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Request a feature</Text>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* FAQ Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>FREQUENTLY ASKED QUESTIONS</Text>
            <FaqAccordion entries={FAQ} />
          </View>

          {/* Footer Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>ABOUT</Text>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.firstItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/privacy')}
              accessibilityRole="link"
            >
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy Policy</Text>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.lastItem,
                { backgroundColor: colors.card },
                pressed && { backgroundColor: colors.backgroundSecondary },
              ]}
              onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/terms')}
              accessibilityRole="link"
            >
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Terms of Service</Text>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={[Typography.body.sm, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.lg }]}>
            Version {appVersion} ({otaLabel})
          </Text>
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
  },
  section: {
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  settingsItem: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  firstItem: {
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
  },
  lastItem: {
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    borderBottomWidth: 0,
  },
});
