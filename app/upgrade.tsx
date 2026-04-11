/**
 * Upgrade Screen (Paywall)
 * Full-screen route for PocketStubs+ subscription plans.
 *
 * Shows feature comparison, pricing toggle (monthly/yearly),
 * purchase button, restore purchases, and legal links.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme-context';
import { ContentContainer } from '@/components/content-container';
import { usePremium } from '@/hooks/use-premium';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { hapticImpact } from '@/lib/haptics';
import { PREMIUM_FEATURES, type PremiumFeatureKey } from '@/lib/premium-features';
import { analytics } from '@/lib/analytics';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

type PlanPeriod = 'monthly' | 'yearly';

const PLAN_PRICES: Record<PlanPeriod, { price: string; perMonth: string; badge?: string }> = {
  monthly: {
    price: '$2.99/mo',
    perMonth: '$2.99',
  },
  yearly: {
    price: '$19.99/yr',
    perMonth: '$1.67',
    badge: 'Save 44%',
  },
};

/** Features shown in the comparison list, in display order */
const FEATURE_LIST: { key: PremiumFeatureKey; freeValue: string; plusValue: string }[] = [
  { key: 'ad_removal', freeValue: 'Ads shown', plusValue: 'No ads' },
  { key: 'unlimited_scans', freeValue: '3/day', plusValue: '20/day' },
  { key: 'calendar_genre_filter', freeValue: '--', plusValue: 'Included' },
  { key: 'release_reminders', freeValue: '--', plusValue: 'Included' },
  { key: 'advanced_stats', freeValue: 'Basic', plusValue: 'Full suite' },
];

