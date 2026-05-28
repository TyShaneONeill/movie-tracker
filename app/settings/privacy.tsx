import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer } from '@/components/content-container';
import { hapticImpact } from '@/lib/haptics';
import {
  getCrashReportsEnabled,
  setCrashReportsEnabled,
  getAnalyticsEnabled,
  setAnalyticsEnabled,
} from '@/lib/privacy-preferences';
import { applyCrashReportsEnabled } from '@/lib/sentry';
import { applyAnalyticsEnabled, analytics } from '@/lib/analytics';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

type ToggleRowProps = {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  colors: typeof Colors['dark'];
};

function ToggleRow({ title, description, value, onValueChange, disabled, colors }: ToggleRowProps) {
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>
          {title}
        </Text>
        <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}>
          {description}
        </Text>
      </View>
      <ToggleSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function PrivacySettingsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [crashReports, setCrashReports] = useState(true);
  const [analyticsEnabled, setAnalyticsLocal] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [crash, anlx] = await Promise.all([
        getCrashReportsEnabled(),
        getAnalyticsEnabled(),
      ]);
      if (cancelled) return;
      setCrashReports(crash);
      setAnalyticsLocal(anlx);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCrashReportsToggle = async (next: boolean) => {
    hapticImpact();
    setCrashReports(next);
    // Apply to SDK first so any errors during the AsyncStorage write are
    // affected by the new setting — and so opt-out takes effect immediately.
    applyCrashReportsEnabled(next);
    await setCrashReportsEnabled(next);
  };

  const handleAnalyticsToggle = async (next: boolean) => {
    hapticImpact();
    // If turning off, fire the toggle-changed event BEFORE opting out so it's
    // recorded — analytics will be silent for any future events this session.
    if (!next) {
      analytics.track('privacy:analytics_toggle_changed', { enabled: false });
    }
    setAnalyticsLocal(next);
    applyAnalyticsEnabled(next);
    await setAnalyticsEnabled(next);
    if (next) {
      analytics.track('privacy:analytics_toggle_changed', { enabled: true });
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text style={[styles.title, Typography.display.h4, { color: colors.text }]}>
          Privacy
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ContentContainer>
        <Text
          style={[
            Typography.body.sm,
            { color: colors.textSecondary, marginTop: Spacing.sm, marginHorizontal: Spacing.xs },
          ]}
        >
          Choose what PocketStubs is allowed to share with us. Both options are on by default and only affect this device.
        </Text>

        <ToggleRow
          title="Crash reports"
          description="Sends anonymous reports when the app crashes so we can fix bugs faster. No personal info is included."
          value={crashReports}
          onValueChange={handleCrashReportsToggle}
          disabled={isLoading}
          colors={colors}
        />

        <ToggleRow
          title="Product analytics"
          description="Shares anonymous usage stats (like which features you tap) so we can improve PocketStubs."
          value={analyticsEnabled}
          onValueChange={handleAnalyticsToggle}
          disabled={isLoading}
          colors={colors}
        />
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: { textAlign: 'center', flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  rowText: { flex: 1 },
});
