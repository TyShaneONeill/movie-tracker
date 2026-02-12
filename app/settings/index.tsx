import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Image, Alert, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Sentry } from '@/lib/sentry';
import Toast from 'react-native-toast-message';
import Svg, { Path, Polyline } from 'react-native-svg';

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

export default function SettingsScreen() {
  const { effectiveTheme, themePreference, setThemePreference } = useTheme();
  const colors = Colors[effectiveTheme];
  const { signOut } = useAuth();
  const { preferences, isLoading: isLoadingPreferences, updatePreference, isUpdating } = useUserPreferences();

  const handleThemeToggle = async (isDarkMode: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // When toggle is ON = dark mode, when OFF = light mode
    // We don't use 'system' from the toggle - it's a simple on/off
    await setThemePreference(isDarkMode ? 'dark' : 'light');
  };

  const handleFirstTakePromptToggle = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updatePreference('firstTakePromptEnabled', value);
    } catch (error) {
      // TODO: Replace with Sentry error tracking
    }
  };

  const handleTestSentry = () => {
    Sentry.captureException(new Error('Test error from CineTrak Settings'));
    Toast.show({
      type: 'success',
      text1: 'Test error sent!',
      text2: 'Check your Sentry dashboard',
      visibilityTime: 3000,
    });
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      try {
        await signOut();
        router.replace('/(auth)/signin');
      } catch (error) {
        // TODO: Replace with Sentry error tracking
        router.replace('/(auth)/signin');
      }
    };

    // Alert.alert doesn't work on web, use window.confirm instead
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        await doLogout();
      }
    } else {
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: doLogout,
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>ACCOUNT</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/settings/edit-profile')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Edit Profile</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/settings/change-password')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Change Password</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <View
            style={[
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border, opacity: 0.5 }
            ]}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Friends only</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>Coming Soon</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/settings/delete-account')}
          >
            <View>
              <Text style={[Typography.body.base, { color: '#ff4444', fontWeight: '600' }]}>Delete Account</Text>
            </View>
            <ChevronRightIcon color="#ff4444" />
          </Pressable>
        </View>

        {/* App Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>APP PREFERENCES</Text>

          <View
            style={[
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border }
            ]}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Dark Mode</Text>
            </View>
            <ToggleSwitch
              value={themePreference === 'dark' || (themePreference === 'system' && effectiveTheme === 'dark')}
              onValueChange={handleThemeToggle}
            />
          </View>

          <View
            style={[
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border, opacity: 0.5 }
            ]}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Notifications</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>Coming Soon</Text>
            </View>
          </View>

          <View
            style={[
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card }
            ]}
          >
            <View style={styles.settingsItemContent}>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Prompt for First Take</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Quick review after marking watched</Text>
            </View>
            <ToggleSwitch
              value={preferences?.firstTakePromptEnabled ?? true}
              onValueChange={handleFirstTakePromptToggle}
              disabled={isLoadingPreferences || isUpdating}
            />
          </View>
        </View>

        {/* Integrations Section */}
        <View style={[styles.section, { opacity: 0.5 }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary, marginBottom: 0 }]}>INTEGRATIONS</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>Coming Soon</Text>
            </View>
          </View>

          <View
            style={[
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border }
            ]}
          >
            <View style={styles.integrationRow}>
              <Image
                source={{ uri: 'https://a.ltrbxd.com/logos/letterboxd-mac-icon.png' }}
                style={styles.integrationIcon}
              />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Letterboxd Import</Text>
            </View>
            <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>--</Text>
          </View>

          <View
            style={[
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card }
            ]}
          >
            <View style={styles.integrationRow}>
              <View style={styles.traktIcon}>
                <Text style={styles.traktText}>T</Text>
              </View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Trakt Sync</Text>
            </View>
            <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>--</Text>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>LEGAL</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              styles.lastItem,
              { backgroundColor: colors.card },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => WebBrowser.openBrowserAsync('https://cinetrak.app/privacy')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy Policy</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Developer Section - Remove after testing */}
        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>DEVELOPER</Text>

            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.firstItem,
                styles.lastItem,
                { backgroundColor: colors.card },
                pressed && { backgroundColor: colors.backgroundSecondary }
              ]}
              onPress={handleTestSentry}
            >
              <View>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Test Sentry Error</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Send a test error to Sentry</Text>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* Logout Button */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: 'rgba(255, 68, 68, 0.2)' },
            pressed && { opacity: 0.7 }
          ]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        {/* App Version */}
        <Text style={[Typography.body.sm, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.lg }]}>
          Version 1.0.0 (Alpha)
        </Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  comingSoonBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingsItem: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  settingsItemContent: {
    flex: 1,
    marginRight: Spacing.sm,
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
  integrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  integrationIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  traktIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#ed1c24',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traktText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  logoutButton: {
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginHorizontal: Spacing.md,
  },
  logoutText: {
    color: '#ff4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
