import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { hapticImpact } from '@/lib/haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { usePremium } from '@/hooks/use-premium';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer } from '@/components/content-container';
import { ThemeSelector } from '@/components/settings/theme-selector';
import { Sentry, captureException } from '@/lib/sentry';
import { exportCollectionCSV } from '@/lib/letterboxd-service';
import { analytics } from '@/lib/analytics';
import Constants from 'expo-constants';
import { acceptAllPendingRequests } from '@/lib/follow-request-service';
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
  const { signOut, user } = useAuth();
  const { preferences, isLoading: isLoadingPreferences, updatePreference, isUpdating } = useUserPreferences();
  const { isPremium, tier, subscription, restorePurchases, manageSubscription, managementUrl, isLoading: isPremiumLoading } = usePremium();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);

  const handleManageSubscription = async () => {
    hapticImpact();
    analytics.track('premium:manage_subscription_clicked', { plan: tier ?? 'plus' });
    const result = await manageSubscription();
    if (!result.success && result.error) {
      Toast.show({
        type: 'error',
        text1: 'Could not open',
        text2: result.error,
        visibilityTime: 4000,
      });
    }
  };

  const handleRestorePurchases = async () => {
    hapticImpact();
    setIsRestoringPurchases(true);
    try {
      const result = await restorePurchases();
      if (result && typeof result === 'object' && 'message' in result) {
        Toast.show({
          type: result.restored ? 'success' : 'info',
          text1: result.restored ? 'Restored!' : 'No subscription found',
          text2: String(result.message),
          visibilityTime: 3000,
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Restore failed',
        text2: 'Please try again later.',
        visibilityTime: 3000,
      });
    } finally {
      setIsRestoringPurchases(false);
    }
  };

  /** Format subscription expiry for display */
  const formatExpiryDate = (date: Date | null): string => {
    if (!date) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  /** Plan name only — the status line (renews / trial / expires) lives in the subtitle */
  const getSubscriptionLabel = (): string => {
    if (tier === 'dev') return 'Developer';
    if (!isPremium) return 'Free Plan';
    return 'PocketStubs+';
  };

  /** Whole days remaining until a date (rounded up); 0 if already past */
  const getDaysLeft = (date: Date | null): number | null => {
    if (!date) return null;
    const ms = date.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  const handlePrivacyToggle = (value: boolean) => {
    const currentlyPrivate = preferences?.isPrivate ?? false;
    if (value === currentlyPrivate) return;

    const doToggle = async () => {
      try {
        await updatePreference('isPrivate', value);
        // When switching to public, auto-accept all pending follow requests
        if (!value && user) {
          try {
            await acceptAllPendingRequests(user.id);
          } catch (error) {
            // Non-critical — profile update already succeeded
            captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-auto-accept-requests' });
          }
        }
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-privacy-toggle' });
      }
    };

    if (value) {
      // Switching to private
      if (Platform.OS === 'web') {
        if (window.confirm('Existing followers will keep access. New followers will need your approval.')) {
          doToggle();
        }
      } else {
        Alert.alert(
          'Switch to Private?',
          'Existing followers will keep access. New followers will need your approval.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Switch to Private', onPress: doToggle },
          ]
        );
      }
    } else {
      // Switching to public
      if (Platform.OS === 'web') {
        if (window.confirm('Your profile will be visible to everyone. All pending follow requests will be automatically accepted.')) {
          doToggle();
        }
      } else {
        Alert.alert(
          'Switch to Public?',
          'Your profile will be visible to everyone. All pending follow requests will be automatically accepted.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Switch to Public', onPress: doToggle },
          ]
        );
      }
    }
  };

  const handleTestSentry = () => {
    Sentry.captureException(new Error('Test error from PocketStubs Settings'));
    Toast.show({
      type: 'success',
      text1: 'Test error sent!',
      text2: 'Check your Sentry dashboard',
      visibilityTime: 3000,
    });
  };

  const handleExportCollection = async () => {
    if (!user) return;
    hapticImpact();
    setIsExporting(true);
    try {
      const csv = await exportCollectionCSV(user.id);
      const fileUri = `${FileSystem.cacheDirectory}pocketstubs-export.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Collection',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-export-collection' });
      Toast.show({
        type: 'error',
        text1: 'Export failed',
        text2: 'Could not export your collection. Please try again.',
        visibilityTime: 3000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = async () => {
    const doLogout = async () => {
      try {
        await signOut();
        router.replace('/(auth)/signin');
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { context: 'settings-logout' });
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
    <SafeAreaView testID="settings" style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ContentContainer>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Help & Feedback Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>HELP & FEEDBACK</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              styles.lastItem,
              { backgroundColor: colors.card },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => { hapticImpact(); router.push('/settings/help'); }}
            accessibilityRole="button"
            accessibilityLabel="Help and feedback"
          >
            <View style={styles.integrationRow}>
              <Ionicons name="help-circle-outline" size={24} color={colors.text} />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Help & Feedback</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>
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
              { backgroundColor: colors.card, borderBottomColor: colors.border }
            ]}
          >
            <View style={styles.settingsItemContent}>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Private Account</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Only approved followers can see your posts and collection</Text>
            </View>
            <ToggleSwitch
              value={preferences?.isPrivate ?? false}
              onValueChange={handlePrivacyToggle}
              disabled={isLoadingPreferences || isUpdating}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/settings/blocked-users')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Blocked Users</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Manage blocked accounts</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/streaming-services')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>My Streaming Services</Text>
              <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Select your subscriptions</Text>
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
            onPress={() => router.push('/settings/delete-account')}
          >
            <View>
              <Text style={[Typography.body.base, { color: '#ff4444', fontWeight: '600' }]}>Delete Account</Text>
            </View>
            <ChevronRightIcon color="#ff4444" />
          </Pressable>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>SUBSCRIPTION</Text>

          <Pressable
            style={({ pressed }) => [
              styles.subscriptionCard,
              { backgroundColor: colors.card },
              !isPremium && { borderColor: colors.gold + '40', borderWidth: 1 },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => {
              analytics.track('premium:upgrade_view', { source: 'settings' });
              router.push('/upgrade?source=settings');
            }}
          >
            <View style={styles.subscriptionCardTop}>
              <View style={[styles.subscriptionIconCircle, { backgroundColor: isPremium ? colors.gold + '20' : colors.gold + '15' }]}>
                <Ionicons name={isPremium ? 'star' : 'star-outline'} size={20} color={colors.gold} />
              </View>
              <View style={styles.subscriptionCardInfo}>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '700' }]}>
                  {isPremiumLoading ? 'Loading...' : getSubscriptionLabel()}
                </Text>
                {!isPremium && (
                  <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: 1 }]}>
                    Unlock all features with PocketStubs+
                  </Text>
                )}
                {isPremium && tier !== 'dev' && subscription?.expiresAt && (() => {
                  const dateStr = formatExpiryDate(subscription.expiresAt);
                  if (subscription.isTrialActive) {
                    const daysLeft = getDaysLeft(subscription.expiresAt);
                    return (
                      <>
                        <Text style={[Typography.body.xs, { color: colors.gold, marginTop: 1, fontWeight: '600' }]}>
                          Free trial · {daysLeft === 0 ? 'ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                        </Text>
                        <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: 1 }]}>
                          First charge {dateStr}
                        </Text>
                      </>
                    );
                  }
                  return (
                    <Text style={[Typography.body.xs, { color: colors.textSecondary, marginTop: 1 }]}>
                      {subscription.willRenew ? 'Renews' : 'Expires'} {dateStr}
                    </Text>
                  );
                })()}
              </View>
              {!isPremium ? (
                <View style={[styles.upgradeChip, { backgroundColor: colors.gold }]}>
                  <Text style={styles.upgradeChipText}>Upgrade</Text>
                  <Ionicons name="arrow-forward" size={12} color="#000" />
                </View>
              ) : (
                <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
              )}
            </View>
          </Pressable>

          {isPremium && tier !== 'dev' && (managementUrl || Platform.OS === 'ios') && (
            <Pressable
              style={({ pressed }) => [
                styles.settingsItem,
                styles.firstItem,
                { backgroundColor: colors.card, borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.backgroundSecondary }
              ]}
              onPress={handleManageSubscription}
            >
              <View>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Manage Subscription</Text>
                <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: 1 }]}>Cancel or change your plan</Text>
              </View>
              <ChevronRightIcon color={colors.textSecondary} />
            </Pressable>
          )}

          {(isPremium && tier !== 'dev' || !isPremium) && (
            <Pressable
              style={({ pressed }) => [
                styles.restoreLink,
                pressed && { opacity: 0.5 },
              ]}
              onPress={handleRestorePurchases}
              disabled={isRestoringPurchases}
            >
              {isRestoringPurchases ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>Restore Purchases</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* App Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>APP PREFERENCES</Text>

          <View
            style={[
              styles.settingsItem,
              styles.firstItem,
              styles.themeItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border }
            ]}
          >
            <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Appearance</Text>
            <View style={styles.themeSelectorWrapper}>
              <ThemeSelector
                value={themePreference}
                onChange={setThemePreference}
                effectiveTheme={effectiveTheme}
              />
            </View>
            {themePreference === 'system' && (
              <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
                PocketStubs will follow your device&apos;s appearance setting.
              </Text>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary },
            ]}
            onPress={() => { hapticImpact(); router.push('/settings/notifications'); }}
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Notifications</Text>
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
            onPress={() => { hapticImpact(); router.push('/settings/feature-toggles'); }}
            accessibilityRole="button"
            accessibilityLabel="Feature toggles"
          >
            <View style={styles.integrationRow}>
              <Ionicons name="toggle-outline" size={24} color={colors.text} />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Feature Toggles</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Integrations Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>INTEGRATIONS</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => router.push('/settings/letterboxd-import')}
          >
            <View style={styles.integrationRow}>
              <Image
                source={{ uri: 'https://a.ltrbxd.com/logos/letterboxd-mac-icon.png' }}
                style={styles.integrationIcon}
              />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Letterboxd Import</Text>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={handleExportCollection}
            disabled={isExporting}
          >
            <View style={styles.integrationRow}>
              <Ionicons name="share-outline" size={24} color={colors.text} />
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Export Collection</Text>
            </View>
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <ChevronRightIcon color={colors.textSecondary} />
            )}
          </Pressable>

          <View
            style={[
              styles.settingsItem,
              styles.lastItem,
              { backgroundColor: colors.card, opacity: 0.5 }
            ]}
          >
            <View style={styles.integrationRow}>
              <View style={styles.traktIcon}>
                <Text style={styles.traktText}>T</Text>
              </View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Trakt Sync</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={[Typography.body.xs, { color: colors.textTertiary }]}>Coming Soon</Text>
            </View>
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>PRIVACY</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              styles.lastItem,
              { backgroundColor: colors.card },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => { hapticImpact(); router.push('/settings/privacy'); }}
            accessibilityRole="button"
            accessibilityLabel="Privacy settings"
          >
            <View style={styles.integrationRow}>
              <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
              <View>
                <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy</Text>
                <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>Crash reports and analytics</Text>
              </View>
            </View>
            <ChevronRightIcon color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>LEGAL</Text>

          <Pressable
            style={({ pressed }) => [
              styles.settingsItem,
              styles.firstItem,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.backgroundSecondary }
            ]}
            onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/privacy')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Privacy Policy</Text>
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
            onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/terms')}
          >
            <View>
              <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Terms of Service</Text>
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
          Version {Constants.expoConfig?.version ?? '1.0.0'}
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
  themeItem: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  themeSelectorWrapper: {
    width: '100%',
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
  subscriptionCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  subscriptionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionCardInfo: {
    flex: 1,
  },
  upgradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  upgradeChipText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  restoreLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
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
