import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import Svg, { Path, Polyline } from 'react-native-svg';

function ChevronLeftIcon() {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
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
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const [darkMode, setDarkMode] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon />
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
              { backgroundColor: colors.card, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => {
              // Navigate to edit profile
            }}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Edit Profile</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: 'rgba(255, 255, 255, 0.05)' },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => {
              // Navigate to change password
            }}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Change Password</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => {
              // Navigate to privacy settings
            }}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Friends only</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* App Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>APP PREFERENCES</Text>

          <View
            style={[
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: 'rgba(255, 255, 255, 0.05)' }
            ]}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Dark Mode</Text>
            </View>
            <ToggleSwitch value={darkMode} onValueChange={setDarkMode} />
          </View>

          <View
            style={[
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card }
            ]}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Notifications</Text>
            </View>
            <ToggleSwitch value={notifications} onValueChange={setNotifications} />
          </View>
        </View>

        {/* Integrations Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>INTEGRATIONS</Text>

          <View
            style={[
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: 'rgba(255, 255, 255, 0.05)' }
            ]}
          >
            <View style={styles.integrationRow}>
              <Image
                source={{ uri: 'https://a.ltrbxd.com/logos/letterboxd-mac-icon.png' }}
                style={styles.integrationIcon}
              />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Letterboxd Import</Text>
            </View>
            <Text style={[Typography.body.sm, { color: colors.accentSecondary, fontWeight: '600' }]}>Connected</Text>
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
            <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Connect</Text>
          </View>
        </View>

        {/* Logout Button */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: 'rgba(255, 68, 68, 0.2)' },
            pressed && { opacity: 0.7 }
          ]}
          onPress={() => {
            // Handle logout
          }}
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
  settingsItem: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
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