export default function UpgradeScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isPremium, purchasePackage, restorePurchases } = usePremium();
  const { source } = useLocalSearchParams<{ source?: string }>();

  const [selectedPlan, setSelectedPlan] = useState<PlanPeriod>('yearly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    analytics.track('premium:upgrade_view', { source: source ?? 'direct' });
  }, [source]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const handlePurchase = useCallback(async () => {
    hapticImpact();
    setIsPurchasing(true);
    try {
      const packageId = selectedPlan === 'monthly'
        ? 'monthly'
        : 'yearly';

      const result = await purchasePackage(packageId);

      if (result && typeof result === 'object' && 'success' in result && result.success) {
        analytics.track('premium:subscribe', { plan: selectedPlan, trial: false });
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          handleBack();
        }, 2000);
      } else if (result && typeof result === 'object' && 'error' in result && result.error) {
        Toast.show({
          type: 'error',
          text1: 'Purchase failed',
          text2: String(result.error),
          visibilityTime: 3000,
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Purchase failed',
        text2: 'Please check your connection and try again.',
        visibilityTime: 3000,
      });
    } finally {
      setIsPurchasing(false);
    }
  }, [selectedPlan, purchasePackage, handleBack]);

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
        if (result.restored) {
          setTimeout(() => handleBack(), 1500);
        }
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Restore failed',
        text2: 'Please try again later.',
        visibilityTime: 3000,
      });
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases, handleBack]);

  // Already premium -- show confirmation
  if (isPremium) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>PocketStubs+</Text>
        </View>
        <View style={styles.alreadyPremiumContainer}>
          <Ionicons name="checkmark-circle" size={64} color={colors.gold} />
          <Text style={styles.alreadyPremiumTitle}>You have PocketStubs+</Text>
          <Text style={styles.alreadyPremiumMessage}>
            All premium features are unlocked. Enjoy!
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success celebration
  if (showSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={80} color={colors.gold} />
          <Text style={styles.successTitle}>Welcome to PocketStubs+!</Text>
          <Text style={styles.successMessage}>
            All premium features are now unlocked.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ContentContainer>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>PocketStubs+</Text>
        </View>

        {/* Branding */}
        <View style={styles.brandSection}>
          <View style={styles.brandIcon}>
            <Ionicons name="star" size={36} color={colors.gold} />
          </View>
          <Text style={styles.brandTitle}>Upgrade to PocketStubs+</Text>
          <Text style={styles.brandSubtitle}>
            Get the most out of your movie tracking experience
          </Text>
        </View>

        {/* Plan Toggle */}
        <View style={styles.toggleContainer}>
          <Pressable
            style={[
              styles.toggleOption,
              selectedPlan === 'monthly' && styles.toggleOptionActive,
            ]}
            onPress={() => { hapticImpact(); setSelectedPlan('monthly'); }}
          >
            <Text style={[
              styles.toggleOptionText,
              selectedPlan === 'monthly' && styles.toggleOptionTextActive,
            ]}>
              Monthly
            </Text>
            <Text style={[
              styles.togglePrice,
              selectedPlan === 'monthly' && styles.togglePriceActive,
            ]}>
              {PLAN_PRICES.monthly.price}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.toggleOption,
              selectedPlan === 'yearly' && styles.toggleOptionActive,
            ]}
            onPress={() => { hapticImpact(); setSelectedPlan('yearly'); }}
          >
            <View style={styles.toggleOptionHeader}>
              <Text style={[
                styles.toggleOptionText,
                selectedPlan === 'yearly' && styles.toggleOptionTextActive,
              ]}>
                Yearly
              </Text>
              {PLAN_PRICES.yearly.badge && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>{PLAN_PRICES.yearly.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.togglePrice,
              selectedPlan === 'yearly' && styles.togglePriceActive,
            ]}>
              {PLAN_PRICES.yearly.price}
            </Text>
            <Text style={[
              styles.togglePerMonth,
              selectedPlan === 'yearly' && styles.togglePerMonthActive,
            ]}>
              {PLAN_PRICES.yearly.perMonth}/mo
            </Text>
          </Pressable>
        </View>

        {/* Feature Comparison */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresSectionTitle}>What you get</Text>

          {FEATURE_LIST.map(({ key, freeValue, plusValue }) => {
            const feature = PREMIUM_FEATURES[key];
            return (
              <View key={key} style={styles.featureRow}>
                <View style={styles.featureInfo}>
                  <Ionicons
                    name={feature.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={colors.gold}
                  />
                  <Text style={styles.featureLabel}>{feature.label}</Text>
                </View>
                <View style={styles.featureValues}>
                  <Text style={styles.featureFreeValue}>{freeValue}</Text>
                  <Text style={styles.featurePlusValue}>{plusValue}</Text>
                </View>
              </View>
            );
          })}

          {/* Column headers */}
          <View style={styles.featureColumnHeaders}>
            <View style={styles.featureInfo} />
            <View style={styles.featureValues}>
              <Text style={styles.columnHeader}>Free</Text>
              <Text style={[styles.columnHeader, { color: colors.gold }]}>Plus</Text>
            </View>
          </View>
        </View>

        {/* Trial info */}
        <View style={styles.trialBanner}>
          <Ionicons name="time-outline" size={18} color={colors.gold} />
          <Text style={styles.trialBannerText}>
            Start with a 7-day free trial. Cancel anytime.
          </Text>
        </View>

        {/* Purchase CTA */}
        <Pressable
          style={({ pressed }) => [
            styles.purchaseButton,
            { opacity: (pressed || isPurchasing) ? 0.85 : 1 },
          ]}
          onPress={handlePurchase}
          disabled={isPurchasing}
        >
          {isPurchasing ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.purchaseButtonText}>
              Start 7-Day Free Trial
            </Text>
          )}
        </Pressable>

        {/* Restore Purchases */}
        <Pressable
          style={({ pressed }) => [
            styles.restoreButton,
            { opacity: (pressed || isRestoring) ? 0.6 : 1 },
          ]}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </Pressable>

        {/* Legal */}
        <View style={styles.legalSection}>
          <Text style={styles.legalText}>
            Payment will be charged to your account at confirmation of purchase.
            Subscription automatically renews unless auto-renew is turned off at
            least 24 hours before the end of the current period.
          </Text>
          <View style={styles.legalLinks}>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/terms')}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={styles.legalLink}>Terms of Service</Text>
            </Pressable>
            <Text style={styles.legalDivider}>|</Text>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync('https://pocketstubs.com/privacy')}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
        </ContentContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      paddingHorizontal: Spacing.md,
      paddingTop: Platform.OS === 'web' ? Spacing.md : undefined,
      marginBottom: Spacing.lg,
    },
    headerTitle: {
      ...Typography.display.h4,
      color: colors.text,
    },

    // Branding
    brandSection: {
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.xl,
    },
    brandIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.gold + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    brandTitle: {
      ...Typography.display.h2,
      color: colors.text,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    brandSubtitle: {
      ...Typography.body.base,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    // Plan toggle
    toggleContainer: {
      flexDirection: 'row',
      marginHorizontal: Spacing.md,
      gap: Spacing.sm,
      marginBottom: Spacing.xl,
    },
    toggleOption: {
      flex: 1,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
    },
    toggleOptionActive: {
      borderColor: colors.gold,
      backgroundColor: colors.gold + '10',
    },
    toggleOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    toggleOptionText: {
      ...Typography.body.baseMedium,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    toggleOptionTextActive: {
      color: colors.text,
    },
    togglePrice: {
      ...Typography.display.h4,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    togglePriceActive: {
      color: colors.text,
    },
    togglePerMonth: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      marginTop: 2,
    },
    togglePerMonthActive: {
      color: colors.textSecondary,
    },
    savingsBadge: {
      backgroundColor: colors.gold,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.full,
    },
    savingsBadgeText: {
      ...Typography.body.xs,
      color: '#000',
      fontWeight: '700',
    },

    // Features
    featuresSection: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.lg,
      backgroundColor: colors.card,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    featuresSectionTitle: {
      ...Typography.body.lg,
      color: colors.text,
      fontWeight: '700',
      marginBottom: Spacing.md,
    },
    featureColumnHeaders: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: Spacing.sm,
      // Move headers to the top visually via negative margin + absolute positioning
      position: 'absolute',
      top: Spacing.md + 26, // below section title
      left: Spacing.md,
      right: Spacing.md,
    },
    columnHeader: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      fontWeight: '600',
      textTransform: 'uppercase',
      width: 60,
      textAlign: 'center',
    },
    featureRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    featureInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flex: 1,
    },
    featureLabel: {
      ...Typography.body.sm,
      color: colors.text,
      fontWeight: '500',
    },
    featureValues: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    featureFreeValue: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      width: 60,
      textAlign: 'center',
    },
    featurePlusValue: {
      ...Typography.body.xs,
      color: colors.gold,
      fontWeight: '600',
      width: 60,
      textAlign: 'center',
    },

    // Trial banner
    trialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.lg,
      padding: Spacing.md,
      backgroundColor: colors.gold + '10',
      borderRadius: BorderRadius.md,
    },
    trialBannerText: {
      ...Typography.body.sm,
      color: colors.gold,
      fontWeight: '500',
      flex: 1,
    },

    // Purchase button
    purchaseButton: {
      marginHorizontal: Spacing.md,
      height: 56,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    purchaseButtonText: {
      color: '#000',
      fontSize: 17,
      fontWeight: '700',
    },

    // Restore
    restoreButton: {
      alignSelf: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.xl,
    },
    restoreButtonText: {
      ...Typography.body.sm,
      color: colors.textSecondary,
      fontWeight: '500',
    },

    // Legal
    legalSection: {
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.xl,
    },
    legalText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: Spacing.sm,
    },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    legalLink: {
      ...Typography.body.xs,
      color: colors.tint,
      fontWeight: '500',
    },
    legalDivider: {
      ...Typography.body.xs,
      color: colors.textTertiary,
    },

    // Already premium
    alreadyPremiumContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
    },
    alreadyPremiumTitle: {
      ...Typography.display.h3,
      color: colors.text,
      marginTop: Spacing.md,
      textAlign: 'center',
    },
    alreadyPremiumMessage: {
      ...Typography.body.base,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
      textAlign: 'center',
    },

    // Success
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
    },
    successTitle: {
      ...Typography.display.h2,
      color: colors.gold,
      marginTop: Spacing.md,
      textAlign: 'center',
    },
    successMessage: {
      ...Typography.body.base,
      color: colors.textSecondary,
      marginTop: Spacing.sm,
      textAlign: 'center',
    },
  });
}
