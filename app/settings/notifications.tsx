import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
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

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export default function NotificationsSettingsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { enabled, isLoading, setEnabled, isUpdating } =
    useNotificationPreference('release_reminders');
  const { permissionStatus, requestPermission, isAvailable } = usePushNotifications();

  const handleToggle = async (next: boolean) => {
    hapticImpact();
    if (next && permissionStatus !== 'granted') {
      const granted = await requestPermission();
      if (!granted) {
        Toast.show({
          type: 'info',
          text1: 'Permission required',
          text2: 'Enable notifications in your device Settings to get release reminders.',
          visibilityTime: 4000,
        });
        return;
      }
    }
    setEnabled(next);
    analytics.track('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: next,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <ActivityIndicator
          size="small"
          color={colors.tint}
          style={{ marginTop: Spacing.lg }}
        />
      </SafeAreaView>
    );
  }

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
              style={[
                Typography.body.base,
                { color: colors.text, fontWeight: '600' },
              ]}
            >
              Release reminders
            </Text>
            <Text
              style={[
                Typography.body.sm,
                { color: colors.textSecondary, marginTop: 2 },
              ]}
            >
              Notify me when a watchlisted movie hits theaters or streaming.
            </Text>
          </View>
          <ToggleSwitch
            value={enabled}
            onValueChange={handleToggle}
            disabled={isUpdating || !isAvailable}
            accessibilityLabel="Release reminders"
          />
        </View>
        {!isAvailable && (
          <Text
            style={[styles.helpText, { color: colors.textTertiary }]}
          >
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
  helpText: {
    fontSize: 12,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
