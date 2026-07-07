import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer } from '@/components/content-container';
import { useNotificationPreference } from '@/hooks/use-notification-preferences';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { hapticImpact } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import type { NotificationFeature } from '@/lib/notification-preferences-service';

/**
 * Open the OS-level settings page for the app so the user can change the
 * notification permission. `app-settings:` is iOS-only; on Android the RN
 * built-in `Linking.openSettings()` is required (mirrors `scanner.tsx`).
 */
async function openOSSettings() {
  try {
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  } catch {
    // Best-effort; the OS may decline to open settings.
  }
}

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function FeatureToggleRow({
  feature,
  title,
  description,
  colors,
}: {
  feature: NotificationFeature;
  title: string;
  description: string;
  colors: typeof Colors['dark'];
}) {
  const { enabled, setEnabled, isUpdating } = useNotificationPreference(feature);

  const handleToggle = (next: boolean) => {
    hapticImpact();
    setEnabled(next);
    analytics.track('notifications:toggle_changed', {
      feature,
      enabled: next,
    });
  };

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}
        >
          {title}
        </Text>
        <Text
          style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}
        >
          {description}
        </Text>
      </View>
      <ToggleSwitch
        value={enabled}
        onValueChange={handleToggle}
        disabled={isUpdating}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { permissionStatus, requestPermission, isAvailable } = usePushNotifications();

  const handleMasterToggle = async (next: boolean) => {
    hapticImpact();
    if (permissionStatus === 'undetermined') {
      // Tap from undetermined: ask the OS for permission. The hook will refresh
      // permissionStatus automatically; the toggle value re-derives.
      await requestPermission();
      return;
    }
    // Tap from granted or denied: we can't change the OS permission from the
    // app, only direct the user to the device's Settings.
    void openOSSettings();
  };

  const masterValue = permissionStatus === 'granted';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text
          style={[styles.title, Typography.display.h4, { color: colors.text }]}
        >
          Notifications
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ContentContainer>
        <View
          style={[
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowText}>
            <Text
              style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}
            >
              Push Notifications
            </Text>
            <Text
              style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}
            >
              Pushes are required to receive any notifications below.
            </Text>
          </View>
          <ToggleSwitch
            value={masterValue}
            onValueChange={handleMasterToggle}
            disabled={!isAvailable}
            accessibilityLabel="Push Notifications"
          />
        </View>

        {permissionStatus === 'granted' && (
          <View style={styles.featuresSection}>
            <Text
              style={[Typography.body.xs, styles.sectionLabel, { color: colors.textTertiary }]}
            >
              CUSTOMIZE
            </Text>
            <FeatureToggleRow
              feature="release_reminders"
              title="Release reminders"
              description="Get notified when watchlisted movies release."
              colors={colors}
            />
            <FeatureToggleRow
              feature="tv_episode_reminders"
              title="TV episode reminders"
              description="Get notified when new episodes drop on shows you're watching."
              colors={colors}
            />
            {/* DRAFT copy — Content Queue review pending (PS-15 PR 1, 2026-07-06) */}
            <FeatureToggleRow
              feature="day2_bridge"
              title="Day-2 nudge"
              description="One nudge, a couple days after you join, about what's on your watchlist."
              colors={colors}
            />
          </View>
        )}

        {permissionStatus === 'denied' && (
          <View style={styles.deniedSection}>
            <Text
              style={[Typography.body.sm, { color: colors.textSecondary, textAlign: 'center' }]}
            >
              {Platform.OS === 'ios'
                ? 'Notifications are off in iOS Settings.'
                : 'Notifications are off in your device settings.'}
            </Text>
            <Pressable
              onPress={() => {
                hapticImpact();
                void openOSSettings();
              }}
              hitSlop={10}
              style={styles.openSettingsLink}
            >
              <Text
                style={[Typography.body.base, { color: colors.tint, fontWeight: '600' }]}
              >
                Open Settings →
              </Text>
            </Pressable>
          </View>
        )}

        {!isAvailable && (
          <Text style={[styles.helpText, { color: colors.textTertiary }]}>
            Notifications are not available on this platform.
          </Text>
        )}
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
  featuresSection: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  deniedSection: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  openSettingsLink: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  helpText: {
    fontSize: 12,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
