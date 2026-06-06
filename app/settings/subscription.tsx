/**
 * Subscription Page
 * Dedicated hub for managing PocketStubs+ — reached by tapping the subscription
 * card in Settings (whether subscribed or not). Shows plan + status; subscribers
 * get Manage (Apple's sheet) + Restore; free users get an Upgrade CTA.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useTheme } from '@/lib/theme-context';
import { ContentContainer } from '@/components/content-container';
import { usePremium } from '@/hooks/use-premium';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { hapticImpact } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import { formatExpiryDate, getDaysLeft } from '@/lib/subscription-format';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

const PLUS_BENEFITS = [
  'No ads',
  '20 ticket scans per day',
  'Release reminders & calendar genre filters',
  'Full advanced stats suite',
];

export default function SubscriptionScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { isPremium, tier, subscription, managementUrl, manageSubscription, restorePurchases } = usePremium();
  const [isRestoring, setIsRestoring] = useState(false);

  const handleManage = useCallback(async () => {
    hapticImpact();
    analytics.track('premium:manage_subscription_clicked', { plan: tier ?? 'plus', source: 'subscription-page' });
    const result = await manageSubscription();
    if (!result.success && result.error) {
      Toast.show({ type: 'error', text1: 'Could not open', text2: result.error, visibilityTime: 4000 });
    }
  }, [manageSubscription, tier]);

  const handleRestore = useCallback(async () => {
    hapticImpact();
    setIsRestoring(true);
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
      Toast.show({ type: 'error', text1: 'Restore failed', text2: 'Please try again later.', visibilityTime: 3000 });
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases]);

  const handleUpgrade = useCallback(() => {
    hapticImpact();
    analytics.track('premium:upgrade_view', { source: 'subscription-page' });
    router.push('/upgrade?source=subscription-page');
  }, []);

  const planName = tier === 'dev' ? 'Developer' : isPremium ? 'PocketStubs+' : 'Free Plan';

  const renderStatusLine = () => {
    if (!isPremium || tier === 'dev' || !subscription?.expiresAt) return null;
    const dateStr = formatExpiryDate(subscription.expiresAt);
    if (subscription.isTrialActive) {
      const daysLeft = getDaysLeft(subscription.expiresAt);
      return (
        <>
          <Text style={[Typography.body.sm, { color: colors.gold, fontWeight: '600', marginTop: 2 }]}>
            Free trial · {daysLeft === 0 ? 'ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </Text>
          <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: 1 }]}>
            First charge {dateStr}
          </Text>
        </>
      );
    }
    return (
      <Text style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}>
        {subscription.willRenew ? 'Renews' : 'Expires'} {dateStr}
      </Text>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ContentContainer style={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Subscription</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Plan card */}
          <View style={[styles.planCard, { backgroundColor: colors.card }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.gold + '20' }]}>
              <Ionicons name={isPremium ? 'star' : 'star-outline'} size={22} color={colors.gold} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[Typography.body.lg, { color: colors.text, fontWeight: '700' }]}>{planName}</Text>
              {renderStatusLine()}
              {!isPremium && (
                <Text style={[Typography.body.sm, { color: colors.textTertiary, marginTop: 2 }]}>
                  Unlock everything PocketStubs has to offer
                </Text>
              )}
            </View>
            {isPremium && tier !== 'dev' && <Ionicons name="checkmark-circle" size={24} color={colors.gold} />}
          </View>

          {/* Premium: manage + restore */}
          {isPremium && tier !== 'dev' && (
            <>
              {(managementUrl || Platform.OS === 'ios') && (
                <Pressable
                  style={({ pressed }) => [styles.actionRow, { backgroundColor: colors.card }, pressed && { backgroundColor: colors.backgroundSecondary }]}
                  onPress={handleManage}
                >
                  <View>
                    <Text style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}>Manage Subscription</Text>
                    <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: 1 }]}>Cancel or change your plan</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </Pressable>
              )}
              <Text style={[Typography.body.xs, styles.appleNote, { color: colors.textTertiary }]}>
                Subscriptions are billed and managed through your App Store account.
              </Text>
            </>
          )}

          {/* Free: benefits + upgrade CTA */}
          {!isPremium && (
            <>
              <View style={[styles.benefitsCard, { backgroundColor: colors.card }]}>
                {PLUS_BENEFITS.map((b) => (
                  <View key={b} style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
                    <Text style={[Typography.body.sm, { color: colors.text, flex: 1 }]}>{b}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [styles.upgradeButton, { backgroundColor: colors.gold, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleUpgrade}
              >
                <Text style={styles.upgradeButtonText}>Upgrade to PocketStubs+</Text>
              </Pressable>
            </>
          )}

          {/* Restore — shown for both states (except dev) */}
          {tier !== 'dev' && (
            <Pressable
              style={({ pressed }) => [styles.restoreLink, pressed && { opacity: 0.5 }]}
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={colors.textTertiary} />
              ) : (
                <Text style={[Typography.body.sm, { color: colors.textTertiary }]}>Restore Purchases</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </ContentContainer>
    </SafeAreaView>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: { flex: 1 },
    contentContainer: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
      paddingHorizontal: Spacing.md,
      paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
      ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingBottom: 100,
      ...(Platform.OS === 'web' ? { maxWidth: 500, width: '100%', alignSelf: 'center' as const } : {}),
    },
    planCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.md,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planInfo: { flex: 1 },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
    },
    appleNote: {
      paddingHorizontal: Spacing.xs,
      marginTop: Spacing.xs,
      marginBottom: Spacing.md,
    },
    benefitsCard: {
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    upgradeButton: {
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    upgradeButtonText: {
      color: '#000',
      fontWeight: '700',
      fontSize: 16,
    },
    restoreLink: {
      alignItems: 'center',
      paddingVertical: Spacing.md,
    },
  });
}
